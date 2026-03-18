"""Escalation Agent — Confidence aggregation and alert generation."""
import json
import uuid

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from config import settings
from agents.state import ThreatAnalysisState
from forensic.wrapper import forensic_agent
from api.ws_alerts import broadcast_alert

# Import keyword map at module level (not inside function) to avoid import errors
from agents.tools.vader_analysis import ALL_KEYWORDS

llm = ChatOpenAI(
    model=settings.openai_model,
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url,
    temperature=0,
)

ESCALATION_SYSTEM = """You are an Escalation Agent in a multi-agent insider threat analysis system.
You are the final decision-maker. Your role is to:

1. Aggregate confidence scores from the Investigator and Sentiment Analyzer
2. Consider the Deliberation result if agents disagreed
3. Determine the primary threat category
4. If confidence >= threshold, generate a structured alert for SOC analysts

Your alert should be:
- Concise but complete
- Actionable — what should the analyst investigate next?
- Connected to specific evidence (email IDs, keyword matches, anomaly scores)

Remember: alerts above threshold go to human review. Your confidence score and reasoning
will be scrutinized. Be calibrated — don't over-alert or under-alert."""


@forensic_agent("escalation")
async def escalation_node(state: ThreatAnalysisState) -> dict:
    """Escalation agent node for LangGraph."""
    trace_id = state["root_trace_id"]

    inv_conf = state.get("investigator_confidence", 0.0) or 0.0
    sent_conf = state.get("sentiment_confidence", 0.0) or 0.0

    if state.get("deliberation_triggered") and state.get("deliberation_result"):
        final_confidence = state["deliberation_result"]["agreed_confidence"]
    else:
        final_confidence = inv_conf * 0.5 + sent_conf * 0.5

    # Determine threat category from behavioral profiles (use module-level ALL_KEYWORDS)
    keyword_counts: dict[str, int] = {}
    for profile in state.get("behavioral_profiles", []):
        for kw in profile.get("flagged_keywords", []):
            for cat, kws in ALL_KEYWORDS.items():
                if kw.lower() in [k.lower() for k in kws]:
                    keyword_counts[cat] = keyword_counts.get(cat, 0) + 1

    threat_category = max(keyword_counts, key=keyword_counts.get) if keyword_counts else "financial_fraud"

    alert_payload = None
    review_status = "below_threshold"

    if final_confidence >= (state.get("confidence_threshold") or 0.7):
        anomalous_edges_summary = json.dumps(
            [{"source": e.get("source", ""), "target": e.get("target", ""),
              "anomaly_score": e.get("anomaly_score", 0),
              "volume": e.get("volume", 0)} for e in state.get("anomalous_edges", [])[:5]],
            indent=2
        )
        profiles_summary = json.dumps(
            [{"person": p.get("person", ""), "sentiment": p.get("vader_compound", 0),
              "keywords": p.get("flagged_keywords", [])[:5]} for p in state.get("behavioral_profiles", [])[:5]],
            indent=2
        )

        prompt = f"""Generate a concise alert summary for SOC analysts.

Final confidence: {final_confidence:.2f}
Threat category: {threat_category}
Investigator confidence: {inv_conf:.2f}
Sentiment confidence: {sent_conf:.2f}
Deliberation triggered: {state.get('deliberation_triggered', False)}

Anomalous communication edges:
{anomalous_edges_summary}

Behavioral profiles:
{profiles_summary}

Flagged emails: {len(state.get('flagged_emails', []))} total

Provide a clear 3-4 sentence alert summary and recommended next actions for the analyst."""

        try:
            response = await llm.ainvoke([
                SystemMessage(content=ESCALATION_SYSTEM),
                HumanMessage(content=prompt),
            ])
            alert_summary = response.content
        except Exception as e:
            alert_summary = (
                f"Escalation alert: {threat_category} detected with confidence {final_confidence:.2f}. "
                f"Investigator found {len(state.get('anomalous_edges', []))} anomalous edges. "
                f"Sentiment analysis flagged {len(state.get('flagged_emails', []))} emails."
            )

        alert_id = str(uuid.uuid4())
        alert_payload = {
            "alert_id": alert_id,
            "trace_id": trace_id,
            "threat_category": threat_category,
            "confidence_score": round(final_confidence, 4),
            "summary": alert_summary,
            "anomalous_edges": state.get("anomalous_edges", [])[:5],
            "behavioral_profiles": state.get("behavioral_profiles", [])[:5],
            "proposed_action": "human_review",
        }
        review_status = "pending_review"

        try:
            await broadcast_alert(alert_payload)
        except Exception:
            pass

    reasoning = (
        f"Final confidence: {final_confidence:.4f} (investigator={inv_conf:.2f}, sentiment={sent_conf:.2f}). "
        f"Threat category: {threat_category}. Status: {review_status}. "
        f"Deliberation triggered: {state.get('deliberation_triggered', False)}. "
        f"Anomalous edges: {len(state.get('anomalous_edges', []))}. "
        f"Flagged emails: {len(state.get('flagged_emails', []))}."
    )

    return {
        "final_confidence": round(final_confidence, 4),
        "alert_payload": alert_payload,
        "threat_category": threat_category,
        "review_status": review_status,
        "reasoning_summary": reasoning,
        "confidence_score": final_confidence,
        "proposed_action": review_status,
    }
