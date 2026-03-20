"""Slack webhook integration for alert notifications.

When SLACK_WEBHOOK_URL is "mock" (default), alerts are stored in SQLite
and broadcast via WebSocket so the frontend can show a mock Slack feed.

When a real webhook URL is provided, alerts are also POSTed to Slack.
"""
import json
import uuid
from datetime import datetime

import aiosqlite

from config import settings


async def _ensure_table():
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS slack_notifications (
                id TEXT PRIMARY KEY,
                trace_id TEXT,
                channel TEXT DEFAULT '#threat-alerts',
                severity TEXT,
                message TEXT,
                payload TEXT,
                created_at TEXT
            )
        """)
        await db.commit()


async def send_alert_to_slack(alert: dict) -> dict:
    """Send an alert to Slack (or mock Slack).

    Returns the notification record that was created.
    """
    await _ensure_table()

    severity = "HIGH" if alert.get("confidence_score", 0) >= 0.7 else "MODERATE" if alert.get("confidence_score", 0) >= 0.4 else "LOW"
    threat = alert.get("threat_category", "unknown").replace("_", " ").title()

    # Build human-readable message
    people = []
    for edge in alert.get("anomalous_edges", [])[:3]:
        if isinstance(edge, dict):
            src = str(edge.get("source", "")).split("@")[0].replace(".", " ").title()
            tgt = str(edge.get("target", "")).split("@")[0].replace(".", " ").title()
            people.append(f"{src} ↔ {tgt}")

    people_str = ", ".join(people) if people else "N/A"
    conf_pct = f"{alert.get('confidence_score', 0) * 100:.0f}%"

    message = (
        f"🚨 *{severity} RISK: {threat}*\n"
        f"Confidence: *{conf_pct}*\n"
        f"People: {people_str}\n"
        f"Action: {alert.get('proposed_action', 'Review required')}"
    )

    notification = {
        "id": str(uuid.uuid4()),
        "trace_id": alert.get("trace_id", ""),
        "channel": "#threat-alerts",
        "severity": severity,
        "message": message,
        "payload": json.dumps(alert),
        "created_at": datetime.utcnow().isoformat(),
    }

    # Store in SQLite
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        await db.execute(
            """INSERT INTO slack_notifications (id, trace_id, channel, severity, message, payload, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (notification["id"], notification["trace_id"], notification["channel"],
             notification["severity"], notification["message"], notification["payload"],
             notification["created_at"]),
        )
        await db.commit()

    # If real Slack webhook, POST to it
    if settings.slack_webhook_url and settings.slack_webhook_url != "mock":
        try:
            import httpx
            slack_payload = {
                "blocks": [
                    {"type": "header", "text": {"type": "plain_text", "text": f"🚨 {severity}: {threat}"}},
                    {"type": "section", "text": {"type": "mrkdwn", "text": message}},
                    {"type": "context", "elements": [
                        {"type": "mrkdwn", "text": f"Trace: `{alert.get('trace_id', '')[:12]}` | {datetime.utcnow().strftime('%H:%M UTC')}"}
                    ]},
                ]
            }
            async with httpx.AsyncClient() as client:
                await client.post(settings.slack_webhook_url, json=slack_payload, timeout=5)
        except Exception:
            pass  # Don't fail the alert pipeline over Slack

    return notification


async def get_notifications(limit: int = 20) -> list[dict]:
    """Retrieve recent Slack notifications."""
    await _ensure_table()
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM slack_notifications ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [dict(row) for row in await cursor.fetchall()]
