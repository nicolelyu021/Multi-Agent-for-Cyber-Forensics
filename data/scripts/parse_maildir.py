"""Parse Enron maildir into structured CSVs for Neo4j import."""
import csv
import email
import os
import re
from datetime import datetime
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path

RAW_DIR = Path(__file__).parent.parent / "raw" / "maildir"
OUTPUT_DIR = Path(__file__).parent.parent
PERSONS_CSV = OUTPUT_DIR / "persons.csv"
EMAILS_CSV = OUTPUT_DIR / "emails.csv"
SENT_CSV = OUTPUT_DIR / "sent_rels.csv"
RECEIVED_CSV = OUTPUT_DIR / "received_rels.csv"


def parse_address(addr_str: str) -> list[str]:
    """Extract email addresses from an address string."""
    addresses = []
    for part in addr_str.split(","):
        _, addr = parseaddr(part.strip())
        if addr and "@" in addr:
            addresses.append(addr.lower().strip())
    return addresses


def parse_maildir():
    if not RAW_DIR.exists():
        print(f"Maildir not found at {RAW_DIR}. Run download_enron.py first.")
        return

    persons = set()
    emails_data = []
    sent_rels = []
    received_rels = []

    users = sorted(os.listdir(RAW_DIR))
    print(f"Found {len(users)} user directories")

    for user_idx, user_dir in enumerate(users):
        user_path = RAW_DIR / user_dir
        if not user_path.is_dir():
            continue

        if (user_idx + 1) % 20 == 0:
            print(f"  Processing user {user_idx + 1}/{len(users)}: {user_dir}")

        for root, dirs, files in os.walk(user_path):
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, "r", errors="ignore") as f:
                        msg = email.message_from_file(f)

                    message_id = msg.get("Message-ID", "").strip("<>")
                    if not message_id:
                        continue

                    # Parse date
                    date_str = msg.get("Date", "")
                    try:
                        date = parsedate_to_datetime(date_str).isoformat()
                    except Exception:
                        continue

                    subject = msg.get("Subject", "")
                    from_addr = parse_address(msg.get("From", ""))
                    to_addrs = parse_address(msg.get("To", ""))
                    cc_addrs = parse_address(msg.get("Cc", ""))

                    # Extract body
                    if msg.is_multipart():
                        body = ""
                        for part in msg.walk():
                            if part.get_content_type() == "text/plain":
                                body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                                break
                    else:
                        body = msg.get_payload(decode=True)
                        if body:
                            body = body.decode("utf-8", errors="ignore")
                        else:
                            body = ""

                    # Truncate long bodies
                    body = body[:5000] if body else ""

                    if not from_addr:
                        continue

                    sender = from_addr[0]
                    persons.add(sender)
                    for addr in to_addrs + cc_addrs:
                        persons.add(addr)

                    emails_data.append({
                        "message_id": message_id,
                        "date": date,
                        "subject": subject,
                        "body": body.replace("\n", " ").replace("\r", ""),
                    })

                    sent_rels.append({"person": sender, "message_id": message_id})

                    for addr in to_addrs:
                        received_rels.append({"person": addr, "message_id": message_id, "type": "TO"})
                    for addr in cc_addrs:
                        received_rels.append({"person": addr, "message_id": message_id, "type": "CC"})

                except Exception:
                    continue

    # Write CSVs
    print(f"\nParsed {len(emails_data)} emails from {len(persons)} persons")

    with open(PERSONS_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["email"])
        writer.writeheader()
        for p in sorted(persons):
            writer.writerow({"email": p})

    with open(EMAILS_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["message_id", "date", "subject", "body"])
        writer.writeheader()
        writer.writerows(emails_data)

    with open(SENT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["person", "message_id"])
        writer.writeheader()
        writer.writerows(sent_rels)

    with open(RECEIVED_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["person", "message_id", "type"])
        writer.writeheader()
        writer.writerows(received_rels)

    print(f"Output: {PERSONS_CSV}, {EMAILS_CSV}, {SENT_CSV}, {RECEIVED_CSV}")


if __name__ == "__main__":
    parse_maildir()
