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
- **3D force-directed graph** — Interactive network visualization with weighted edges based on communication anomaly intensity

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  Filter   │  │  Force Graph │  │   Context Panel           │ │
│  │  Panel    │  │  (WebGL 3D)  │  │  Person / Edge / Traces   │ │
│  │  + Time   │  │  + Weighted  │  │  Counterfactual / Tamper  │ │
│  │  Slider   │  │  Edges       │  │  Compliance / PDF Export  │ │
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
Queries Neo4j for network topology anomalies: degree centrality, communication volume spikes, and unusual cross-department connections. Uses trailing 30-day baselines to detect volume deviations. Also performs content-aware threat detection, bypassing volume thresholds when emails contain clear indicators of financial fraud, data destruction, or inappropriate relations.

### 2. Sentiment Analyzer
Analyzes email text using VADER compound scoring, keyword scanning (financial fraud terms like "LJM", "Raptor", "off-balance-sheet"; destruction terms like "shred", "clean up files"; relationship indicators), and optional embedding comparison.

### 3. Deliberation Node
Triggers when Investigator and Sentiment confidence scores diverge by more than 0.3. Both agents exchange structured reasoning and produce a joint assessment with a resolution method (consensus, majority, or deferred). This is logged as an `inter_agent_deliberation` forensic event — directly addressing the Measure 2.8 transparency gap.

### 4. Escalation Agent
Aggregates weighted confidence from all upstream agents. If the combined score exceeds the configurable threshold, generates a structured alert with threat category, confidence score, and recommended action. Alerts are broadcast in real-time via WebSocket.

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
(:Person {email, name, department, degree_centrality, org_tier})
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
| **Left (240px)** | FilterPanel (date range, department, employee search), TimeSlider (animated playback) |
| **Center** | GraphView (react-force-graph-3d with WebGL rendering, weighted edges by anomaly intensity, investigation node highlighting) |
| **Right (340px)** | Context-sensitive: PersonDetail, EdgeDetail, ForensicPanel, AgentReasoning, PatternAnalytics, ComplianceScorecard, SlackNotificationLog |

### All Frontend Components

| Component | Purpose |
|-----------|---------|
| `Dashboard.tsx` | Main three-panel orchestrator |
| `GraphView.tsx` | 3D force-directed graph (react-force-graph-3d + three.js) |
| `FilterPanel.tsx` | Date range, department, threat category, employee search filters |
| `TimeSlider.tsx` | Animated time scrubbing with playback controls |
| `ForensicPanel.tsx` | Tabbed trace viewer |
| `AlertBanner.tsx` | WebSocket-driven alert notifications |
| `PersonaSwitcher.tsx` | Role selector (SOC analyst, security officer, etc.) |
| `ExecutiveSummary.tsx` | Quick findings overview |
| `ConfidenceGauge.tsx` | Radial confidence visualization |
| `ConfidenceChart.tsx` | Time-series confidence tracking (Recharts) |
| `AnalystOverride.tsx` | Confirm / Dismiss / Escalate UI |
| `CounterfactualToggle.tsx` | Agent contribution toggles |
| `TamperSimulation.tsx` | Interactive tamper demo |
| `ComplianceScorecard.tsx` | NIST / EU AI Act compliance mapping |
| `AuditReportExport.tsx` | PDF report generation UI |
| `AuditTrail.tsx` | Full trace chronology |
| `AgentReasoning.tsx` | Agent decision explanations |
| `AgentPipeline.tsx` | LangGraph pipeline visualization |
| `AgentTimeline.tsx` | Sequential agent execution timeline |
| `DeliberationView.tsx` | Deliberation details when triggered |
| `EmailEvidence.tsx` | Flagged email viewer with threat highlights |
| `PatternAnalytics.tsx` | Communication pattern analytics |
| `SlackNotificationLog.tsx` | Notification history |
| `StreamControl.tsx` | Time stream playback controls |
| `ErrorBoundary.tsx` | React error boundary wrapper |
| `Toast.tsx` | Toast notification system |

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

## Evaluation & Ground Truth Pipeline

To scientifically measure the retention of threat detection capabilities after applying privacy-preserving data anonymization, we evaluate the Multi-Agent System (MAS) against a static ground truth. 

**Note for Teammates:** You do **NOT** need to run the generation scripts or use your own API tokens! The dataset and ground truth benchmark are safely committed to this repository.

