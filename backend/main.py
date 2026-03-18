from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.neo4j_client import neo4j_client
from db.sqlite_client import init_forensic_db
from api.routes_graph import router as graph_router
from api.routes_forensic import router as forensic_router
from api.routes_analysis import router as analysis_router
from api.routes_human import router as human_router
from api.ws_alerts import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_forensic_db()
    yield
    neo4j_client.close()


app = FastAPI(
    title="Enron Threat Analysis",
    description="Multi-Agent Insider Threat Analysis with Forensic Traceability",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graph_router, prefix="/api/graph", tags=["graph"])
app.include_router(forensic_router, prefix="/api/forensic", tags=["forensic"])
app.include_router(analysis_router, prefix="/api/analysis", tags=["analysis"])
app.include_router(human_router, prefix="/api/review", tags=["review"])
app.include_router(ws_router, tags=["websocket"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "enron-threat-analysis"}
