"""RAG + Hindsight memory API (Postgres + Qdrant Cloud). Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT"""
import io, os, uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv("../.env"); load_dotenv()
import psycopg
from psycopg.rows import dict_row
from docx import Document
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from hindsight_client import Hindsight
from openai import OpenAI
from pydantic import BaseModel, Field
from pypdf import PdfReader
from qdrant_client import QdrantClient, models

REQUIRED = ("LLM_API_KEY", "HINDSIGHT_BASE_URL", "DATABASE_URL", "QDRANT_URL", "QDRANT_API_KEY", "FRONTEND_URL")
missing = [k for k in REQUIRED if not os.getenv(k)]
if missing: raise RuntimeError(f"Missing environment variables: {missing}")
BANK, MODEL = os.getenv("HINDSIGHT_BANK_ID", "demo-user"), os.getenv("LLM_MODEL", "gpt-4o-mini")
EMBED, DIM, COL = os.getenv("EMBED_MODEL", "text-embedding-3-small"), int(os.getenv("EMBED_DIM", "1536")), "docs"
MAX_MB, EXTS = 10, {".pdf", ".txt", ".docx"}

llm = OpenAI(api_key=os.environ["LLM_API_KEY"], base_url=os.getenv("LLM_BASE_URL"), max_retries=5)
hs = Hindsight(base_url=os.environ["HINDSIGHT_BASE_URL"], api_key=os.getenv("HINDSIGHT_API_KEY") or None)
qd = QdrantClient(url=os.environ["QDRANT_URL"], api_key=os.environ["QDRANT_API_KEY"])
if not qd.collection_exists(COL):
    qd.create_collection(COL, vectors_config=models.VectorParams(size=DIM, distance=models.Distance.COSINE))
    qd.create_payload_index(COL, "doc_id", models.PayloadSchemaType.KEYWORD)

import asyncio
def _hs(method: str, **kw):
    """Run an async Hindsight call in its own event loop (safe inside FastAPI worker threads)."""
    async def go():
        c = Hindsight(base_url=os.environ["HINDSIGHT_BASE_URL"], api_key=os.getenv("HINDSIGHT_API_KEY") or None)
        try: return await getattr(c, method)(**kw)
        finally:
            try: c.close()
            except Exception: pass
    return asyncio.run(go())
def db(): return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)  # `with db() as c` commits + closes
with db() as c:
    c.execute("""
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, title TEXT, created TEXT);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, conv TEXT, role TEXT, content TEXT, created TEXT, recalled INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, name TEXT, status TEXT, chunks INT, created TEXT);
    CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY, message TEXT, value INT, created TEXT);""")
now = lambda: datetime.now(timezone.utc).isoformat()
def embed(texts: list[str]) -> list[list[float]]:
    return [d.embedding for d in llm.embeddings.create(model=EMBED, input=texts).data]

app = FastAPI(title="AI Memory RAG API")
ORIGINS = [o.strip().rstrip("/") for o in (os.environ["FRONTEND_URL"] + "," + os.getenv("CORS_ORIGINS", "")).split(",") if o.strip() and o.strip() != "*"]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception):
    print("Unhandled:", repr(exc))  # log server-side only; never leak details/secrets
    return JSONResponse({"detail": "Internal server error"}, status_code=500)

@app.get("/health")
def health(): return {"status": "healthy", "service": "AI Memory RAG API"}

class ChatIn(BaseModel):
    conversation_id: str
    message: str = Field(min_length=1, max_length=4000)
    use_memory: bool = True   # False = "traditional RAG" for the comparison view
class FeedbackIn(BaseModel):
    message_id: str
    value: int = Field(ge=-1, le=1)

