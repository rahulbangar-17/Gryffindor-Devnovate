import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

async function call(path: string, init?: RequestInit) {
  const r = await fetch(API + path, init).catch(() => { throw new Error("Cannot reach backend"); });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ detail: r.statusText }))).detail);
  return r.json();
}

const post = (p: string, b: unknown) => call(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

type Mem = { text: string; type: string };
type Src = { doc: string; text: string };
type Msg = { id?: string; role: "user" | "ai"; content: string; time: string; memories?: Mem[]; sources?: Src[]; plain?: string; fb?: number };
type Doc = { id: string; name: string; status: string; chunks: number; created: string };
type Stats = Record<string, number>;

const t = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const SUGGEST = [
  ["Memory", "What do you remember about me?"],
  ["RAG", "Explain RAG using what you know about me"],
  ["Plan", "Give me a study plan based on my goals"],
  ["Project", "Help me improve my AI project"],
];

function Logo({ small = false }: { small?: boolean }) {
  return <div className={small ? "brand-mark small" : "brand-mark"}><span>H</span><i /></div>;
}

function Badge({ children, tone = "purple" }: { children: React.ReactNode; tone?: "purple" | "cyan" | "green" | "gray" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Chat({ onMemoryCount }: { onMemoryCount: (n: number) => void }) {
  const [cid, setCid] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [compare, setCompare] = useState(false);
  const [selectedFile, setSelectedFile] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [activity, setActivity] = useState("Ready");
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    post("/api/conversations", {}).then(r => setCid(r.id)).catch(e => setErr(e.message));
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true); setErr(""); setActivity("Indexing document…");
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await call("/api/upload", { method: "POST", body: fd });
      setSelectedFile(r); setActivity("Document indexed");
    } catch (e: any) { setErr(e.message); setActivity("Upload failed"); }
    finally { setUploading(false); }
  };

  const send = async (override?: string) => {
    const q = (override ?? text).trim(); if (!q || busy || !cid) return;
    setText(""); setBusy(true); setErr(""); setActivity("Recalling memory…");
    setMsgs(m => [...m, { role: "user", content: q, time: t() }]);
    try {
      let plain: string | undefined;
      if (compare) { setActivity("Running traditional RAG…"); plain = (await post("/api/chat", { conversation_id: cid, message: q, use_memory: false })).answer; }
      setActivity("Searching documents + Hindsight…");
      const r = await post("/api/chat", { conversation_id: cid, message: q, use_memory: true });
      setMsgs(m => [...m, { id: r.message_id, role: "ai", content: r.answer, time: t(), memories: r.memories, sources: r.sources, plain }]);
      onMemoryCount(r.memories?.length || 0);
      setActivity("Response ready");
      if (r.warnings?.length) setErr(r.warnings.join(" | "));
      setSelectedFile(null);
    } catch (e: any) { setErr(e.message); setActivity("Something went wrong"); }
    finally { setBusy(false); }
  };

  const rate = async (i: number, v: number) => {
    try { await post("/api/feedback", { message_id: msgs[i].id, value: v }); setMsgs(m => m.map((x, j) => j === i ? { ...x, fb: v } : x)); }
    catch (e: any) { setErr(e.message); }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  return <div className="chat-shell">
    <div className="chat-topbar">
      <div><div className="eyebrow">CONVERSATION</div><h1>Memory workspace</h1></div>
      <div className="top-actions"><Badge tone="green"><span className="pulse" /> System online</Badge><button className="ghost-btn" onClick={() => setShowContext(v => !v)}>{showContext ? "Hide context" : "Show context"}</button></div>
    </div>

    <div className="workspace">
      <section className="conversation">
        {!msgs.length && <div className="welcome">
          <div className="orb"><Logo /></div>
          <div className="eyebrow">PERSISTENT AI MEMORY</div>
          <h2>Your AI that remembers.</h2>
          <p>Ask a question, upload a document, or give Hindsight a piece of context it can use later.</p>
          <div className="suggest-grid">{SUGGEST.map(([label, q]) => <button key={q} className="suggest" onClick={() => send(q)}><span>{label}</span><b>{q}</b><i>↗</i></button>)}</div>
        </div>}

        <div className="message-list">
          {msgs.map((m, i) => m.role === "user" ? <div key={i} className="message user-message"><div className="user-bubble">{m.content}</div><div className="time right">{m.time}</div></div> :
            <div key={i} className="message ai-message">
              <div className="avatar"><Logo small /></div>
              <div className="answer-wrap">
                {!!m.memories?.length && <div className="memory-pill"><span>✦</span> {m.memories.length} memories recalled</div>}
                {m.plain !== undefined ? <div className="compare-grid"><div className="answer-card"><div className="card-label">TRADITIONAL RAG</div>{m.plain}</div><div className="answer-card highlighted"><div className="card-label">HINDSIGHT + RAG</div>{m.content}</div></div> : <div className="answer-text">{m.content}</div>}
                <div className="answer-meta"><span>{m.time}</span><div className="feedback"><button className={m.fb === 1 ? "active" : ""} onClick={() => rate(i, 1)}>↑</button><button className={m.fb === -1 ? "active" : ""} onClick={() => rate(i, -1)}>↓</button></div></div>
                <details className="why-panel"><summary><span>⌁</span> Why did Hindsight answer this way?</summary><div className="why-grid">
                  <div><div className="why-title">Memory context</div>{m.memories?.length ? m.memories.map((x, k) => <p key={k}>• {x.text}</p>) : <span className="muted">No memory recalled</span>}</div>
                  <div><div className="why-title">Retrieved knowledge</div>{m.sources?.length ? m.sources.map((x, k) => <p key={k}>• <b>{x.doc}</b> — {x.text.slice(0, 120)}…</p>) : <span className="muted">No document context</span>}</div>
                </div></details>
              </div>
            </div>)}
          {busy && <div className="message ai-message"><div className="avatar"><Logo small /></div><div className="typing"><span /><span /><span /><em>{activity}</em></div></div>}
          {err && <div className="error-banner">⚠ {err}</div>}
          <div ref={end} />
        </div>
      </section>

      {showContext && <aside className="context-panel">
        <div className="panel-heading"><span>LIVE CONTEXT</span><i>●</i></div>
        <div className="context-card accent-purple"><div className="context-icon">🧠</div><div><strong>Hindsight memory</strong><small>{msgs.length ? "Active in this conversation" : "Waiting for your first question"}</small></div><Badge>{msgs.reduce((n, m) => n + (m.memories?.length || 0), 0)} recalled</Badge></div>
        <div className="context-card accent-cyan"><div className="context-icon">◈</div><div><strong>Vector retrieval</strong><small>Qdrant knowledge search</small></div><Badge tone="cyan">Ready</Badge></div>
        <div className="context-card"><div className="context-icon">✦</div><div><strong>Learning loop</strong><small>Feedback becomes memory</small></div><Badge tone="green">On</Badge></div>
        <div className="activity-card"><div className="panel-heading"><span>AGENT ACTIVITY</span></div><div className="activity-line"><i className="done">✓</i><span>Conversation context</span></div><div className="activity-line"><i className={activity.includes("memory") ? "live" : "done"}>{activity.includes("memory") ? "•" : "✓"}</i><span>Hindsight recall</span></div><div className="activity-line"><i className={activity.includes("document") || activity.includes("RAG") ? "live" : "done"}>{activity.includes("document") || activity.includes("RAG") ? "•" : "✓"}</i><span>Vector retrieval</span></div><div className="activity-line"><i className={!busy ? "done" : "live"}>{!busy ? "✓" : "•"}</i><span>LLM generation</span></div></div>
        <div className="mini-note"><span>TIP</span><p>Upload a document from the composer, then ask a question about it. The file is indexed into your RAG knowledge base.</p></div>
      </aside>}
    </div>

    <div className="composer-wrap">
      {selectedFile && <div className="attachment"><span>📄</span><div><strong>{selectedFile.name}</strong><small>{selectedFile.chunks} chunks · indexed</small></div><button onClick={() => setSelectedFile(null)}>×</button></div>}
      <div className="composer">
        <input ref={fileRef} type="file" hidden accept=".pdf,.txt,.docx" onChange={(e: ChangeEvent<HTMLInputElement>) => upload(e.target.files?.[0])} />
        <button className="attach-btn" title="Attach PDF, TXT or DOCX" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "…" : "＋"}</button>
        <input value={text} placeholder="Ask Hindsight anything…" onChange={e => setText(e.target.value)} onKeyDown={onKey} />
        <button className={`memory-toggle ${compare ? "off" : ""}`} onClick={() => setCompare(v => !v)} title="Toggle comparison mode"><span>✦</span>{compare ? "Compare" : "Memory ON"}</button>
        <button className="send-btn" disabled={busy || !text.trim()} onClick={() => send()}>↑</button>
      </div>
      <div className="composer-foot"><span>{activity}</span><label><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Compare with traditional RAG</label><button onClick={() => { setMsgs([]); setErr(""); }}>Clear chat</button></div>
    </div>
  </div>;
}

