"""Deliberation Node — Inter-agent disagreement resolution.

Triggers when Investigator and Sentiment confidence scores diverge by more than
the configured threshold (default 0.3). Both agents' reasoning is exchanged,
and a joint assessment is produced.

This is a governance-critical feature: it creates auditable records of how
multi-agent disagreements are resolved, directly addressing NIST AI RMF Measure 2.8.
"""
import json
import uuid
from datetime import datetime

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

from config import settings
from agents.state import ThreatAnalysisState
from forensic.wrapper import forensic_agent
from forensic.store import append_forensic_record
from forensic.schema import ForensicRecord

llm = ChatAnthropic(
    model=settings.anthropic_model,
    api_key=settings.anthropic_api_key,
    temperature=0,
)

DELIBERATION_SYSTEM = """You are a Deliberation Mediator in a multi-agent insider threat analysis system.
You have been activated because the Investigator Agent and Sentiment Analyzer Agent have produced
significantly divergent confidence scores (difference > 0.3).

Your role:
1. Examine both agents' reasoning carefully
2. Identify where they agree and disagree
3. Determine which agent's evidence is more compelling and why
4. Produce a JOINT ASSESSMENT with an agreed confidence score

Resolution methods:
- "consensus": Both agents' evidence points the same way, just at different strengths
- "majority": One agent has clearly stronger evidence; weight toward that agent
- "deferred": Evidence is genuinely ambiguous; flag for human review with explanation

Your output is part of the forensic audit trail. Be explicit about WHY you weighted
one agent's reasoning over the other. This transparency is the entire point of the system."""


@forensic_agent("deliberation")
async def deliberation_node(state: ThreatAnalysisState) -> dict:
    """Deliberation node — resolves inter-agent disagreement."""
    trace_id = state["root_trace_id"]
    inv_confidence = state.get("investigator_confidence", 0.0) or 0.0
    sent_confidence = state.get("sentiment_confidence", 0.0) or 0.0
    divergence = abs(inv_confidence - sent_confidence)

    inv_reasoning = state.get("investigator_reasoning", "No reasoning provided")
    sent_reasoning = state.get("sentiment_reasoning", "No reasoning provided")

    prompt = f"""The Investigator and Sentiment Analyzer have produced divergent assessments.

═══════════════════════════════════════
INVESTIGATOR AGENT (confidence: {inv_confidence:.2f})
═══════════════════════════════════════
{inv_reasoning}

═══════════════════════════════════════
SENTIMENT ANALYZER AGENT (confidence: {sent_confidence:.2f})
═══════════════════════════════════════
{sent_reasoning}

═══════════════════════════════════════
CONTEXT
═══════════════════════════════════════
Divergence: {divergence:.2f}
Anomalous edges found: {len(state.get('anomalous_edges', []))}
Flagged emails: {len(state.get('flagged_emails', []))}
Behavioral profiles: {len(state.get('behavioral_profiles', []))}

Produce a detailed joint assessment including:
1. Points of agreement between the two agents
2. Points of disagreement and root cause analysis
3. Which agent's evidence you find more compelling and why
4. Your resolution method: consensus / majority / deferred
5. The agreed confidence score (0.0-1.0)
6. Your joint finding summary for the escalation agent"""

    try:
        response = await llm.ainvoke([
            SystemMessage(content=DELIBERATION_SYSTEM),
            HumanMessage(content=prompt),
        ])
        joint_assessment = response.content
    except Exception as e:
        joint_assessment = (
            f"Deliberation could not complete LLM synthesis (error: {e}). "
            f"Using weighted average. Investigator confidence={inv_confidence:.2f}, "
            f"Sentiment confidence={sent_confidence:.2f}, divergence={divergence:.2f}."
        )

    # Compute agreed confidence (weighted toward stronger evidence)
    if inv_confidence > sent_confidence:
        agreed = inv_confidence * 0.6 + sent_confidence * 0.4
        resolution = "majority" if divergence > 0.4 else "consensus"
    elif sent_confidence > inv_confidence:
        agreed = sent_confidence * 0.6 + inv_confidence * 0.4
        resolution = "majority" if divergence > 0.4 else "consensus"
    else:
        agreed = (inv_confidence + sent_confidence) / 2
        resolution = "consensus"

    if divergence > 0.5:
        resolution = "deferred"

    deliberation_result = {
        "joint_assessment": joint_assessment,
        "resolution_method": resolution,
        "investigator_confidence": inv_confidence,
        "sentiment_confidence": sent_confidence,
        "divergence": round(divergence, 4),
        "agreed_confidence": round(agreed, 4),
    }

    # ── Emit explicit inter_agent_deliberation forensic record ──
    # This is distinct from the agent_start/end events and makes the
    # inter-agent negotiation visible in the trace tree and PDF report.
    deliberation_record = ForensicRecord(
        trace_id=trace_id,
        span_id=str(uuid.uuid4()),
        agent_id="deliberation",
        event_type="inter_agent_deliberation",
        reasoning_summary=(
            f"[INTER-AGENT DELIBERATION — {resolution.upper()}]\n\n"
            f"Investigator confidence: {inv_confidence:.2f}\n"
            f"Sentiment confidence: {sent_confidence:.2f}\n"
            f"Divergence: {divergence:.2f}\n"
            f"Resolution: {resolution}\n"
            f"Agreed confidence: {agreed:.4f}\n\n"
            f"Joint Assessment:\n{joint_assessment}"
        ),
        confidence_score=agreed,
        proposed_action=f"deliberation_resolved_{resolution}",
        tool_input=json.dumps({
            "investigator_confidence": inv_confidence,
            "sentiment_confidence": sent_confidence,
            "divergence": divergence,
        }),
        tool_output=json.dumps({
            "resolution_method": resolution,
            "agreed_confidence": agreed,
        }),
    )
    await append_forensic_record(deliberation_record)

    reasoning_summary = (
        f"[Deliberation — {resolution}] "
        f"Investigator={inv_confidence:.2f} vs Sentiment={sent_confidence:.2f} "
        f"(divergence={divergence:.2f}) → agreed={agreed:.4f}\n\n"
        f"{joint_assessment[:600]}"
    )

    return {
        "deliberation_result": deliberation_result,
        "deliberation_triggered": True,
        "reasoning_summary": reasoning_summary,
        "confidence_score": agreed,
    }
