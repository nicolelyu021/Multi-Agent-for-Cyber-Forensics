"""VADER sentiment analysis tool for the Sentiment Analyzer agent."""
import re

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from forensic.wrapper import forensic_tool

_analyzer = SentimentIntensityAnalyzer()

# Threat-specific keyword dictionaries
FINANCIAL_FRAUD_KEYWORDS = [
    "ljm", "raptor", "off-balance-sheet", "special purpose entity", "spe",
    "mark-to-market", "hide", "conceal", "manipulate", "inflate",
    "partnership", "chewco", "condor", "whitewing",
]

DATA_DESTRUCTION_KEYWORDS = [
    "shred", "destroy", "delete", "clean up", "retention policy",
    "get rid of", "remove files", "wipe", "purge", "shred room",
]

INAPPROPRIATE_KEYWORDS = [
    "inappropriate", "harassment", "complaint", "hostile",
    "uncomfortable", "threatening", "retaliation",
]

ALL_KEYWORDS = {
    "financial_fraud": FINANCIAL_FRAUD_KEYWORDS,
    "data_destruction": DATA_DESTRUCTION_KEYWORDS,
    "inappropriate_relations": INAPPROPRIATE_KEYWORDS,
}


@forensic_tool("vader_sentiment", "sentiment_analyzer")
async def analyze_sentiment(text: str, trace_id: str = "unknown") -> dict:
    """Compute VADER compound sentiment score for text."""
    scores = _analyzer.polarity_scores(text)
    return {
        "compound": scores["compound"],
        "positive": scores["pos"],
        "negative": scores["neg"],
        "neutral": scores["neu"],
    }


@forensic_tool("keyword_scan", "sentiment_analyzer")
async def scan_keywords(text: str, trace_id: str = "unknown") -> dict:
    """Scan text for threat-category keywords with context extraction."""
    text_lower = text.lower()
    results = {}

    for category, keywords in ALL_KEYWORDS.items():
        matches = []
        for kw in keywords:
            pattern = re.compile(re.escape(kw), re.IGNORECASE)
            for match in pattern.finditer(text):
                start = max(0, match.start() - 50)
                end = min(len(text), match.end() + 50)
                context = text[start:end].strip()
                matches.append({"keyword": kw, "context": f"...{context}..."})
        if matches:
            results[category] = matches

    return results


@forensic_tool("batch_sentiment", "sentiment_analyzer")
async def batch_analyze_emails(emails: list[dict], trace_id: str = "unknown") -> list[dict]:
    """Analyze a batch of emails for sentiment and keywords."""
    results = []
    for email in emails:
        body = email.get("body", "")
        subject = email.get("subject", "")
        full_text = f"{subject}\n{body}"

        sentiment = _analyzer.polarity_scores(full_text)
        keywords_found = {}
        text_lower = full_text.lower()

        for category, keywords in ALL_KEYWORDS.items():
            for kw in keywords:
                if kw in text_lower:
                    if category not in keywords_found:
                        keywords_found[category] = []
                    keywords_found[category].append(kw)

        results.append({
            "message_id": email.get("message_id"),
            "subject": email.get("subject", ""),
            "body": (email.get("body", "") or "")[:500],
            "from_addr": email.get("from_addr", email.get("source", "")),
            "to_addr": email.get("to_addr", email.get("target", "")),
            "date": email.get("date", ""),
            "vader_compound": sentiment["compound"],
            "keywords": keywords_found,
            "flagged": bool(keywords_found) or sentiment["compound"] < -0.5,
        })

    return results