### Evaluative Methodology
1. **The Grader**: Claude Opus 4.7 analyzed the *Raw Enron Text* to establish the perfect `data/claude_opus_ground_truth_2000.json`.
2. **The Student**: The LangGraph Multi-Agent System will analyze the *De-Identified Text* (where names and PII are redacted). 
3. **The Score**: By comparing the Student's predictions to the Grader's benchmark, we calculate Precision, Recall, and F1-Scores.

### Running the Evaluation (Phase 4 & 5)
If you wish to re-run the evaluation of the MAS against the benchmark:
```bash
# 1. Have the Multi-Agent System process the 2000 de-identified emails
python3 data/scripts/batch_evaluate_mas.py

# 2. Calculate final metrics against the locked ground truth
python3 data/scripts/evaluate_metrics.py
```
*(The `batch_evaluate_mas.py` and `evaluate_metrics.py` scripts are currently under construction in the `eval-ground-truth` branch.)*

---

## Project Structure

```
enron-threat-analysis/
├── docker-compose.yml              # Neo4j container
├── .env.example                    # Environment variable template
├── Makefile                        # Dev workflow targets
├── data/
│   ├── raw/                        # Enron maildir (gitignored)
│   ├── curated/                    # Hand-picked demo emails
│   └── scripts/
│       ├── download_enron.py       # Fetch Enron corpus from archive.org
│       ├── parse_maildir.py        # Parse mbox/maildir into CSV
│       ├── import_neo4j.py         # Bulk load CSV into Neo4j
│       └── seed_curated.py         # Create synthetic demo data (~1200 emails)
├── backend/
│   ├── main.py                     # FastAPI entrypoint
│   ├── config.py                   # Pydantic settings (env vars)
│   ├── pyproject.toml              # Python dependencies
│   ├── agents/
│   │   ├── state.py                # LangGraph shared state TypedDict
│   │   ├── graph.py                # StateGraph wiring + pipeline runner
│   │   ├── investigator.py         # Network anomaly + threat detection
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
│   ├── integrations/
│   │   └── slack_mcp.py            # Slack webhook integration (mock mode)
│   ├── api/
│   │   ├── routes_graph.py         # Graph snapshot + node/edge endpoints
│   │   ├── routes_forensic.py      # Trace retrieval + verification
│   │   ├── routes_analysis.py      # Agent pipeline trigger/status/monitoring
│   │   ├── routes_human.py         # Analyst override endpoints
│   │   └── ws_alerts.py            # WebSocket real-time alerts
│   └── db/
│       ├── neo4j_client.py         # Neo4j driver wrapper
│       └── sqlite_client.py        # SQLite initialization
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── Dashboard.tsx           # Three-panel orchestrator
│   │   ├── GraphView.tsx           # react-force-graph-3d (WebGL)
│   │   ├── FilterPanel.tsx         # Filters + employee search
│   │   ├── TimeSlider.tsx          # Animated playback
│   │   ├── ForensicPanel.tsx       # Trace viewer with sub-tabs
│   │   ├── AlertBanner.tsx         # WebSocket-driven alerts
│   │   ├── PersonaSwitcher.tsx     # Role selector
│   │   ├── ExecutiveSummary.tsx    # Quick findings overview
│   │   ├── ConfidenceGauge.tsx     # Radial gauge
│   │   ├── ConfidenceChart.tsx     # Time-series confidence (Recharts)
│   │   ├── AnalystOverride.tsx     # Confirm/Dismiss/Escalate UI
│   │   ├── CounterfactualToggle.tsx
│   │   ├── TamperSimulation.tsx
│   │   ├── ComplianceScorecard.tsx
│   │   ├── AuditReportExport.tsx
│   │   ├── AuditTrail.tsx          # Full trace chronology
│   │   ├── AgentReasoning.tsx      # Agent decision explanations
│   │   ├── AgentPipeline.tsx       # Pipeline visualization
│   │   ├── AgentTimeline.tsx       # Agent execution timeline
│   │   ├── DeliberationView.tsx    # Deliberation details
│   │   ├── EmailEvidence.tsx       # Flagged email viewer
│   │   ├── PatternAnalytics.tsx    # Communication patterns
│   │   ├── SlackNotificationLog.tsx
│   │   ├── StreamControl.tsx       # Playback controls
│   │   ├── ErrorBoundary.tsx       # Error boundary
│   │   └── Toast.tsx               # Toast notifications
│   ├── hooks/
│   │   ├── useGraphData.ts         # Graph snapshot fetching + caching
│   │   ├── useForensicTrace.ts     # Forensic trace loading
│   │   ├── useWebSocket.ts         # WebSocket connection management
│   │   ├── useTimeSlider.ts        # Time slider state + animation
│   │   └── useTheme.ts             # Dark/light theme toggle
│   └── lib/
│       ├── api.ts                  # API client functions
│       ├── types.ts                # TypeScript interfaces
│       └── constants.ts            # Department colors, categories
└── docs/                           # (Documentation placeholder)
```

