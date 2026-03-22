"""Investigator Agent — Graph/structural analysis of communication patterns.

Uses Neo4j topology to detect anomalous communication patterns:
- Degree centrality analysis
- 30-day trailing volume vs baseline comparison
- Anomaly scoring via z-score
"""
import json
import uuid

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from config import settings
from agents.state import ThreatAnalysisState
from agents.tools.neo4j_queries import (
    detect_anomalies,
    detect_threat_emails,
    get_communication_volume,
    get_emails_between,
)
from forensic.wrapper import forensic_agent

llm = ChatOpenAI(
    model=settings.openai_model,
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url,
    temperature=0,
)

INVESTIGATOR_SYSTEM = """You are an Investigator Agent in a multi-agent insider threat analysis system.
Your role is to analyze communication graph topology from the Enron email corpus to identify
anomalous patterns that may indicate insider threats.

You analyze:
1. Communication volume anomalies (z-score > threshold against 30-day trailing baseline)
2. Degree centrality changes (sudden increase in connections)
3. Unusual communication pairs (cross-department, cross-hierarchy)

For each anomaly found, provide:
- A clear explanation of WHY the pattern is anomalous
- Your confidence level (0.0-1.0)
- Which threat category it most likely maps to: financial_fraud, data_destruction, inappropriate_relations

Be specific and cite the data. Your reasoning will be captured in a forensic trace."""


@forensic_agent("investigator")
async def investigator_node(state: ThreatAnalysisState) -> dict:
    """Investigator agent node for LangGraph."""
    trace_id = state["root_trace_id"]

    # Step 1: Detect communication anomalies
    anomalies = await detect_anomalies(
        start_date=state["start_date"],
        end_date=state["end_date"],
        threshold=state["anomaly_threshold"],
        person_emails=state.get("person_emails"),
        departments=state.get("departments"),
        trace_id=trace_id,
    )

    # Step 1b: Content-based threat scan (catches threats missed by volume analysis)
    threat_edges = await detect_threat_emails(
        start_date=state["start_date"],
        end_date=state["end_date"],
        person_emails=state.get("person_emails"),
        departments=state.get("departments"),
        trace_id=trace_id,
    )

    # Merge threat edges not already found by structural analysis
    existing_pairs = {(a["source"], a["target"]) for a in anomalies}
    for te in threat_edges:
        if (te["source"], te["target"]) not in existing_pairs:
            anomalies.append({
                "source": te["source"],
                "target": te["target"],
                "recent_volume": te.get("total_volume", 0),
                "baseline": 0,
                "anomaly_score": max(
                    float(te.get("anomaly_score", 1.0)),
                    2.0 + float(te.get("threat_volume", 0)) * 0.3,
                ),
                "total_volume": te.get("total_volume", 0),
            })
            existing_pairs.add((te["source"], te["target"]))

    if not anomalies:
        return {
            "anomalous_edges": [],
            "investigated_email_ids": [],
            "investigator_confidence": 0.0,
            "investigator_reasoning": "No communication anomalies detected in the specified time window.",
            "reasoning_summary": "No anomalies found",
            "confidence_score": 0.0,
            "datasets_accessed": ["neo4j:Person", "neo4j:COMMUNICATES_WITH"],
        }

    # Step 2: Get volume data for context
    volumes = await get_communication_volume(
        start_date=state["start_date"],
        end_date=state["end_date"],
        trace_id=trace_id,
    )

    # Step 3: Get emails for the top anomalous edges
    email_ids = []
    anomalous_edges = []
    for anomaly in anomalies[:5]:  # Top 5 anomalies
        emails = await get_emails_between(
            source=anomaly["source"],
            target=anomaly["target"],
            start_date=state["start_date"],
            end_date=state["end_date"],
            trace_id=trace_id,
        )
        edge_email_ids = [e["message_id"] for e in emails]
        email_ids.extend(edge_email_ids)
        anomalous_edges.append({
            "source": anomaly["source"],
            "target": anomaly["target"],
            "volume": anomaly.get("recent_volume", 0),
            "baseline": anomaly.get("baseline", 0),
            "anomaly_score": anomaly["anomaly_score"],
            "email_ids": edge_email_ids,
        })

    # Step 4: Use LLM to synthesize findings
    analysis_prompt = f"""Analyze these communication anomalies from the Enron email corpus:

Time window: {state['start_date']} to {state['end_date']}
Anomaly threshold (z-score): {state['anomaly_threshold']}

Detected anomalies:
{json.dumps(anomalous_edges, indent=2)}

Top communication volumes:
{json.dumps(volumes[:20], indent=2)}

Provide:
1. A summary of the most suspicious patterns
2. Your confidence (0.0-1.0) that insider threat activity is occurring
3. Which threat category is most likely
4. Your detailed reasoning (this will be part of the forensic audit trail)"""

    response = await llm.ainvoke([
        SystemMessage(content=INVESTIGATOR_SYSTEM),
        HumanMessage(content=analysis_prompt),
    ])

    # Parse confidence from LLM response (fallback to heuristic)
    confidence = min(1.0, max(anomaly["anomaly_score"] for anomaly in anomalies[:10]) / 5.0)

    return {
        "anomalous_edges": anomalous_edges,
        "investigated_email_ids": email_ids,
        "investigator_confidence": confidence,
        "investigator_reasoning": response.content,
        "reasoning_summary": response.content[:3000],
        "confidence_score": confidence,
        "datasets_accessed": ["neo4j:Person", "neo4j:Email", "neo4j:COMMUNICATES_WITH"],
    }
