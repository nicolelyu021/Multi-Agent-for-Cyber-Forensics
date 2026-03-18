import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

router = APIRouter()

# In-memory run tracking (sufficient for course demo)
_runs: dict[str, dict] = {}


class AnalysisRequest(BaseModel):
    start_date: str
    end_date: str
    anomaly_threshold: float = 2.0
    confidence_threshold: float = 0.7
    departments: list[str] | None = None


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