# ---------------------------------------------------------------------------
# Selective long-term memory
# ---------------------------------------------------------------------------
# Hindsight is a long-term memory system, not a context dump.  We first decide
# whether the current request can benefit from information from past chats.
# This avoids recalling unrelated memories for greetings, generic questions,
# document-only questions, etc.
MEMORY_EXPLICIT = (
    "remember", "do you recall", "do you remember", "previous conversation",
    "our previous", "earlier conversation", "last conversation", "last time",
    "yesterday", "before", "previously", "we discussed", "we talked about",
    "you told me", "i told you", "i mentioned", "what did i say",
    "what did i tell", "continue our", "continue the", "pick up where",
    "as we decided", "like we decided", "based on our", "from our chats",
    "from our conversations", "my past", "my history", "my previous"
)
MEMORY_PERSONAL = (
    "my preference", "my preferences", "my goal", "my goals", "my project",
    "my projects", "my plan", "my plans", "my exam", "my exams", "my studies",
    "my career", "my college", "my resume", "my background", "my interests",
    "my skills", "my experience", "my usual", "what should i", "help me decide",
    "for me", "personalize", "personalised", "personalized", "tailor",
    "what do you know about me", "about me"
)
MEMORY_ACTION = (
    "continue", "again", "same project", "same plan", "my earlier", "my previous",
    "keep working", "continue working", "continue from"
)
GENERIC_ONLY = (
    "hi", "hello", "hey", "hii", "hiii", "hiiii", "yo", "sup",
    "good morning", "good afternoon", "good evening", "good night",
    "thanks", "thank you", "ok", "okay", "cool", "nice", "bye"
)

def _normalize(q: str) -> str:
    return " ".join(q.lower().strip().split())

def memory_decision(q: str) -> tuple[bool, str]:
    """Return (should_recall, reason) without making another LLM call."""
    s = _normalize(q)
    if s in GENERIC_ONLY or len(s) <= 4 and not any(p in s for p in MEMORY_EXPLICIT):
        return False, "no_memory_needed"
    if any(p in s for p in MEMORY_EXPLICIT):
        return True, "past_context_requested"
    if any(p in s for p in MEMORY_PERSONAL):
        return True, "personal_context_may_help"
    if any(p in s for p in MEMORY_ACTION):
        # Only use these ambiguous action words when the request is clearly
        # about the user's work/context rather than a generic tutorial.
        personal_markers = ("my ", "our ", "we ", "i ", "this project", "this plan")
        if any(m in s for m in personal_markers):
            return True, "continuation_context"
    return False, "general_knowledge_or_rag"

def should_retain_memory(q: str) -> bool:
    """Do not store every chat turn; retain likely durable user context only."""
    s = _normalize(q)
    if s in GENERIC_ONLY or len(s) < 15:
        return False
    durable = (
        "remember that", "don't forget", "my name is", "i am ", "i'm ",
        "i prefer", "i like", "i dislike", "i hate", "my goal", "my plan",
        "my project", "i'm working on", "i am working on", "my exam",
        "my career", "my college", "my skills", "my preference", "i want to",
        "i need to", "we decided", "my deadline", "my resume"
    )
    return any(p in s for p in durable)

def recall_memories(q: str) -> list[dict]:
    """Recall a small, ranked set of long-term memories for an explicit memory request."""
    r = _hs("arecall", bank_id=BANK, query=q)
    results = list(getattr(r, "results", r) or [])
    memories = []
    for m in results[:8]:
        text = getattr(m, "text", None) or str(m)
        if not text.strip():
            continue
        memories.append({
            "text": text,
            "type": getattr(m, "type", "memory"),
            "score": getattr(m, "score", None),
        })
    # Hindsight already ranks recall results. Keep only a small top set so the
    # model does not receive an unrelated context dump. If scores are exposed,
    # preserve that ranking; otherwise keep Hindsight's native order.
    memories.sort(key=lambda x: x["score"] if isinstance(x.get("score"), (int, float)) else -1, reverse=True)
    return memories[:3]

