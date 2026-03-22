import asyncio
import json
import uuid
from datetime import datetime

import aiosqlite
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from config import settings
from db.neo4j_client import neo4j_client

router = APIRouter()

# In-memory run tracking (sufficient for course demo)
_runs: dict[str, dict] = {}

# In-memory stream simulation state
_stream: dict = {"active": False, "task": None, "position": 0, "total_weeks": 0,
                 "emails_processed": 0, "total_emails": 0, "alerts_generated": 0,
                 "speed": 5, "current_week_label": ""}


class AnalysisRequest(BaseModel):
    start_date: str
    end_date: str
    anomaly_threshold: float = 2.0
    confidence_threshold: float = 0.7
    departments: list[str] | None = None
    person_emails: list[str] | None = None


@router.post("/run")
async def start_analysis(req: AnalysisRequest, background_tasks: BackgroundTasks):
    run_id = str(uuid.uuid4())
    _runs[run_id] = {
        "status": "queued",
        "created_at": datetime.utcnow().isoformat(),
        "params": req.model_dump(),
        "result": None,
        "error": None,
    }

    async def _run_pipeline():
        _runs[run_id]["status"] = "running"
        try:
            from agents.graph import run_threat_analysis

            result = await run_threat_analysis(
                start_date=req.start_date,
                end_date=req.end_date,
                anomaly_threshold=req.anomaly_threshold,
                confidence_threshold=req.confidence_threshold,
                departments=req.departments,
                person_emails=req.person_emails,
            )
            _runs[run_id]["status"] = "completed"
            _runs[run_id]["result"] = result
        except Exception as e:
            import traceback
            error_detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
            _runs[run_id]["status"] = "failed"
            _runs[run_id]["error"] = error_detail

    background_tasks.add_task(_run_pipeline)
    return {"run_id": run_id, "status": "queued"}


@router.get("/status/{run_id}")
async def get_status(run_id: str):
    if run_id not in _runs:
        return {"error": "Run not found", "status": "not_found"}
    run = _runs[run_id]
    resp = {"run_id": run_id, "status": run["status"]}
    # Surface error message in status so frontend can show it immediately
    if run["status"] == "failed" and run.get("error"):
        # Return first line only (full trace is in results)
        resp["error"] = run["error"].split("\n")[0]
    return resp


@router.get("/results/{run_id}")
async def get_results(run_id: str):
    if run_id not in _runs:
        return {"error": "Run not found", "status": "not_found"}
    run = _runs[run_id]

    if run["status"] == "failed":
        error_msg = run.get("error") or "Unknown error"
        return {
            "run_id": run_id,
            "status": "failed",
            # Put error inside result so existing frontend code that reads
            # results.result?.error will find it
            "result": {"error": error_msg},
            "error": error_msg,
        }

    if run["status"] != "completed":
        return {"run_id": run_id, "status": run["status"], "result": None}

    return {"run_id": run_id, "status": "completed", "result": run["result"]}


@router.get("/runs")
async def list_runs():
    """List all runs with their status (useful for debugging)."""
    return [
        {
            "run_id": rid,
            "status": r["status"],
            "created_at": r["created_at"],
            "error": r.get("error", "").split("\n")[0] if r.get("error") else None,
        }
        for rid, r in _runs.items()
    ]


# ── Monitoring: Behavioral Baselines ──────────────────────────────────────

@router.get("/monitoring/baselines")
async def get_baselines():
    """Compute per-person behavioral baselines from ALL Neo4j data."""
    # Total volume per person
    volume_query = """
        MATCH (p:Person)-[:SENT]->(e:Email)
        WITH p, count(e) AS sent_count
        OPTIONAL MATCH (p)<-[:RECEIVED_TO|RECEIVED_CC]-(e2:Email)
        WITH p, sent_count, count(e2) AS received_count
        RETURN p.email AS person,
               COALESCE(p.name, p.email) AS name,
               COALESCE(p.department, 'Unknown') AS department,
               sent_count,
               received_count,
               sent_count + received_count AS total_volume
        ORDER BY total_volume DESC
        LIMIT 50
    """
    persons = neo4j_client.execute_read(volume_query, {})

    # Top recipients per person
    top_contacts_query = """
        MATCH (a:Person)-[:SENT]->(e:Email)-[:RECEIVED_TO]->(b:Person)
        WITH a, b, count(e) AS volume
        ORDER BY volume DESC
        WITH a, collect({contact: b.email, volume: volume})[..3] AS top_contacts
        RETURN a.email AS person, top_contacts
    """
    contacts = neo4j_client.execute_read(top_contacts_query, {})
    contacts_map = {c["person"]: c["top_contacts"] for c in contacts}

    baselines = []
    for p in persons:
        baselines.append({
            "person": p["person"],
            "name": p["name"],
            "department": p["department"],
            "sent_count": p["sent_count"],
            "received_count": p["received_count"],
            "total_volume": p["total_volume"],
            "top_contacts": contacts_map.get(p["person"], []),
        })

    return baselines


