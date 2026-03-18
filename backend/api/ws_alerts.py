import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# Global alert bus
_subscribers: list[WebSocket] = []


async def broadcast_alert(alert: dict):
    dead = []
    for ws in _subscribers:
        try:
            await ws.send_text(json.dumps(alert))
        except Exception:
            dead.append(ws)
    for ws in dead:
        _subscribers.remove(ws)


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    await websocket.accept()
    _subscribers.append(websocket)
    try:
        while True:
            # Keep connection alive; client may send heartbeats
            await websocket.receive_text()
    except WebSocketDisconnect:
        _subscribers.remove(websocket)
