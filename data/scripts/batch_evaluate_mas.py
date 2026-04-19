"""Batch runner to evaluate the Multi-Agent System on the 2,000 de-identified benchmark dataset."""
import asyncio
import json
import sys
from pathlib import Path

# Add backend to python path for LangGraph imports
DATA_DIR = Path(__file__).parent.parent
PROJECT_ROOT = DATA_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.append(str(BACKEND_DIR))

from agents.graph import threat_analysis_graph
from agents.state import ThreatAnalysisState
from db.sqlite_client import init_forensic_db
from config import settings

EVAL_DATASET = DATA_DIR / "evaluation_dataset.json"
PREDICTIONS_OUT = DATA_DIR / "mas_predictions.json"
CHUNK_SIZE = 50

async def process_email(email_record: dict) -> dict:
    """Run ONE email through the MAS using Dependency Injection."""
    message_id = email_record["message_id"]
    
    # State Injection: Bypass Neo4j with explicit evaluation_mode
    initial_state = {
        "start_date": "1999-01-01",  # Ignored in eval mode
        "end_date": "2002-12-31",    # Ignored in eval mode
        "anomaly_threshold": settings.anomaly_threshold,
        "confidence_threshold": settings.confidence_threshold,
        "departments": None,
        "person_emails": None,
        "evaluation_mode": True,
        "evaluation_emails": [email_record],  # Inject the single de-identified record
        "root_trace_id": f"eval_trace_{message_id}",
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

    try:
        # Trigger the LangGraph multi-agent pipeline
        result = await threat_analysis_graph.ainvoke(initial_state)

        # Extract predictions
        confidence = result.get("final_confidence", 0.0)
        is_anomalous = confidence >= settings.confidence_threshold
        threat_category = result.get("threat_category", "")
        if not threat_category and is_anomalous:
             threat_category = "Unknown Core Threat"

        return {
            "message_id": message_id,
            "mas_prediction_is_anomalous": is_anomalous,
            "mas_threat_category": threat_category,
            "mas_confidence": confidence,
            "deliberation_triggered": result.get("deliberation_triggered", False),
        }
    except Exception as e:
        print(f"Error processing {message_id}: {e}")
        return {
            "message_id": message_id,
            "mas_prediction_is_anomalous": False,
            "mas_threat_category": "Error",
            "mas_confidence": 0.0,
            "deliberation_triggered": False,
        }

async def main():
    print("Initializing Forensic DB...")
    await init_forensic_db()
    
    print(f"Loading {EVAL_DATASET}...")
    with open(EVAL_DATASET, "r") as f:
        dataset = json.load(f)

    # Allow resuming from existing predictions
    predictions = []
    if PREDICTIONS_OUT.exists():
        with open(PREDICTIONS_OUT, "r") as f:
            predictions = json.load(f)
            
    processed_ids = {p["message_id"] for p in predictions}
    remaining = [item for item in dataset if item["message_id"] not in processed_ids]
    
    print(f"Found {len(dataset)} total records.")
    print(f"Resuming {len(processed_ids)} processed. Processing {len(remaining)} remaining...")

    for i in range(0, len(remaining), CHUNK_SIZE):
        chunk = remaining[i:i + CHUNK_SIZE]
        print(f"Processing chunk {i // CHUNK_SIZE + 1}...")
        
        # Format payload: the script expects text_deidentified to be passed as 'body' or 'text'
        # Wait, the sentiment node expects format from get_emails_between
        # get_emails_between returns: {"message_id", "date", "subject", "body", "vader_compound", "keywords"}
        # But VADER analysis is done in Sentiment agent. But Sentiment also calls VADER analysis!
        
        # We need to map `text_deidentified` to `body` for the sentiment agent to read it natively.
        formatted_chunk = []
        for item in chunk:
            formatted_chunk.append({
                "message_id": item["message_id"],
                "body": item["text_deidentified"],
                "subject": "Deidentified Subject",
                "date": "2001-01-01", # mock date
            })

        tasks = [process_email(item) for item in formatted_chunk]
        results = await asyncio.gather(*tasks)
        
        predictions.extend(results)
        
        # Save check-point
        with open(PREDICTIONS_OUT, "w") as f:
            json.dump(predictions, f, indent=2)

    print(f"✅ Success! Generated {len(predictions)} MAS predictions.")
    print(f"Saved to {PREDICTIONS_OUT}")

if __name__ == "__main__":
    asyncio.run(main())