@router.get("/monitoring/deviations/{trace_id}")
async def get_deviations(trace_id: str):
    """Compare analysis-window metrics against full-dataset baselines."""
    # Get baselines first
    baselines_resp = await get_baselines()
    baseline_map = {b["person"]: b for b in baselines_resp}

    # Get analysis results from forensic records
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? AND event_type = 'tool_call' ORDER BY timestamp",
            (trace_id,),
        )
        rows = await cursor.fetchall()

    # Count per-person emails in the analysis window
    window_volumes: dict[str, int] = {}
    for row in rows:
        tool_out = dict(row).get("tool_output", "")
        if not tool_out:
            continue
        try:
            data = json.loads(tool_out)
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and "source" in item and "target" in item:
                        vol = int(item.get("volume", item.get("total_volume", 1)))
                        for person_key in ("source", "target"):
                            p = item[person_key]
                            window_volumes[p] = window_volumes.get(p, 0) + vol
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    deviations = []
    for person, window_vol in window_volumes.items():
        baseline = baseline_map.get(person)
        if not baseline:
            continue
        baseline_vol = baseline["total_volume"] or 1
        change_pct = ((window_vol - baseline_vol) / baseline_vol) * 100

        if abs(change_pct) > 200:
            severity = "significant"
        elif abs(change_pct) > 50:
            severity = "notable"
        else:
            severity = "normal"

        deviations.append({
            "person": person,
            "name": baseline.get("name", person),
            "baseline_volume": baseline_vol,
            "window_volume": window_vol,
            "change_pct": round(change_pct, 1),
            "severity": severity,
        })

    deviations.sort(key=lambda d: abs(d["change_pct"]), reverse=True)
    return deviations[:20]


# ── Monitoring: Threshold Sensitivity ─────────────────────────────────────

@router.get("/sensitivity/{trace_id}")
async def get_sensitivity(trace_id: str, thresholds: str = "1.0,1.5,2.0,2.5,3.0"):
    """Re-evaluate anomalous edges at different thresholds."""
    threshold_list = [float(t.strip()) for t in thresholds.split(",")]

    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? AND event_type = 'tool_call' ORDER BY timestamp",
            (trace_id,),
        )
        rows = await cursor.fetchall()

    # Collect all edges with anomaly scores
    all_edges = []
    seen = set()
    for row in rows:
        tool_out = dict(row).get("tool_output", "")
        if not tool_out:
            continue
        try:
            data = json.loads(tool_out)
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and "anomaly_score" in item and "source" in item:
                        key = (item["source"], item["target"])
                        if key not in seen:
                            seen.add(key)
                            all_edges.append(item)
        except (json.JSONDecodeError, TypeError):
            pass

    results = []
    for thresh in threshold_list:
        flagged = [e for e in all_edges if float(e.get("anomaly_score", 0)) >= thresh]
        people = set()
        for e in flagged:
            people.add(e["source"])
            people.add(e["target"])
        results.append({
            "threshold": thresh,
            "flagged_edges": len(flagged),
            "flagged_people": len(people),
        })

    return results


# ── Monitoring: Drift Detection ───────────────────────────────────────────

