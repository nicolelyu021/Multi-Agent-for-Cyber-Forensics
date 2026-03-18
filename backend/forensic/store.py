import aiosqlite

from config import settings
from forensic.schema import ForensicRecord
from forensic.hasher import hash_record


async def append_forensic_record(record: ForensicRecord) -> ForensicRecord:
    """Append a forensic record to the SQLite store with hash chain linking."""
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        # Get the previous record's hash for chain linking
        cursor = await db.execute(
            "SELECT record_hash FROM forensic_records WHERE trace_id = ? ORDER BY id DESC LIMIT 1",
            (record.trace_id,),
        )
        prev = await cursor.fetchone()
        record.previous_record_hash = prev[0] if prev else None

        # Compute this record's hash
        record_dict = record.model_dump()
        record.record_hash = hash_record(record_dict)
        record_dict["record_hash"] = record.record_hash

        await db.execute(
            """INSERT INTO forensic_records
               (trace_id, span_id, parent_span_id, agent_id, timestamp, event_type,
                tool_name, tool_input, tool_output, tool_call_hash,
                reasoning_summary, confidence_score, proposed_action, datasets_accessed,
                record_hash, previous_record_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record.trace_id, record.span_id, record.parent_span_id,
                record.agent_id, record.timestamp, record.event_type,
                record.tool_name, record.tool_input, record.tool_output,
                record.tool_call_hash, record.reasoning_summary,
                record.confidence_score, record.proposed_action,
                record.datasets_accessed, record.record_hash,
                record.previous_record_hash,
            ),
        )
        await db.commit()
    return record


async def get_trace(trace_id: str) -> list[dict]:
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY id",
            (trace_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
