# Multi-Agent Insider Threat Analysis with Forensic Traceability

A multi-agent AI system for detecting insider threats in the Enron email corpus, built with full forensic traceability to demonstrate compliance with NIST AI RMF and EU AI Act governance requirements.

**CMU AI Governance Project** — Raghav Trivedi, Rin, Nicole

---

## Overview

Microsoft Defender XDR's Security Copilot produces post-hoc natural language summaries but provides no ground-truth reasoning traces for inter-agent decisions (NIST AI RMF Measure 2.8 gap). This project builds a concrete demonstration of how forensic transparency *should* work in multi-agent cybersecurity systems.

The system analyzes the Enron email dataset using multiple specialized AI agents, each contributing independent analysis. Every agent decision, tool call, and inter-agent negotiation is captured in a tamper-evident forensic audit trail using SHA-256 hash chains.

### Key Capabilities

- **Multi-agent threat detection** — Investigator (network topology), Sentiment Analyzer (language patterns), Deliberation (disagreement resolution), and Escalation (final decision)
- **Three forensic layers** — Operational (Cypher queries), Contextual (I/O data), Cognitive (reasoning traces)
- **Tamper-evident audit chain** — SHA-256 linked records detect any post-hoc modification
- **Human-in-the-loop oversight** — Analyst review gate with logged confirm/dismiss/escalate actions
- **Counterfactual analysis** — Toggle individual agent contributions to see which agent drove the decision
- **Compliance mapping** — Live NIST AI RMF and EU AI Act compliance scorecard

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  Filter   │  │  Force Graph │  │    Forensic Panel         │ │
│  │  Panel    │  │  (Canvas 2D) │  │  Traces / Person / Edge   │ │
│  │  + Time   │  │  + Time      │  │  Counterfactual / Tamper  │ │
│  │  Slider   │  │  Slider      │  │  Compliance / PDF Export  │ │
│  └──────────┘  └──────────────┘  └───────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │ REST + WebSocket
┌───────────────────────────▼─────────────────────────────────────┐
│                      FastAPI Backend                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  LangGraph State Machine                    │ │
│  │                                                            │ │
│  │  START ──▶ Investigator ──▶ Sentiment Analyzer             │ │
│  │                 │                    │                      │ │
│  │                 │         ┌──────────┤                      │ │
│  │                 │         │ (divergence > 0.3)              │ │
│  │                 │         ▼                                 │ │
│  │                 │    Deliberation                           │ │
│  │                 │         │                                 │ │
│  │                 └────▶ Escalation                           │ │
│  │                           │                                │ │
│  │                    (confidence ≥ threshold)                 │ │
│  │                           ▼                                │ │
│  │                   Human Review Gate ──▶ END                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  Forensic Wrapper │  │  SQLite (Traces) │                    │
│  │  @forensic_agent  │  │  Hash Chain      │                    │
│  │  @forensic_tool   │  │  ForensicRecord  │                    │
│  └──────────────────┘  └──────────────────┘                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Cypher
                    ┌───────▼───────┐
                    │    Neo4j      │
                    │  Person nodes │
                    │  Email nodes  │
                    │  Relationships│
                    └───────────────┘
```

---

## Agent Pipeline

### 1. Investigator Agent
Queries Neo4j for network topology anomalies: degree centrality, communication volume spikes, and unusual cross-department connections. Uses trailing 30-day baselines to detect volume deviations.

### 2. Sentiment Analyzer
Analyzes email text using VADER compound scoring, keyword scanning (financial fraud terms like "LJM", "Raptor", "off-balance-sheet"; destruction terms like "shred", "clean up files"; relationship indicators), and optional embedding comparison.

### 3. Deliberation Node
Triggers when Investigator and Sentiment confidence scores diverge by more than 0.3. Both agents exchange structured reasoning and produce a joint assessment with a resolution method (consensus, majority, or deferred). This is logged as an `inter_agent_deliberation` forensic event — directly addressing the Measure 2.8 transparency gap.

### 4. Escalation Agent
Aggregates weighted confidence from all upstream agents. If the combined score exceeds the configurable threshold, generates a structured alert with threat category, confidence score, and recommended action.

### 5. Human Review Gate
Alerts above the threshold enter a `pending_review` state. Analysts can confirm, dismiss, or escalate with a free-text rationale. Every override is captured as a forensic record with `event_type: human_override`, satisfying NIST Map 1.6 and EU AI Act Article 14.

---

## Forensic Wrapper

Every agent action is recorded using decorator-based middleware:

```python
@forensic_agent("investigator")
async def investigator_node(state: dict):
    # Pre-hook: logs agent_start with state keys
    result = ...  # agent logic
    # Post-hook: logs agent_end with reasoning + confidence
    return result