@router.get("/monitoring/drift/{trace_id}")
async def get_drift(trace_id: str):
    """Compare current trace against the most recent previous trace."""
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row

        # Get all traces ordered by time
        cursor = await db.execute(
            "SELECT DISTINCT trace_id, MIN(timestamp) AS started_at FROM forensic_records GROUP BY trace_id ORDER BY started_at DESC"
        )
        all_traces = [dict(r) for r in await cursor.fetchall()]

    if len(all_traces) < 2:
        return {"drift_detected": False, "message": "Need at least 2 analysis runs to detect drift"}

    current_idx = next((i for i, t in enumerate(all_traces) if t["trace_id"] == trace_id), -1)
    if current_idx == -1 or current_idx >= len(all_traces) - 1:
        return {"drift_detected": False, "message": "No previous run to compare against"}

    prev_trace_id = all_traces[current_idx + 1]["trace_id"]

    # Extract edges from both traces
    async def _extract_edges(tid: str) -> dict[str, float]:
        async with aiosqlite.connect(settings.forensic_db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT tool_output FROM forensic_records WHERE trace_id = ? AND event_type = 'tool_call'",
                (tid,),
            )
            rows = await cursor.fetchall()

        edge_scores: dict[str, float] = {}
        for row in rows:
            tool_out = dict(row).get("tool_output", "")
            if not tool_out:
                continue
            try:
                data = json.loads(tool_out)
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and "source" in item and "target" in item and "anomaly_score" in item:
                            key = f"{item['source']}→{item['target']}"
                            edge_scores[key] = max(edge_scores.get(key, 0), float(item["anomaly_score"]))
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        return edge_scores

    current_edges = await _extract_edges(trace_id)
    prev_edges = await _extract_edges(prev_trace_id)

    new_edges = [k for k in current_edges if k not in prev_edges and current_edges[k] > 2.0]
    removed_edges = [k for k in prev_edges if k not in current_edges and prev_edges[k] > 2.0]
    score_changes = []
    for k in current_edges:
        if k in prev_edges:
            delta = current_edges[k] - prev_edges[k]
            if abs(delta) > 0.5:
                score_changes.append({"edge": k, "prev": prev_edges[k], "current": current_edges[k], "delta": round(delta, 2)})

    score_changes.sort(key=lambda x: abs(x["delta"]), reverse=True)

    return {
        "drift_detected": len(new_edges) > 0 or len(score_changes) > 0,
        "compared_to": prev_trace_id,
        "new_anomalous_edges": new_edges[:10],
        "removed_anomalous_edges": removed_edges[:10],
        "score_changes": score_changes[:10],
        "summary": f"{len(new_edges)} new anomalous edges, {len(removed_edges)} resolved, {len(score_changes)} score changes",
    }


# ── Real-Time Email Ingestion Simulator ──────────────────────────────────

class StreamRequest(BaseModel):
    speed: int = 5  # 1x, 5x, 10x


@router.post("/monitoring/simulate-stream")
async def start_stream(req: StreamRequest, background_tasks: BackgroundTasks):
    """Start replaying Enron emails in accelerated time."""
    if _stream["active"]:
        return {"status": "already_running", **_stream_status()}

    _stream["speed"] = req.speed
    _stream["active"] = True
    _stream["position"] = 0
    _stream["emails_processed"] = 0
    _stream["alerts_generated"] = 0

    background_tasks.add_task(_run_stream_simulation)
    return {"status": "started", "speed": req.speed}


@router.get("/monitoring/simulate-stream/status")
async def stream_status():
    return _stream_status()


@router.post("/monitoring/simulate-stream/stop")
async def stop_stream():
    _stream["active"] = False
    return {"status": "stopped"}


def _stream_status() -> dict:
    return {
        "active": _stream["active"],
        "position": _stream["position"],
        "total_weeks": _stream["total_weeks"],
        "emails_processed": _stream["emails_processed"],
        "total_emails": _stream["total_emails"],
        "alerts_generated": _stream["alerts_generated"],
        "speed": _stream["speed"],
        "current_week_label": _stream["current_week_label"],
    }