def rag_decision(q: str) -> tuple[bool, str]:
    """Decide whether the user is explicitly asking about uploaded knowledge."""
    s = _normalize(q)
    document_markers = (
        "uploaded", "upload", "document", "file", "pdf", "docx", "attachment",
        "assignment", "notes", "slides", "chapter", "page", "from the file",
        "from the document", "from my notes", "in the document", "in the file",
        "this file", "this document", "this assignment", "the pdf", "the docx"
    )
    return (any(p in s for p in document_markers), "document_context_requested" if any(p in s for p in document_markers) else "general_knowledge")

@app.post("/api/conversations")
def new_conv():
    cid = str(uuid.uuid4())
    with db() as c: c.execute("INSERT INTO conversations VALUES(%s,%s,%s)", (cid, "New chat", now()))
    return {"id": cid}

@app.get("/api/conversations")
def list_convs():
    with db() as c: return [dict(r) for r in c.execute("SELECT * FROM conversations ORDER BY created DESC")]

@app.post("/api/chat")
def chat(body: ChatIn):
    q, warnings = body.message.strip(), []
    if not q: raise HTTPException(400, "Empty query")
    with db() as c:
        hist = [dict(r) for r in c.execute("SELECT role,content FROM messages WHERE conv=%s ORDER BY created DESC LIMIT 6", (body.conversation_id,))][::-1]
    memories: list[dict] = []
    memory_used, memory_reason = False, "disabled"
    if body.use_memory:
        memory_used, memory_reason = memory_decision(q)
        if memory_used:
            try:
                memories = recall_memories(q)
                memory_used = bool(memories)
                if not memory_used:
                    memory_reason = "no_relevant_memory_found"
            except Exception as e:
                memory_used = False
                memory_reason = "memory_service_unavailable"
                warnings.append("Hindsight recall temporarily unavailable; continuing without long-term memory.")
    rag_used, rag_reason = rag_decision(q)
    sources: list[dict] = []
    if rag_used:
        try:
            pts = qd.query_points(COL, query=embed([q])[0], limit=4).points
            sources = [{"doc": p.payload["doc"], "text": p.payload["text"]} for p in pts]
        except Exception as e:
            warnings.append("Document search temporarily unavailable; continuing without document context.")
            rag_used = False
            rag_reason = "vector_search_unavailable"
    system = (
        "You are a helpful assistant. Answer the user's current question directly. "
        "Use DOCUMENT CONTEXT only when it is provided and clearly relevant. "
        "Use MEMORIES only when they are provided and clearly relevant. "
        "Never mention or infer old user information merely because it exists in memory. "
        "For a greeting or generic knowledge question, answer normally without personalizing.\n\n"
        "MEMORIES:\n" + ("\n".join(f"- {m['text']}" for m in memories) or "(none)") +
        "\n\nDOCUMENT CONTEXT:\n" + ("\n---\n".join(f"[{s['doc']}] {s['text']}" for s in sources) or "(none)")
    )
    try:
        out = llm.chat.completions.create(model=MODEL, messages=[{"role": "system", "content": system}, *hist, {"role": "user", "content": q}])
        answer = out.choices[0].message.content or ""
    except Exception as e: raise HTTPException(502, f"LLM error: {e}")
    mid = str(uuid.uuid4())
    with db() as c:
        c.execute("INSERT INTO messages VALUES(%s,%s,%s,%s,%s,0)", (str(uuid.uuid4()), body.conversation_id, "user", q, now()))
        c.execute("INSERT INTO messages VALUES(%s,%s,%s,%s,%s,%s)", (mid, body.conversation_id, "assistant", answer, now(), len(memories)))
        if not hist: c.execute("UPDATE conversations SET title=%s WHERE id=%s", (q[:40], body.conversation_id))
    # Retain durable user context, not every conversational turn. This keeps
    # Hindsight useful over time and prevents greetings/noise from polluting memory.
    retained = False
    if body.use_memory and should_retain_memory(q):
        try:
            _hs("aretain", bank_id=BANK, content=q, context="durable user context from chat")
            retained = True
        except Exception:
            warnings.append("Hindsight learning temporarily unavailable; the answer was still completed.")
    return {
        "message_id": mid, "answer": answer, "memories": memories,
        "memory_used": memory_used, "memory_reason": memory_reason,
        "memory_retained": retained, "rag_used": rag_used, "rag_reason": rag_reason,
        "sources": sources, "warnings": warnings,
        "created": now()
    }

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in EXTS: raise HTTPException(400, "Only PDF, TXT, DOCX allowed")
    data = await file.read()
    if len(data) > MAX_MB * 1024 * 1024: raise HTTPException(413, f"File over {MAX_MB} MB")
    try:
        if ext == ".pdf": text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)
        elif ext == ".docx": text = "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)
        else: text = data.decode("utf-8", errors="ignore")
    except Exception as e: raise HTTPException(422, f"Could not read file: {e}")
    if not text.strip(): raise HTTPException(422, "No extractable text")
    chunks = [text[i:i + 900] for i in range(0, len(text), 700)][:400]
    did, name = str(uuid.uuid4()), os.path.basename(file.filename or "file")
    try:
        for i in range(0, len(chunks), 64):
            part = chunks[i:i + 64]
            qd.upsert(COL, points=[models.PointStruct(id=str(uuid.uuid4()), vector=v, payload={"doc_id": did, "doc": name, "text": t})
                                   for v, t in zip(embed(part), part)])
    except Exception as e: raise HTTPException(502, f"Indexing failed: {e}")
    with db() as c: c.execute("INSERT INTO documents VALUES(%s,%s,%s,%s,%s)", (did, name, "indexed", len(chunks), now()))
    return {"id": did, "name": name, "status": "indexed", "chunks": len(chunks)}

