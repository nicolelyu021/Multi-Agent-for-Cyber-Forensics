import os
import json
import asyncio
from pathlib import Path
from anthropic import AsyncAnthropic
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup API Client with deterministic defaults
client = AsyncAnthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY"),
)

# Paths
DATA_DIR = Path(__file__).parent.parent
EVAL_DATASET = DATA_DIR / "evaluation_dataset.json"
GROUND_TRUTH_OUT = DATA_DIR / "claude_opus_ground_truth_2000.json"
PROMPTS_DIR = DATA_DIR / "eval" / "prompts"

SILVER_STANDARD_FILE = PROMPTS_DIR / "silver_standard_prompt.md"
TAXONOMY_FILE = PROMPTS_DIR / "acfe_enron_taxonomy.md"

async def grade_email(message_id: str, raw_text: str, system_prompt: str, taxonomy: str, model="claude-opus-4-7"):
    """
    Calls the LLM with deterministic settings to Grade one single email based on the ACFE taxonomy.
    """
    extended_system_prompt = f"{system_prompt}\n\n=== TAXONOMY REFERENCE ===\n{taxonomy}"
    
    user_prompt = f"Evaluate the following Enron email text for any anomalies or fraud. Output STRICTLY raw JSON matching the required schema.\n\nRAW_EMAIL_TEXT:\n{raw_text}"

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=1500,
            # Note: temperature is deprecated for claude-opus-4-7
            system=extended_system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )
        
        result_str = response.content[0].text
        # Optional: Extract json if it is wrapped in markdown
        if "```json" in result_str:
            result_str = result_str.split("```json")[1].split("```")[0]
        elif "```" in result_str:
            result_str = result_str.split("```")[1].split("```")[0]
            
        result_json = json.loads(result_str.strip())
        # Ensure message_id is injected into results
        result_json["message_id"] = message_id
        return result_json
        
    except Exception as e:
        print(f"Error processing {message_id}: {e}")
        return {
            "message_id": message_id,
            "error": str(e),
            "is_anomalous": False
        }


async def generate_ground_truth():
    print("Loading datasets and prompts...")
    
    if not EVAL_DATASET.exists():
        print(f"Error: {EVAL_DATASET} not found. Run prepare_deidentified.py first.")
        return

    with open(EVAL_DATASET, "r") as f:
        evaluation_data = json.load(f)

    with open(SILVER_STANDARD_FILE, "r") as f:
        silver_standard_prompt = f.read()

    with open(TAXONOMY_FILE, "r") as f:
        acfe_taxonomy = f.read()

    print(f"Starting Ground Truth generation for {len(evaluation_data)} emails...")
    print("Using Default Deterministic LLM Settings for Claude Opus 4.7")

    # To avoid rate limits, we process in chunks instead of all 2000 at once
    # Increased chunk size for faster processing
    chunk_size = 10
    results = []
    
    # Check if a partial file exists so we can resume if it crashes
    if GROUND_TRUTH_OUT.exists():
        with open(GROUND_TRUTH_OUT, "r") as f:
            try:
                results = json.load(f)
                print(f"Resuming from existing {len(results)} records.")
            except:
                pass

    processed_ids = {r.get("message_id") for r in results}
    data_to_process = [d for d in evaluation_data if d["message_id"] not in processed_ids]

    for i in range(0, len(data_to_process), chunk_size):
        chunk = data_to_process[i:i+chunk_size]
        print(f"Processing chunk {(i//chunk_size)+1}...")
        
        tasks = [
            grade_email(item["message_id"], item["text_raw"], silver_standard_prompt, acfe_taxonomy)
            for item in chunk
        ]
        
        chunk_results = await asyncio.gather(*tasks)
        results.extend(chunk_results)
        
        # Save incrementally
        with open(GROUND_TRUTH_OUT, "w") as f:
            json.dump(results, f, indent=2)

    print(f"Success! Generated {len(results)} ground truth labels.")
    print(f"Saved to {GROUND_TRUTH_OUT}")


if __name__ == "__main__":
    asyncio.run(generate_ground_truth())