async def _run_stream_simulation():
    """Background task: replay emails week-by-week, push updates via WebSocket."""
    from api.ws_alerts import broadcast_alert
    from integrations.slack_mcp import send_alert_to_slack

    # Fetch all emails sorted by date
    query = """
        MATCH (sender:Person)-[:SENT]->(e:Email)-[:RECEIVED_TO]->(receiver:Person)
        WHERE e.date IS NOT NULL
        RETURN sender.email AS source, receiver.email AS target,
               e.date AS date, e.subject AS subject,
               COALESCE(sender.department, 'Unknown') AS source_dept,
               COALESCE(receiver.department, 'Unknown') AS target_dept
        ORDER BY e.date
    """
    try:
        all_emails = neo4j_client.execute_read(query, {})
    except Exception:
        _stream["active"] = False
        return

    if not all_emails:
        _stream["active"] = False
        return

    _stream["total_emails"] = len(all_emails)

    # Group into weekly batches
    from collections import defaultdict
    weekly: dict[str, list] = defaultdict(list)
    for email in all_emails:
        date_str = str(email.get("date", ""))[:10]
        if len(date_str) >= 7:
            # Group by ISO week (year-week)
            try:
                dt = datetime.fromisoformat(date_str)
                week_key = f"{dt.year}-W{dt.isocalendar()[1]:02d}"
                weekly[week_key].append(email)
            except ValueError:
                pass

    weeks = sorted(weekly.keys())
    _stream["total_weeks"] = len(weeks)

    # Replay
    interval = max(0.5, 3.0 / _stream["speed"])  # seconds between batches

    for i, week_key in enumerate(weeks):
        if not _stream["active"]:
            break

        batch = weekly[week_key]
        _stream["position"] = i + 1
        _stream["current_week_label"] = week_key
        _stream["emails_processed"] += len(batch)

        # Build graph update from this batch
        edge_map: dict[tuple, dict] = {}
        for email in batch:
            src, tgt = email["source"], email["target"]
            key = (src, tgt)
            if key not in edge_map:
                edge_map[key] = {
                    "source": src, "target": tgt, "volume": 0,
                    "source_dept": email.get("source_dept", "Unknown"),
                    "target_dept": email.get("target_dept", "Unknown"),
                }
            edge_map[key]["volume"] += 1

        # Detect volume spikes
        spike_edges = [e for e in edge_map.values() if e["volume"] > 3]
        # Secondary: total weekly volume spike
        if not spike_edges:
            total_week_volume = sum(e["volume"] for e in edge_map.values())
            if total_week_volume > 50:
                spike_edges = sorted(edge_map.values(), key=lambda e: e["volume"], reverse=True)[:3]

        # Build nodes from edges
        node_set: dict[str, dict] = {}
        for e in edge_map.values():
            for person_key in ("source", "target"):
                pid = e[person_key]
                if pid not in node_set:
                    dept_key = "source_dept" if person_key == "source" else "target_dept"
                    node_set[pid] = {
                        "id": pid,
                        "name": pid.split("@")[0].replace(".", " ").title(),
                        "department": e.get(dept_key, "Unknown"),
                    }

        graph_update = {
            "type": "graph_update",
            "week": week_key,
            "position": i + 1,
            "total_weeks": len(weeks),
            "emails_in_batch": len(batch),
            "nodes": list(node_set.values())[:50],
            "edges": [{"source": e["source"], "target": e["target"],
                       "volume": e["volume"], "anomaly_score": 0}
                      for e in edge_map.values()][:100],
        }

        try:
            await broadcast_alert(graph_update)
        except Exception:
            pass

        # Fire alert for volume spikes
        if spike_edges:
            _stream["alerts_generated"] += 1
            alert = {
                "type": "stream_alert",
                "alert_id": str(uuid.uuid4()),
                "trace_id": f"stream-{week_key}",
                "threat_category": "volume_spike",
                "confidence_score": min(0.95, 0.5 + len(spike_edges) * 0.1),
                "summary": f"Volume spike in {week_key}: {len(spike_edges)} high-volume pairs detected",
                "anomalous_edges": spike_edges[:5],
                "proposed_action": "review_required",
                "week": week_key,
            }
            try:
                await broadcast_alert(alert)
                await send_alert_to_slack(alert)
            except Exception:
                pass

        await asyncio.sleep(interval)

    _stream["active"] = False


# ── Slack Notifications ──────────────────────────────────────────────────

@router.get("/notifications")
async def get_slack_notifications(limit: int = 20):
    """Get recent Slack/mock notifications."""
    from integrations.slack_mcp import get_notifications
    return await get_notifications(limit)