@app.get("/api/documents")
def docs():
    with db() as c: return [dict(r) for r in c.execute("SELECT * FROM documents ORDER BY created DESC")]

@app.delete("/api/documents/{doc_id}")
def del_doc(doc_id: str):
    qd.delete(COL, points_selector=models.FilterSelector(filter=models.Filter(
        must=[models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id))])))
    with db() as c: c.execute("DELETE FROM documents WHERE id=%s", (doc_id,))
    return {"ok": True}

@app.get("/api/memories/search")
@app.get("/api/memories")
def memories(q: str = "user preferences, goals, projects and facts"):
    try: return recall_memories(q)
    except Exception as e: raise HTTPException(502, f"Hindsight error: {e}")

@app.post("/api/feedback")
def feedback(f: FeedbackIn):
    with db() as c:
        row = c.execute("SELECT content FROM messages WHERE id=%s", (f.message_id,)).fetchone()
        if not row: raise HTTPException(404, "Message not found")
        c.execute("INSERT INTO feedback VALUES(%s,%s,%s,%s)", (str(uuid.uuid4()), f.message_id, f.value, now()))
    verdict = "helpful" if f.value > 0 else "not helpful"
    try:  # feedback becomes a memory, so future answers adapt
        _hs("aretain", bank_id=BANK, content=f"The user rated this assistant answer as {verdict}: \"{row['content'][:300]}\"", context="user feedback")
    except Exception as e: raise HTTPException(502, f"Hindsight error: {e}")
    return {"ok": True}

@app.get("/api/stats")
def stats():
    with db() as c:
        one = lambda s: c.execute(s).fetchone()["n"] or 0
        return {"conversations": one("SELECT COUNT(*) AS n FROM conversations"), "documents": one("SELECT COUNT(*) AS n FROM documents"),
                "queries": one("SELECT COUNT(*) AS n FROM messages WHERE role='assistant'"), "memories_recalled": one("SELECT SUM(recalled) AS n FROM messages"),
                "feedback_up": one("SELECT COUNT(*) AS n FROM feedback WHERE value>0"), "feedback_down": one("SELECT COUNT(*) AS n FROM feedback WHERE value<0")}
