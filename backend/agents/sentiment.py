"""Sentiment Analyzer Agent — Psycholinguistic profiling of flagged communications.

Analyzes emails identified by the Investigator for:
- VADER compound sentiment scores
- Threat-category keyword scanning with context extraction
- Behavioral profiling of involved individuals
"""
import json

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from config import settings
from agents.state import ThreatAnalysisState
from agents.tools.vader_analysis import batch_analyze_emails, scan_keywords
from agents.tools.neo4j_queries import get_emails_between
from forensic.wrapper import forensic_agent

llm = ChatOpenAI(
    model=settings.openai_model,
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url,
    temperature=0,
)

SENTIMENT_SYSTEM = """You are a Sentiment Analyzer Agent in a multi-agent insider threat analysis system.
Your role is to perform psycholinguistic analysis on emails flagged by the Investigator Agent.

You analyze:
1. VADER sentiment scores — looking for unusually negative or stressed language
2. Threat-specific keywords — financial fraud terms (LJM, Raptor, SPE), destruction terms (shred, delete), etc.
3. Behavioral patterns — changes in tone, urgency, or topic over time

For each person analyzed, provide:
- A behavioral profile summarizing their communication patterns
- Your confidence level (0.0-1.0) that their behavior indicates insider threat activity
- Specific evidence (quotes, keywords, sentiment shifts)

Your reasoning becomes part of the forensic audit trail. Be precise and evidence-based."""


@forensic_agent("sentiment_analyzer")
async def sentiment_node(state: ThreatAnalysisState) -> dict:
    """Sentiment Analyzer agent node for LangGraph."""
    trace_id = state["root_trace_id"]
    anomalous_edges = state.get("anomalous_edges", [])

    if not anomalous_edges:
        return {
            "behavioral_profiles": [],
            "flagged_emails": [],
            "sentiment_confidence": 0.0,
            "sentiment_reasoning": "No anomalous edges to analyze.",
            "reasoning_summary": "No input from Investigator",
            "confidence_score": 0.0,
        }

    # Step 1: Collect emails from anomalous edges
    all_emails = []
    for edge in anomalous_edges:
        emails = await get_emails_between(
            source=edge["source"],
            target=edge["target"],
            start_date=state["start_date"],
            end_date=state["end_date"],
            trace_id=trace_id,
        )
        all_emails.extend(emails)

    if not all_emails:
        return {
            "behavioral_profiles": [],
            "flagged_emails": [],
            "sentiment_confidence": 0.0,
            "sentiment_reasoning": "No emails found for anomalous edges.",
            "reasoning_summary": "No emails to analyze",
            "confidence_score": 0.0,
        }

    # Step 2: Batch sentiment + keyword analysis
    analysis_results = await batch_analyze_emails(all_emails, trace_id=trace_id)

    # Step 3: Build behavioral profiles per person
    person_emails: dict[str, list] = {}
    for edge in anomalous_edges:
        for person in [edge["source"], edge["target"]]:
            if person not in person_emails:
                person_emails[person] = []

    for email, analysis in zip(all_emails, analysis_results):
        for edge in anomalous_edges:
            if email.get("message_id") in edge.get("email_ids", []):
                for person in [edge["source"], edge["target"]]:
                    person_emails.setdefault(person, []).append({
                        **email,
                        **analysis,
                    })

    flagged_emails = [r["message_id"] for r in analysis_results if r.get("flagged")]

    # Step 4: Use LLM for behavioral synthesis
    profiles_summary = {}
    for person, emails in person_emails.items():
        if not emails:
            continue
        avg_sentiment = sum(e.get("vader_compound", 0) for e in emails) / len(emails)
        all_keywords = {}
        for e in emails:
            for cat, kws in e.get("keywords", {}).items():
                all_keywords.setdefault(cat, set()).update(kws)
        profiles_summary[person] = {
            "email_count": len(emails),
            "avg_sentiment": round(avg_sentiment, 4),
            "keywords_by_category": {k: list(v) for k, v in all_keywords.items()},
        }

    analysis_prompt = f"""Analyze these behavioral profiles from Enron email analysis:

Time window: {state['start_date']} to {state['end_date']}
Investigator confidence: {state.get('investigator_confidence', 'N/A')}

Behavioral profiles:
{json.dumps(profiles_summary, indent=2)}

Total flagged emails: {len(flagged_emails)}
Sample flagged content (first 5):
{json.dumps(analysis_results[:5], indent=2, default=str)}

Provide:
1. For each person, a behavioral assessment
2. Your overall confidence (0.0-1.0) that insider threat activity is present
3. Which threat category the evidence most strongly supports
4. Specific quotes or keywords that are most concerning"""

    response = await llm.ainvoke([
        SystemMessage(content=SENTIMENT_SYSTEM),
        HumanMessage(content=analysis_prompt),
    ])

    # Compute confidence heuristic based on keyword density + sentiment extremes
    keyword_signal = min(1.0, len(flagged_emails) / max(len(all_emails), 1))
    sentiment_signal = min(1.0, sum(1 for r in analysis_results if r.get("vader_compound", 0) < -0.5) / max(len(analysis_results), 1))
    confidence = (keyword_signal * 0.6 + sentiment_signal * 0.4)

    behavioral_profiles = []
    for person, data in profiles_summary.items():
        behavioral_profiles.append({
            "person": person,
            "vader_compound": data["avg_sentiment"],
            "flagged_keywords": [kw for kws in data["keywords_by_category"].values() for kw in kws],
            "keyword_context": [],
            "sentiment_score": confidence,
        })

    return {
        "behavioral_profiles": behavioral_profiles,
        "flagged_emails": flagged_emails,
        "sentiment_confidence": confidence,
        "sentiment_reasoning": response.content,
        "reasoning_summary": response.content[:3000],
        "confidence_score": confidence,
    }
