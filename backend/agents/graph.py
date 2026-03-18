"""LangGraph state machine for the threat analysis pipeline.

Graph structure:
  START -> investigator
              |
              ├── (anomalies found) -> sentiment_analyzer
              │                              |
              │                    ┌─────────┤
              │                    │    (divergence > 0.3)
              │                    │         -> deliberation
              │                    │              |
              │                    └──────> escalation -> END
              │
              └── (no anomalies) -> END
"""
import uuid

from langgraph.graph import StateGraph, END

from agents.state import ThreatAnalysisState
from agents.investigator import investigator_node
from agents.sentiment import sentiment_node
from agents.deliberation import deliberation_node
from agents.escalation import escalation_node
from config import settings


def should_continue_after_investigator(state: ThreatAnalysisState) -> str:
    """Route after Investigator: continue if anomalies found, else end."""
    if state.get("anomalous_edges"):
        return "sentiment_analyzer"
    return END


def should_deliberate(state: ThreatAnalysisState) -> str:
    """Route after Sentiment: deliberate if confidence scores diverge, else escalate."""
    inv_conf = state.get("investigator_confidence", 0.0)
    sent_conf = state.get("sentiment_confidence", 0.0)
    divergence = abs(inv_conf - sent_conf)

    if divergence > settings.deliberation_divergence:
        return "deliberation"
    return "escalation"


# Build the graph
graph_builder = StateGraph(ThreatAnalysisState)

# Add nodes
graph_builder.add_node("investigator", investigator_node)
graph_builder.add_node("sentiment_analyzer", sentiment_node)
graph_builder.add_node("deliberation", deliberation_node)
graph_builder.add_node("escalation", escalation_node)

# Set entry point
graph_builder.set_entry_point("investigator")

# Add conditional edges
graph_builder.add_conditional_edges(
    "investigator",
    should_continue_after_investigator,
    {"sentiment_analyzer": "sentiment_analyzer", END: END},
)

graph_builder.add_conditional_edges(
    "sentiment_analyzer",
    should_deliberate,
    {"deliberation": "deliberation", "escalation": "escalation"},
)

# Deliberation always leads to escalation
graph_builder.add_edge("deliberation", "escalation")

# Escalation ends the graph
graph_builder.add_edge("escalation", END)

# Compile
threat_analysis_graph = graph_builder.compile()


async def run_threat_analysis(
    start_date: str,
    end_date: str,
    anomaly_threshold: float = 2.0,
    confidence_threshold: float = 0.7,
) -> dict:
    """Run the full threat analysis pipeline."""
    initial_state: ThreatAnalysisState = {
        "start_date": start_date,
        "end_date": end_date,
        "anomaly_threshold": anomaly_threshold,
        "confidence_threshold": confidence_threshold,
        "root_trace_id": str(uuid.uuid4()),
        "datasets_accessed": [],
        "anomalous_edges": [],
        "investigated_email_ids": [],
        "investigator_confidence": 0.0,
        "investigator_reasoning": "",
        "behavioral_profiles": [],
        "flagged_emails": [],
        "sentiment_confidence": 0.0,
        "sentiment_reasoning": "",
        "deliberation_result": None,
        "deliberation_triggered": False,
        "final_confidence": 0.0,
        "alert_payload": None,
        "threat_category": "",
        "review_status": "",
        "analyst_id": None,
        "analyst_decision": None,
        "override_reason": None,
    }

    result = await threat_analysis_graph.ainvoke(initial_state)

    return {
        "trace_id": result["root_trace_id"],
        "final_confidence": result.get("final_confidence", 0.0),
        "threat_category": result.get("threat_category", ""),
        "review_status": result.get("review_status", ""),
        "anomalies_found": len(result.get("anomalous_edges", [])),
        "emails_flagged": len(result.get("flagged_emails", [])),
        "deliberation_triggered": result.get("deliberation_triggered", False),
        "alert_payload": result.get("alert_payload"),
    }