@forensic_tool("neo4j_query", "investigator")
async def query_anomalous_edges(...):
    # Logs tool_call with SHA-256 hash of (tool_name, input, output)
    ...
```

**ForensicRecord schema:** `trace_id`, `span_id`, `parent_span_id`, `agent_id`, `timestamp`, `event_type`, `tool_name`, `tool_input`, `tool_output`, `tool_call_hash` (SHA-256), `reasoning_summary`, `confidence_score`, `proposed_action`, `datasets_accessed`, `record_hash`, `previous_record_hash` (chain link).

**Hash chain:** Each record includes a `previous_record_hash` linking it to the prior record. Verification traverses the chain and recomputes hashes — if any record is modified, all subsequent links break.

---

## Neo4j Data Model

```
(:Person {email, name, department, degree_centrality})
    -[:SENT]-> (:Email {message_id, date, subject, body, threat_category, vader_compound})
    -[:RECEIVED_TO|RECEIVED_CC]-> (:Person)

(:Person)-[:COMMUNICATES_WITH {total_volume, anomaly_score}]->(:Person)
```

Graph queries dynamically compute edges from actual Email nodes in the selected time window, so the visualization updates correctly as the time slider moves.

---

## Frontend Dashboard

Three-panel layout with a dark SOC-analyst theme:

| Panel | Components |
|-------|------------|
| **Left** | FilterPanel (date range, department, threat category radio), TimeSlider (animated playback) |
| **Center** | GraphView (react-force-graph-2d with Canvas rendering, animated particles on anomalous edges, directional arrows) |
| **Right** | Context-sensitive: PersonDetail, EdgeDetail, ForensicPanel (TraceTree, ConfidenceGauge, CounterfactualToggle, TamperSimulation), ComplianceScorecard, AuditReportExport |

### Interactions
- **Click a node** → PersonDetail: shows name, department, connections, email volumes, anomaly indicators, and related forensic traces
- **Click an edge** → EdgeDetail: shows source/target with department labels, anomaly score, plain-English explanation, and related traces
- **Drag time slider** → Graph re-renders with updated edges for that time window
- **Press play** → Time ticks forward (1 week/sec), animating the Enron crisis as it unfolds
- **WebSocket alert** → AlertBanner with click-to-inspect
- **Analyst Override** → Confirm/Dismiss/Escalate with logged rationale
- **Counterfactual Toggle** → Toggle agent contributions on/off, watch confidence recalculate
- **Tamper Simulation** → Corrupt a record in a sandboxed copy, see the hash chain break
- **Export** → One-click PDF audit report with highlighted email evidence and compliance mapping

---

## Compliance Mapping

| Requirement | Framework | System Feature |
|-------------|-----------|----------------|
| Measure 2.8 (Transparency) | NIST AI RMF | Forensic Wrapper + Hash Chain |
| Map 1.6 (Human Oversight) | NIST AI RMF | Analyst Override Gate |
| Govern 1.2 (Accountability) | NIST AI RMF | Append-Only Hash Chain + Tamper Detection |
| Article 9 (Risk Management) | EU AI Act | Confidence Thresholds + Deliberation |
| Article 13 (Transparency) | EU AI Act | Three-Layer Forensic Traces |
| Article 14 (Human Oversight) | EU AI Act | Human Review Gate + Override Logging |

---

## Project Structure

```
enron-threat-analysis/
├── docker-compose.yml              # Neo4j
├── .env.example
├── Makefile
├── data/
│   ├── raw/                        # Enron maildir (gitignored)
│   ├── curated/                    # ~200 hand-picked demo emails
│   └── scripts/
│       ├── download_enron.py
│       ├── parse_maildir.py
│       ├── import_neo4j.py
│       └── seed_curated.py
├── backend/
│   ├── main.py                     # FastAPI entrypoint
│   ├── config.py
│   ├── agents/
│   │   ├── state.py                # LangGraph shared state TypedDict
│   │   ├── graph.py                # StateGraph wiring
│   │   ├── investigator.py         # Network anomaly detection
│   │   ├── sentiment.py            # VADER + keyword + embedding
│   │   ├── deliberation.py         # Inter-agent disagreement resolution
│   │   ├── escalation.py           # Confidence aggregation + alert
│   │   └── tools/
│   │       ├── neo4j_queries.py    # Cypher query tools
│   │       ├── vader_analysis.py   # VADER compound scoring
│   │       └── embedding_compare.py
│   ├── forensic/
│   │   ├── wrapper.py              # @forensic_agent / @forensic_tool decorators
│   │   ├── schema.py               # Pydantic ForensicRecord model
│   │   ├── store.py                # SQLite CRUD
│   │   ├── hasher.py               # SHA-256 hash chain verification
│   │   ├── counterfactual.py       # Agent contribution toggle
│   │   ├── tamper_sim.py           # Sandboxed tamper simulation
│   │   └── exporters.py            # PDF audit report generator
│   ├── api/
│   │   ├── routes_graph.py         # Graph snapshot endpoints
│   │   ├── routes_forensic.py      # Trace retrieval + verification
│   │   ├── routes_analysis.py      # Agent pipeline trigger/status
│   │   ├── routes_human.py         # Analyst override endpoints
│   │   └── ws_alerts.py            # WebSocket real-time alerts
│   └── db/
│       ├── neo4j_client.py
│       └── sqlite_client.py
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── Dashboard.tsx           # Three-panel orchestrator
│   │   ├── FilterPanel.tsx         # Filters + threat category toggles
│   │   ├── TimeSlider.tsx          # Animated playback
│   │   ├── GraphView.tsx           # react-force-graph-2d Canvas
│   │   ├── ForensicPanel.tsx       # Trace viewer with sub-tabs
│   │   ├── TraceTree.tsx           # Collapsible forensic record tree
│   │   ├── ConfidenceGauge.tsx     # Radial gauge
│   │   ├── AlertBanner.tsx         # WebSocket-driven alerts
│   │   ├── AnalystOverride.tsx     # Confirm/Dismiss/Escalate UI
│   │   ├── CounterfactualToggle.tsx
│   │   ├── TamperSimulation.tsx
│   │   ├── ComplianceScorecard.tsx
│   │   └── AuditReportExport.tsx
│   ├── hooks/
│   │   ├── useGraphData.ts
│   │   ├── useForensicTrace.ts
│   │   ├── useWebSocket.ts
│   │   └── useTimeSlider.ts
│   └── lib/
│       ├── api.ts
│       ├── types.ts
│       └── constants.ts
└── docs/
    ├── demo-script.md
    └── forensic-schema.md
