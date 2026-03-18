import json

import aiosqlite
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from config import settings
from forensic.hasher import verify_chain
from forensic.counterfactual import compute_counterfactual
from forensic.tamper_sim import simulate_tampering
from forensic.exporters import generate_pdf_report

router = APIRouter()


@router.get("/traces")
async def list_traces():
    """List all available trace IDs with rich summary info."""
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT trace_id,
                   MIN(timestamp) AS started_at,
                   MAX(timestamp) AS ended_at,
                   COUNT(*) AS record_count,
                   MAX(CASE WHEN event_type = 'escalation_alert' THEN confidence_score
                            WHEN event_type = 'agent_end' AND agent_id = 'escalation' THEN confidence_score
                            END) AS confidence,
                   MAX(CASE WHEN event_type = 'escalation_alert' THEN proposed_action END) AS threat_category,
                   MAX(CASE WHEN event_type = 'agent_end' AND agent_id = 'escalation' THEN reasoning_summary END) AS escalation_summary,
                   MAX(CASE WHEN event_type = 'agent_end' AND agent_id = 'investigator' THEN reasoning_summary END) AS investigator_summary
            FROM forensic_records
            GROUP BY trace_id
            ORDER BY MIN(timestamp) DESC
            LIMIT 20
        """)
        rows = await cursor.fetchall()

        results = []
        for row in rows:
            d = dict(row)
            # Extract people from investigator reasoning
            people = []
            summary_text = d.get("investigator_summary") or d.get("escalation_summary") or ""
            import re
            found = re.findall(r'([\w.]+)@enron\.com', summary_text)
            # Deduplicate, keep order, limit to 4
            seen = set()
            for p in found:
                if p not in seen:
                    seen.add(p)
                    people.append(p.replace(".", " ").title())
                if len(people) >= 4:
                    break

            # Extract a one-line finding from escalation summary
            esc = d.get("escalation_summary") or ""
            short_summary = ""
            if "financial_fraud" in esc.lower():
                short_summary = "Financial fraud patterns detected"
            elif "data_destruction" in esc.lower():
                short_summary = "Document destruction activity found"
            elif "inappropriate" in esc.lower():
                short_summary = "Inappropriate relationship patterns"
            elif esc:
                # Take first sentence
                short_summary = esc.split(".")[0][:80]

            d["people"] = people
            d["short_summary"] = short_summary
            # Remove the large text fields from response
            d.pop("escalation_summary", None)
            d.pop("investigator_summary", None)
            results.append(d)
        return results


@router.get("/traces/{root_trace_id}")
async def get_traces(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY timestamp",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        return [dict(row) for row in rows]


@router.get("/verify/{root_trace_id}")
async def verify_trace(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY id",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]
    return verify_chain(records)


@router.get("/counterfactual/{root_trace_id}")
async def counterfactual(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY timestamp",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]
    return compute_counterfactual(records)


@router.get("/tamper-sim/{root_trace_id}")
async def tamper_sim(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY id",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]
    return simulate_tampering(records)


@router.get("/export-report/{root_trace_id}")
async def export_report(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY timestamp",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]

    pdf_buffer = generate_pdf_report(records, root_trace_id)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=audit_report_{root_trace_id}.pdf"},
    )