---

## Setup

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Docker** (for Neo4j)
- **OpenAI API key** (GPT-4o, or access to CMU's LiteLLM gateway)

### 1. Clone the Repository

```bash
git clone https://github.com/nicolelyu021/Multi-Agent-for-Cyber-Forensics.git
cd Multi-Agent-for-Cyber-Forensics/enron-threat-analysis
```

### 2. Start Neo4j

```bash
docker compose up -d
```

This starts a Neo4j 5 Community container with the APOC plugin enabled.

- **Browser UI**: http://localhost:7474
- **Bolt endpoint**: `bolt://localhost:7687`
- **Credentials**: `neo4j` / `enronpass123`

Verify it's running:

```bash
docker compose ps
```

### 3. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -e .

# (Optional) Install dev/observability extras
pip install -e ".[dev]"             # pytest, pytest-asyncio
pip install -e ".[observability]"   # langfuse, opentelemetry
```

### 4. Configure Environment Variables

```bash
cp ../.env.example .env
```

Edit `.env` and set your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
```

All other defaults work out of the box for local development. See `config.py` for the full list of configurable settings (thresholds, model, Neo4j URI, etc.).

### 5. Seed the Database

With Neo4j running and the backend venv active:

```bash
cd ..   # back to project root
python data/scripts/seed_curated.py
```

This creates ~1,200 synthetic emails across three threat scenarios (financial fraud, document destruction, inappropriate relations) based on real Enron figures. The script connects directly to Neo4j at `bolt://localhost:7687`.

### 6. Start the Backend

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Verify it's running:

```bash
curl http://localhost:8000/api/health
# → {"status":"ok","service":"enron-threat-analysis"}
```

### 7. Start the Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at **http://localhost:3000**.

---

## Quick Start (Makefile)

If you've completed the one-time setup above, you can use the Makefile shortcuts:

```bash
make dev          # Start Neo4j + backend + frontend
make db           # Start Neo4j only
make backend      # Start FastAPI (assumes venv exists)
make frontend     # Start Next.js dev server
make seed         # Re-seed Neo4j with demo data
make data-pipeline  # Full ETL: download → parse → import → seed
make data-pipeline-deidentified # Full ETL with True Metadata Anonymization mapping
make clean        # Tear down Neo4j volumes + delete forensic DB
```

See [docs/deidentification_pipeline.md](docs/deidentification_pipeline.md) for more details on how the real data is loaded and de-identified while preserving graph topology.

---

## Testing

### Backend Tests

```bash
cd backend
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

### Frontend Lint & Build

```bash
cd frontend
npm run lint      # ESLint check
npm run build     # Production build (catches type errors)
```

### Manual Smoke Test

1. Open http://localhost:3000
2. The 3D force graph should render with Enron employee nodes colored by department
3. Click any node → right panel shows person details with email breakdown
4. Click any edge → right panel shows communication details and anomaly score
5. Use the time slider to scrub through the Enron timeline (1999–2002)
6. Run an analysis: the FilterPanel has a "Run Analysis" button — click it and wait for the agent pipeline to complete
7. After analysis completes, investigate highlighted nodes (investigation nodes glow) and check the AlertBanner
8. Open the Forensic tab → verify trace records appear with hash chain integrity
9. Try the Tamper Simulation → one record should show a broken hash chain (red)
10. Export a PDF audit report from the AuditReportExport panel

### Verify Neo4j Data

Open http://localhost:7474 in your browser and run:

```cypher
MATCH (p:Person) RETURN p.name, p.department, p.org_tier ORDER BY p.department;
MATCH (e:Email) RETURN count(e) AS total_emails;
MATCH (e:Email) WHERE e.threat_category IS NOT NULL RETURN e.threat_category, count(e) ORDER BY count(e) DESC;
```

---

## API Endpoints

### Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/graph/nodes` | List all person nodes (filter by department, min_degree) |
| GET | `/api/graph/nodes/search?q=<text>` | Autocomplete search by email/name |
| GET | `/api/graph/person/{email}/emails` | Emails sent/received by a person in date window |
| GET | `/api/graph/snapshot` | Full graph filtered by time, department, threat, person |

### Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analysis/run` | Trigger multi-agent analysis pipeline |
| GET | `/api/analysis/status/{run_id}` | Poll analysis status |
| GET | `/api/analysis/results/{run_id}` | Fetch completed results |
| GET | `/api/analysis/runs` | List all analysis runs |
| GET | `/api/analysis/monitoring/baselines` | Compute behavioral baselines from all data |
| GET | `/api/analysis/monitoring/deviations/{trace_id}` | Compare analysis window vs baselines |

### Forensic

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forensic/traces` | List all forensic trace summaries (last 20) |
| GET | `/api/forensic/traces/{trace_id}` | Full forensic records for a trace |
| GET | `/api/forensic/verify/{trace_id}` | Cryptographic hash chain verification |
| GET | `/api/forensic/counterfactual/{trace_id}` | Agent contribution analysis |
| GET | `/api/forensic/tamper-sim/{trace_id}` | Sandboxed tamper simulation |
| GET | `/api/forensic/emails/{trace_id}` | Extract flagged emails from a trace |

### Human Review

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review/pending` | Alerts pending analyst review |
| POST | `/api/review/{alert_id}` | Submit analyst decision (confirm/dismiss/escalate) |

### WebSocket

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| WS | `/ws/alerts` | Real-time escalation alert broadcast |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health check |

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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **LLM** | OpenAI GPT-4o (via CMU LiteLLM gateway) |
| **Agent Framework** | LangGraph (stateful cyclic graphs) |
| **Backend** | FastAPI + aiosqlite + Pydantic |
| **Frontend** | Next.js 13.5 + React 18 + Tailwind CSS |
| **Graph Visualization** | react-force-graph-3d + three.js (WebGL) |
| **Charting** | Recharts + d3 |
| **Graph Database** | Neo4j 5 Community Edition + APOC |
| **Forensic Storage** | SQLite with SHA-256 hash chains |
| **NLP** | VADER Sentiment Analysis |
| **PDF Reports** | ReportLab |
| **Icons** | Lucide React |
| **Dataset** | Enron Email Corpus (CMU) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | *(required)* | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o` | LLM model name |
| `OPENAI_BASE_URL` | `https://ai-gateway.andrew.cmu.edu` | LLM API base URL |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j Bolt endpoint |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `enronpass123` | Neo4j password |
| `API_HOST` | `0.0.0.0` | FastAPI bind host |
| `API_PORT` | `8000` | FastAPI bind port |
| `FORENSIC_DB_PATH` | `forensic.db` | SQLite database path |
| `ANOMALY_THRESHOLD` | `2.0` | Z-score threshold for anomaly detection |
| `CONFIDENCE_THRESHOLD` | `0.7` | Minimum confidence to trigger escalation |
| `DELIBERATION_DIVERGENCE` | `0.3` | Agent disagreement threshold for deliberation |
| `SLACK_WEBHOOK_URL` | `mock` | Slack webhook URL (`mock` for demo mode) |
| `LANGFUSE_PUBLIC_KEY` | *(optional)* | Langfuse observability |
| `LANGFUSE_SECRET_KEY` | *(optional)* | Langfuse observability |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Neo4j won't start | Check Docker is running: `docker info`. Check port 7687 isn't in use: `lsof -i :7687` |
| `ModuleNotFoundError: neo4j` when seeding | Make sure you're in the backend venv: `source backend/.venv/bin/activate` |
| Frontend can't reach backend | Backend must be on port 8000. Check CORS in `main.py` allows `localhost:3000` |
| Graph is empty | Run `python data/scripts/seed_curated.py` to populate Neo4j |
| Analysis times out | Check OpenAI API key is valid. Check Neo4j is running and seeded |
| 3D graph performance | Reduce time window range to limit node count. Use department filter to focus on a subset |