```

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker (for Neo4j)

### 1. Start Neo4j
```bash
docker compose up -d
```

### 2. Backend
```bash
cd backend
cp ../.env.example .env   # Add your OpenAI API key
pip install -e .
python -m data.scripts.seed_curated   # Load demo emails into Neo4j
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

---

## Demo Scenarios

### A: Financial Fraud (SPE Story)
Time window Oct 2000–Jun 2001. Fastow-Kopper communication spikes, edges turn red. Sentiment flags "LJM", "Raptor", "off-balance-sheet". Deliberation triggers on agent disagreement. Counterfactual demo shows both agents were necessary for detection.

### B: Document Destruction
Time window Sep–Dec 2001. Legal department nodes light up. "Shred room", "retention policy" flagged. Hash chain verification shows green checkmarks. Tamper simulation corrupts a record — red X propagates through the chain.

### C: Governance Deep Dive
Walk through all three forensic layers. Show hash chain tamper-evidence. Compliance scorecard maps each capability to NIST/EU AI Act requirements with links to live forensic data.

### D: Human-in-the-Loop Override
Analyst dismisses a false positive with logged rationale. Analyst escalates a below-threshold alert. Both actions captured as forensic records, making the human-AI collaboration itself transparent.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/graph/snapshot` | Filtered graph data (time, dept, threat) |
| POST | `/api/analysis/run` | Trigger multi-agent analysis |
| GET | `/api/analysis/status/{run_id}` | Poll analysis status |
| GET | `/api/analysis/results/{run_id}` | Fetch completed results |
| GET | `/api/forensic/traces` | List all forensic traces |
| GET | `/api/forensic/traces/{trace_id}` | Full trace records |
| GET | `/api/forensic/verify/{trace_id}` | Hash chain verification |
| GET | `/api/forensic/counterfactual/{trace_id}` | Agent attribution analysis |
| GET | `/api/forensic/tamper-sim/{trace_id}` | Tamper simulation |
| GET | `/api/forensic/export-report/{trace_id}` | PDF audit report |
| GET | `/api/review/pending` | Pending analyst reviews |
| POST | `/api/review/{alert_id}` | Submit analyst decision |
| WS | `/ws/alerts` | Real-time escalation alerts |

---

## Tech Stack

- **LLM**: OpenAI GPT-4o
- **Agent Framework**: LangGraph (stateful cyclic graphs)
- **Backend**: FastAPI + aiosqlite
- **Frontend**: Next.js 14 + react-force-graph-2d
- **Graph Database**: Neo4j Community Edition
- **Forensic Storage**: SQLite with SHA-256 hash chains
- **PDF Reports**: ReportLab
- **Dataset**: Enron Email Corpus (CMU)
