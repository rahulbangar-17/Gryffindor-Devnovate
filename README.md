# On-Call Copilot

**An incident response agent that gets smarter every time it sees a new incident — powered by [Hindsight](https://hindsight.vectorize.io/) agent memory.**

Built for HackwithHyderabad 3.0 — Problem Statement: *AI Agents That Learn Using Hindsight*

---

## 1. Problem

On-call engineers waste hours re-diagnosing incidents that have happened before. Tribal knowledge about "how we fixed this last time" lives in Slack threads, someone's memory, or nowhere at all. A junior engineer paged at 3 AM has none of that context.

Most AI on-call assistants are stateless — they can summarize a runbook or suggest generic fixes, but they don't *remember your actual incident history*. Every incident is treated like the first one they've ever seen.

**On-Call Copilot** is different: it retains every resolved incident, recalls the closest matches when a new one comes in, and reflects on patterns across incidents to form opinions about *why* specific services keep failing — surfacing that insight proactively, not just on request.

---

## 2. What It Does

1. An engineer describes a live incident (symptoms, affected service, error signature).
2. The agent **recalls** past incidents with similar symptoms or the same service, and surfaces what fix worked, how long it took, and which runbook was used.
3. Once an incident is resolved, the agent **retains** it — root cause, fix, runbook, resolution time.
4. After enough incidents accumulate for a service, the agent **reflects** and forms an opinion (e.g. *"payments-api tends to fail under high load due to connection pool exhaustion"*) — and mentions that pattern unprompted the next time a related incident comes in.

The core demo moment: the **same type of incident**, asked twice — once with no memory (generic, slow answer) and once after the agent has seen it before (specific, fast, confident answer, referencing the actual past incident).

---

## 3. Why Memory Is Central (Not Bolted On)

This is explicitly 25% of the judging criteria, so the architecture is built around it rather than around it being a feature added at the end.

| Hindsight Memory Type | What We Store In It |
|---|---|
| **World** (facts) | Service names, owners, dependency map, known runbook links |
| **Experience** (actions/outcomes) | Each incident: symptoms → diagnosis steps taken → fix applied → outcome |
| **Opinion** (confidence-scored beliefs) | Learned patterns like "service X fails under condition Y" — formed via reflect, strengthened as more evidence accumulates |
| **Observation** (derived insight) | Cross-incident insights, e.g. "incidents in payments-api cluster around deploy windows" |

Without Hindsight, this agent is just a form that saves text to a database. With it, the agent's *advice quality visibly changes* as its experience grows — which is the entire point of the hackathon problem statement.

---

## 4. Architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────┐
│   Chat / CLI UI   │  ───▶  │   Agent Layer      │  ───▶  │   LLM (Groq)      │
│  (incident input) │        │  (orchestration)   │        │  openai/gpt-oss-  │
└─────────────────┘        └──────────────────┘        │  120b or           │
                                     │  ▲                    │  qwen/qwen3-32b   │
                                     ▼  │                    └─────────────────┘
                             ┌──────────────────┐
                             │     Hindsight       │
                             │  retain / recall /  │
                             │  reflect             │
                             └──────────────────┘
                                     │
                             ┌──────────────────┐
                             │  Memory Store        │
                             │ (World / Experience/ │
                             │  Opinion/Observation) │
                             └──────────────────┘
```

**Flow for a new incident:**

1. User input → Agent Layer
2. Agent calls Hindsight `recall(query=incident description, filters=service)` → gets past similar incidents + any relevant opinions
3. Agent Layer sends incident + recalled memories to the LLM → generates a diagnosis/fix suggestion, citing the past incident if relevant
4. Once the engineer confirms the resolution → Agent calls Hindsight `retain(...)` to store the new experience
5. Periodically (or after N incidents for a service) → Agent calls Hindsight `reflect()` → generates/updates an opinion about that service

---

## 5. Tech Stack

- **Memory**: Hindsight (Cloud or self-hosted open-source) — [docs](https://hindsight.vectorize.io/) · [GitHub](https://github.com/vectorize-io/hindsight)
- **LLM**: Groq (`openai/gpt-oss-120b` or `qwen/qwen3-32b`)
- **Client**: `hindsight-client` (Python or Node)
- **Interface**: Minimal chat UI (or CLI for MVP)
- **Seed data**: Synthetic incident history generated via LLM, styled to look like real production incidents (services, error codes, realistic timestamps and resolution notes)

---

## 6. Data Model

**Incident record (retained as an Experience):**

```json
{
  "incident_id": "INC-0142",
  "service": "payments-api",
  "symptoms": "500 errors spiking, high latency on /charge endpoint",
  "root_cause": "Connection pool exhaustion under high load",
  "fix_applied": "Increased pool size, added circuit breaker",
  "runbook_used": "runbooks/payments-api-db-pool.md",
  "resolution_time_minutes": 12,
  "timestamp": "2026-03-14T02:41:00Z",
  "resolved_by": "on-call engineer"
}
```

**Opinion (formed via reflect, after multiple related incidents):**

```json
{
  "service": "payments-api",
  "belief": "Fails under high load due to connection pool exhaustion",
  "confidence": 0.82,
  "supporting_incidents": ["INC-0091", "INC-0117", "INC-0142"]
}
```

---

## 7. Setup

```bash
# Install Hindsight client
pip install hindsight-client -U

# Set environment variables
export HINDSIGHT_API_KEY=your_key_here
export GROQ_API_KEY=your_key_here

# Seed synthetic incident history
python seed_incidents.py

# Run the agent
python agent.py
```

Promo code `MEMHACK99` gives $50 in free credits on Hindsight Cloud (apply after registering, in the billing section).

---

## 8. Demo Script (for the required Demo Video / Live Demo)

1. **Cold start (0:00–0:30)** — Ask the agent about a `payments-api` incident with no relevant memory seeded. It gives a generic, textbook answer.
2. **Seed memory (0:30–1:00)** — Show 3 past resolved incidents being retained (can be sped up / narrated).
3. **Warm recall (1:00–1:45)** — Ask about a similar `payments-api` incident again. The agent now recalls the exact past incident, cites what worked, and estimates resolution time — visibly more specific and confident.
4. **Reflect moment (1:45–2:30)** — Trigger reflect. The agent states a learned opinion about the service unprompted: *"I've noticed payments-api tends to fail under high load due to connection pool exhaustion — want me to check current pool metrics first?"*
5. **Wrap-up (2:30–3:00)** — One sentence on what surprised the team while building it.

---

## 9. Team:Gryffindor

*S.Rahul Bangar ,*
*S.Guru Poojitha ,*
*M.Spurthi ,*
*P.Sudeshna reddy ,*
*S.Sarasij Reddy*