function Memory() {
  const [q, setQ] = useState(""); const [items, setItems] = useState<Mem[]>([]); const [err, setErr] = useState("");
  const load = () => call("/api/memories/search" + (q ? `?q=${encodeURIComponent(q)}` : "")).then(r => { setItems(r); setErr(""); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  return <div className="page"><div className="page-inner"><div className="page-hero"><div className="eyebrow">LONG-TERM CONTEXT</div><h2>Memory Explorer</h2><p>See the information Hindsight has retained and search the memory bank in real time.</p></div>
    <div className="searchbar"><span>⌕</span><input value={q} placeholder="Search memories, goals, projects…" onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} /><button onClick={load}>Search</button></div>
    {err && <div className="error-banner">⚠ {err}</div>}
    <div className="section-label">RECALLED MEMORY · {items.length}</div>
    {!items.length && !err && <div className="empty-card"><div>🧠</div><strong>No memories found</strong><span>Chat with the agent and Hindsight will start building persistent context.</span></div>}
    <div className="memory-list">{items.map((m, i) => <div className="memory-card" key={i}><div className="memory-node">{String(i + 1).padStart(2, "0")}</div><div className="grow"><div className="memory-type">{m.type || "memory"}</div><p>{m.text}</p></div><span className="memory-arrow">↗</span></div>)}</div>
  </div></div>;
}

function Network() {
  const [items, setItems] = useState<Mem[]>([]); const [err, setErr] = useState("");
  useEffect(() => { call("/api/memories").then(setItems).catch(e => setErr(e.message)); }, []);
  const nodes = useMemo(() => items.slice(0, 9), [items]);
  return <div className="page"><div className="page-inner"><div className="page-hero"><div className="eyebrow">MEMORY GRAPH</div><h2>Memory Network</h2><p>A visual map of the context Hindsight can surface for the agent.</p></div>
    {err && <div className="error-banner">⚠ {err}</div>}
    <div className="network-card"><div className="network-grid" />
      <div className="network-center"><Logo /><span>HINDSIGHT</span><small>memory bank</small></div>
      {nodes.length ? nodes.map((n, i) => { const angle = (i / nodes.length) * Math.PI * 2; const x = 50 + Math.cos(angle) * 35; const y = 50 + Math.sin(angle) * 34; return <div className="network-node" key={i} style={{ left: `${x}%`, top: `${y}%` }}><i /><strong>{n.type || "memory"}</strong><span>{n.text.slice(0, 54)}{n.text.length > 54 ? "…" : ""}</span></div>; }) : <div className="network-empty">Start chatting to populate the memory network.</div>}
    </div>
  </div></div>;
}

function Docs() {
  const [docs, setDocs] = useState<Doc[]>([]); const [err, setErr] = useState("");
  const load = () => call("/api/documents").then(setDocs).catch(e => setErr(e.message)); useEffect(() => { load(); }, []);
  const del = async (id: string) => { try { await call(`/api/documents/${id}`, { method: "DELETE" }); load(); } catch (e: any) { setErr(e.message); } };
  return <div className="page"><div className="page-inner"><div className="page-hero"><div className="eyebrow">VECTOR KNOWLEDGE</div><h2>Knowledge Base</h2><p>Documents indexed into Qdrant and ready for retrieval. Uploading still happens directly from the chat composer.</p></div>
    {err && <div className="error-banner">⚠ {err}</div>}
    <div className="doc-banner"><div className="doc-icon">⌁</div><div><strong>Documents are uploaded from the chat box</strong><span>Use the ＋ button beside the message field to index PDF, TXT or DOCX files.</span></div></div>
    <div className="section-label">INDEXED DOCUMENTS · {docs.length}</div>
    {docs.map(d => <div className="document-card" key={d.id}><div className="file-icon">PDF</div><div className="grow"><strong>{d.name}</strong><span>{d.chunks} chunks · {d.status}</span></div><Badge tone="green">Indexed</Badge><button className="danger-btn" onClick={() => del(d.id)}>Delete</button></div>)}
    {!docs.length && <div className="empty-card"><div>◈</div><strong>Your knowledge base is empty</strong><span>Attach a document in chat to start building your private RAG context.</span></div>}
  </div></div>;
}

function Stats() {
  const [s, setS] = useState<Stats>({});
  useEffect(() => { call("/api/stats").then(setS).catch(() => {}); }, []);
  const cards = [
    ["conversations", "Conversations", "◌"], ["documents", "Indexed documents", "▧"], ["queries", "AI responses", "✦"], ["memories_recalled", "Memories recalled", "🧠"], ["feedback_up", "Helpful answers", "↑"], ["feedback_down", "Needs improvement", "↓"],
  ];
  const total = Math.max(1, s.queries || 1);
  return <div className="page"><div className="page-inner"><div className="page-hero"><div className="eyebrow">SYSTEM INTELLIGENCE</div><h2>Learning Dashboard</h2><p>Observe how conversations, retrieval, memory and feedback are being used by your agent.</p></div>
    <div className="stat-grid">{cards.map(([key, label, icon]) => <div className="stat-card" key={key}><div className="stat-icon">{icon}</div><div className="stat-value">{s[key] ?? 0}</div><div className="stat-label">{label}</div></div>)}</div>
    <div className="analytics-grid"><div className="chart-card"><div className="panel-heading"><span>FEEDBACK SIGNAL</span><Badge tone="cyan">Live data</Badge></div><div className="bar-chart"><div className="bar-col"><i style={{ height: `${Math.min(100, ((s.feedback_up || 0) / total) * 100)}%` }} /><span>Helpful</span></div><div className="bar-col"><i style={{ height: `${Math.min(100, ((s.feedback_down || 0) / total) * 100)}%` }} /><span>Needs work</span></div><div className="bar-col"><i style={{ height: `${Math.min(100, ((s.memories_recalled || 0) / Math.max(total, 1)) * 100)}%` }} /><span>Memory use</span></div></div></div>
      <div className="chart-card"><div className="panel-heading"><span>AGENT PIPELINE</span><Badge tone="green">Operational</Badge></div><div className="pipeline"><span>Question</span><b>→</b><span>Memory</span><b>→</b><span>RAG</span><b>→</b><span>LLM</span></div><p className="muted">The application combines persistent Hindsight memory with Qdrant retrieval before generating the final answer.</p></div></div>
  </div></div>;
}

const NAV: [string, string, string][] = [["chat", "Chat", "⌁"], ["memory", "Memory", "🧠"], ["network", "Memory network", "◎"], ["docs", "Knowledge base", "▧"], ["stats", "Analytics", "◒"]];

export default function App() {
  const [tab, setTab] = useState("chat"); const [key, setKey] = useState(0); const [memCount, setMemCount] = useState(0);
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-row"><Logo /><div><strong>HINDSIGHT</strong><span>MEMORY AI</span></div></div>
      <button className="new-chat" onClick={() => { setKey(k => k + 1); setTab("chat"); }}><span>＋</span> New conversation</button>
      <div className="nav-label">WORKSPACE</div>
      <nav>{NAV.map(([k, l, icon]) => <button key={k} className={tab === k ? "nav-item active" : "nav-item"} onClick={() => setTab(k)}><span>{icon}</span>{l}{k === "memory" && memCount > 0 && <em>{memCount}</em>}</button>)}</nav>
      <div className="sidebar-status"><span className="status-dot" /><div><strong>AI SYSTEM ONLINE</strong><small>RAG · Hindsight · Qdrant</small></div></div>
      <div className="side-bottom"><span>Built for the Hindsight challenge</span><b>v2.0</b></div>
    </aside>
    <main className="main-shell">
      {tab === "chat" && <Chat onMemoryCount={setMemCount} />}
      {tab === "memory" && <Memory />}
      {tab === "network" && <Network />}
      {tab === "docs" && <Docs />}
      {tab === "stats" && <Stats />}
    </main>
  </div>;
}
