"""LangGraph shared state definition for the threat analysis pipeline."""
from typing import TypedDict, Optional


class AnomalousEdge(TypedDict):
    source: str
    target: str
    volume: int
    baseline: float
    anomaly_score: float
    email_ids: list[str]


class BehavioralProfile(TypedDict):
    person: str
    vader_compound: float
    flagged_keywords: list[str]
    keyword_context: list[dict]
    sentiment_score: float


class DeliberationResult(TypedDict):
    joint_assessment: str
    resolution_method: str  # "consensus", "majority", "deferred"
    investigator_reasoning: str
    sentiment_reasoning: str
    agreed_confidence: float


class AlertPayload(TypedDict):
    alert_id: str
    trace_id: str
    threat_category: str
    confidence_score: float
    summary: str
    anomalous_edges: list[dict]
    behavioral_profiles: list[dict]
    proposed_action: str


class ThreatAnalysisState(TypedDict):
    # Input params
    start_date: str
    end_date: str
    anomaly_threshold: float
    confidence_threshold: float

    # Forensic metadata
    root_trace_id: str
    datasets_accessed: list[str]

    # Investigator outputs
    anomalous_edges: list[AnomalousEdge]
    investigated_email_ids: list[str]
    investigator_confidence: float
    investigator_reasoning: str

    # Sentiment outputs
    behavioral_profiles: list[BehavioralProfile]
    flagged_emails: list[str]
    sentiment_confidence: float
    sentiment_reasoning: str

    # Deliberation outputs (when agents disagree)
    deliberation_result: Optional[DeliberationResult]
    deliberation_triggered: bool

    # Escalation outputs
    final_confidence: float
    alert_payload: Optional[AlertPayload]
    threat_category: str

    # Human review
    review_status: str  # "pending_review", "confirmed", "dismissed", "escalated"
    analyst_id: Optional[str]
    analyst_decision: Optional[str]
    override_reason: Optional[str]
