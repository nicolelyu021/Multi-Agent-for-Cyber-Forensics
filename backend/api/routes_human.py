import uuid
from datetime import datetime

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from forensic.store import append_forensic_record
from forensic.schema import ForensicRecord

router = APIRouter()


class ReviewDecision(BaseModel):
    analyst_id: str
    decision: str  # "confirm", "dismiss", "escalate"
    rationale: str


@router.get("/pending")
async def get_pending_reviews():
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        # Find alerts that don't have a corresponding human_review
        cursor = await db.execute("""
            SELECT fr.trace_id, fr.span_id, fr.confidence_score, fr.proposed_action,
                   fr.reasoning_summary, fr.timestamp
            FROM forensic_records fr
            WHERE fr.event_type = 'escalation_alert'
              AND fr.trace_id NOT IN (SELECT trace_id FROM human_reviews)
            ORDER BY fr.timestamp DESC
        """)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


@router.post("/{alert_id}")
async def submit_review(alert_id: str, decision: ReviewDecision):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        # Verify the alert exists
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE span_id = ? AND event_type = 'escalation_alert'",
            (alert_id,),
        )
        alert = await cursor.fetchone()
        if not alert:
            raise HTTPException(404, "Alert not found")
        alert = dict(alert)

        # Store the human review
        await db.execute(
            "INSERT INTO human_reviews (alert_id, trace_id, analyst_id, decision, rationale) VALUES (?, ?, ?, ?, ?)",
            (alert_id, alert["trace_id"], decision.analyst_id, decision.decision, decision.rationale),
        )
        await db.commit()

    # Log the human override as a forensic record
    record = ForensicRecord(
        trace_id=alert["trace_id"],
        span_id=str(uuid.uuid4()),
        parent_span_id=alert_id,
        agent_id=f"human:{decision.analyst_id}",
        timestamp=datetime.utcnow().isoformat(),
        event_type="human_override",
        reasoning_summary=f"Analyst {decision.analyst_id} decided: {decision.decision}. Rationale: {decision.rationale}",
        confidence_score=alert.get("confidence_score"),
        proposed_action=decision.decision,
    )
    await append_forensic_record(record)

    return {"status": "recorded", "decision": decision.decision, "trace_id": alert["trace_id"]}
