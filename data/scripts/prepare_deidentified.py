"""Extract a reproducible subset of real Enron emails and perform true metadata de-identification using a mapping table."""
import csv
import random
import re
import json
from pathlib import Path

# Paths
DATA_DIR = Path(__file__).parent.parent
RAW_EMAILS = DATA_DIR / "emails.csv"
RAW_PERSONS = DATA_DIR / "persons.csv"
RAW_SENT = DATA_DIR / "sent_rels.csv"
RAW_RECEIVED = DATA_DIR / "received_rels.csv"

DEID_EMAILS = DATA_DIR / "deidentified_emails.csv"
DEID_PERSONS = DATA_DIR / "deidentified_persons.csv"
DEID_SENT = DATA_DIR / "deidentified_sent_rels.csv"
DEID_RECEIVED = DATA_DIR / "deidentified_received_rels.csv"
DEID_RECEIVED = DATA_DIR / "deidentified_received_rels.csv"
MAPPING_TABLE_FILE = DATA_DIR / "identity_mapping_table.csv"
EVAL_DATASET = DATA_DIR / "evaluation_dataset.json"

TARGET_EMAIL_COUNT = 2000
random.seed(42)

# Specific people we want to ensure are in the subset to make the graph interesting
KEY_FIGURES = {
    "jeff.skilling", "kenneth.lay", "andrew.fastow", "richard.causey", 
    "ben.glisan", "michael.kopper", "lea.fastow", "sherron.watkins",
    "james.derrick", "richard.sanders", "sara.shackleton", "mark.taylor",
    "louise.kitchen", "john.lavorato", "greg.whalley", "tim.belden",
    "john.arnold", "vince.kaminski", "stinson.gibner", "vasant.shanbhogue",
    "david.duncan", "wes.colwell", "timothy.despain", "raymond.bowen",
    "mark.frevert", "cliff.baxter"
}

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
PHONE_REGEX = re.compile(r'(\+?[0-9]{1,3}[-.\s]?)?(\(?[0-9]{3}\)?[-.\s]?)?[0-9]{3}[-.\s]?[0-9]{4}')

# The Global Mapping Table
identity_map = {}

def get_anonymous_id(email: str) -> str:
    """Consistently maps a real email to an Employee pseudo-ID."""
    if not email:
        return email
    email = email.lower()
    if email not in identity_map:
        identity_map[email] = f"Employee_{len(identity_map) + 1}"
    return identity_map[email]


def deidentify_text(text: str) -> str:
    """Mask PII in plain text."""
    if not text:
        return ""
    
    text = EMAIL_REGEX.sub("[EMAIL]", text)
    text = PHONE_REGEX.sub("[PHONE]", text)
    
    # Mask known executives' names
    for figure in KEY_FIGURES:
        parts = figure.split(".")
        if len(parts) == 2:
            first, last = parts
            text = text.replace(first.title(), "[PERSON]")
            text = text.replace(last.title(), "[PERSON]")
            text = text.replace(first, "[PERSON]")
            text = text.replace(last, "[PERSON]")

    return text


def build_deidentified_subset():
    if not RAW_EMAILS.exists() or not RAW_PERSONS.exists():
        print(f"Error: Could not find raw parsed CSVs in {DATA_DIR}.")
        return

    print("Building reproducible de-identified dataset with Mapping Table...")

    # 1. Identify which emails to include
    valid_message_ids = set()
    
    with open(RAW_SENT, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if any(kf in row["person"].lower() for kf in KEY_FIGURES):
                valid_message_ids.add(row["message_id"])

    with open(RAW_RECEIVED, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if any(kf in row["person"].lower() for kf in KEY_FIGURES):
                valid_message_ids.add(row["message_id"])

    valid_list = list(valid_message_ids)
    if len(valid_list) > TARGET_EMAIL_COUNT:
        selected_ids = set(random.sample(valid_list, TARGET_EMAIL_COUNT))
    else:
        selected_ids = set(valid_list)

    # 2. Map Relationships and build Mapping Table dynamically
    print("Masking Node Identities (Relationships)...")
    active_persons = set()
    
    with open(RAW_SENT, "r") as fin, open(DEID_SENT, "w", newline="") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=["person", "message_id"])
        writer.writeheader()
        for row in reader:
            if row["message_id"] in selected_ids:
                anon_id = get_anonymous_id(row["person"])
                writer.writerow({"person": anon_id, "message_id": row["message_id"]})
                active_persons.add(row["person"])

    with open(RAW_RECEIVED, "r") as fin, open(DEID_RECEIVED, "w", newline="") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=["person", "message_id", "type"])
        writer.writeheader()
        for row in reader:
            if row["message_id"] in selected_ids:
                anon_id = get_anonymous_id(row["person"])
                writer.writerow({"person": anon_id, "message_id": row["message_id"], "type": row["type"]})
                active_persons.add(row["person"])

    # 3. Process Persons (using Mapped IDs)
    print("Masking Node Identities (Persons)...")
    with open(RAW_PERSONS, "r") as fin, open(DEID_PERSONS, "w", newline="") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=["email"])
        writer.writeheader()
        for row in reader:
            if row["email"] in active_persons:
                anon_id = get_anonymous_id(row["email"])
                writer.writerow({"email": anon_id})

    # 4. Export Mapping Table (so researchers have the ground truth)
    print("Exporting Ground-Truth Mapping Table...")
    with open(MAPPING_TABLE_FILE, "w", newline="") as fout:
        writer = csv.writer(fout)
        writer.writerow(["real_email", "anonymous_id"])
        for real, anon in identity_map.items():
            writer.writerow([real, anon])

    # 5. Process Emails (Text Scrubbing)
    print("Scrubbing Email Text...")
    evaluation_data = []

    with open(RAW_EMAILS, "r") as fin, open(DEID_EMAILS, "w", newline="") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=["message_id", "date", "subject", "body"])
        writer.writeheader()
        
        for row in reader:
            if row["message_id"] in selected_ids:
                deid_subj = deidentify_text(row["subject"])
                deid_body = deidentify_text(row["body"])

                writer.writerow({
                    "message_id": row["message_id"],
                    "date": row["date"],
                    "subject": deid_subj,
                    "body": deid_body,
                })

                evaluation_data.append({
                    "message_id": row["message_id"],
                    "text_raw": f"Subject: {row['subject']}\n\n{row['body']}",
                    "text_deidentified": f"Subject: {deid_subj}\n\n{deid_body}"
                })

    print("Exporting Side-by-Side Evaluation Dataset...")
    with open(EVAL_DATASET, "w") as fout:
        json.dump(evaluation_data, fout, indent=2)

    print(f"Success! {len(selected_ids)} real emails processed.")
    print(f"Topological Mapping saved to '{MAPPING_TABLE_FILE.name}'.")

if __name__ == "__main__":
    build_deidentified_subset()
