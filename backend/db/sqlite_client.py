import aiosqlite

from config import settings

_DB_PATH = settings.forensic_db_path


async def init_forensic_db():
    async with aiosqlite.connect(_DB_PATH) as db:
        # Clear stale data from previous sessions for fresh demo state
        await db.execute("DROP TABLE IF EXISTS forensic_records")
        await db.execute("DROP TABLE IF EXISTS human_reviews")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS forensic_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trace_id TEXT NOT NULL,
                span_id TEXT NOT NULL UNIQUE,
                parent_span_id TEXT,
                agent_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                tool_name TEXT,
                tool_input TEXT,
                tool_output TEXT,
                tool_call_hash TEXT,
                reasoning_summary TEXT,
                confidence_score REAL,
                proposed_action TEXT,
                datasets_accessed TEXT,
                record_hash TEXT NOT NULL,
                previous_record_hash TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_trace_id ON forensic_records(trace_id)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_parent_span ON forensic_records(parent_span_id)
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS human_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_id TEXT NOT NULL UNIQUE,
                trace_id TEXT NOT NULL,
                analyst_id TEXT NOT NULL,
                decision TEXT NOT NULL,
                rationale TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()


async def get_db():
    return aiosqlite.connect(_DB_PATH)
