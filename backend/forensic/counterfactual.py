"""Counterfactual analysis engine.

Given a completed forensic trace, recalculates escalation confidence
with individual agent contributions zeroed out. Returns per-agent
attribution scores showing which agent was decisive.
"""


def compute_counterfactual(records: list[dict]) -> dict:
    """Compute counterfactual analysis for a forensic trace.

    Identifies each agent's contribution to the final confidence score
    and shows what would happen if each agent's contribution were removed.
    """
    # Extract agent-level confidence contributions
    agent_scores: dict[str, float] = {}
    final_confidence: float = 0.0

    for record in records:
        if record.get("event_type") == "agent_end" and record.get("confidence_score") is not None:
            agent_scores[record["agent_id"]] = record["confidence_score"]
        if record.get("event_type") == "escalation_alert":
            final_confidence = record.get("confidence_score", 0.0)

    if not agent_scores or final_confidence == 0:
        return {
            "final_confidence": final_confidence,
            "attributions": {},
            "counterfactuals": {},
            "message": "Insufficient data for counterfactual analysis",
        }

    # Compute weighted attributions
    total_raw = sum(agent_scores.values())
    attributions = {}
    counterfactuals = {}

    for agent_id, score in agent_scores.items():
        weight = score / total_raw if total_raw > 0 else 0
        contribution = weight * final_confidence
        attributions[agent_id] = round(contribution, 4)

        # What confidence would be without this agent
        remaining_total = total_raw - score
        if remaining_total > 0:
            recalc = sum(
                (s / remaining_total) * final_confidence
                for aid, s in agent_scores.items()
                if aid != agent_id
            )
        else:
            recalc = 0.0

        counterfactuals[agent_id] = {
            "confidence_without": round(recalc, 4),
            "delta": round(final_confidence - recalc, 4),
            "was_decisive": (recalc < 0.7) != (final_confidence < 0.7),
        }

    return {
        "final_confidence": final_confidence,
        "attributions": attributions,
        "counterfactuals": counterfactuals,
    }
