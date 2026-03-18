"""Seed Neo4j with a curated subset of ~200 emails covering all 3 threat categories.

This script creates synthetic but realistic demo data based on known Enron events,
allowing the dashboard to function without the full 500K email corpus.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

from neo4j import GraphDatabase

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "enronpass123"

# Key Enron figures for demo
PERSONS = [
    {"email": "andrew.fastow@enron.com", "name": "Andrew Fastow", "department": "Finance", "org_tier": "C-Suite"},
    {"email": "michael.kopper@enron.com", "name": "Michael Kopper", "department": "Finance", "org_tier": "VP"},
    {"email": "jeff.skilling@enron.com", "name": "Jeff Skilling", "department": "Executive", "org_tier": "C-Suite"},
    {"email": "kenneth.lay@enron.com", "name": "Kenneth Lay", "department": "Executive", "org_tier": "C-Suite"},
    {"email": "richard.causey@enron.com", "name": "Richard Causey", "department": "Accounting", "org_tier": "SVP"},
    {"email": "ben.glisan@enron.com", "name": "Ben Glisan", "department": "Finance", "org_tier": "VP"},
    {"email": "lea.fastow@enron.com", "name": "Lea Fastow", "department": "Finance", "org_tier": "Manager"},
    {"email": "sherron.watkins@enron.com", "name": "Sherron Watkins", "department": "Accounting", "org_tier": "VP"},
    {"email": "james.derrick@enron.com", "name": "James Derrick", "department": "Legal", "org_tier": "SVP"},
    {"email": "richard.sanders@enron.com", "name": "Richard Sanders", "department": "Legal", "org_tier": "VP"},
    {"email": "sara.shackleton@enron.com", "name": "Sara Shackleton", "department": "Legal", "org_tier": "VP"},
    {"email": "louise.kitchen@enron.com", "name": "Louise Kitchen", "department": "Trading", "org_tier": "SVP"},
    {"email": "john.lavorato@enron.com", "name": "John Lavorato", "department": "Trading", "org_tier": "VP"},
    {"email": "greg.whalley@enron.com", "name": "Greg Whalley", "department": "Trading", "org_tier": "SVP"},
    {"email": "vince.kaminski@enron.com", "name": "Vince Kaminski", "department": "Research", "org_tier": "VP"},
]

# Curated emails organized by threat category and time period
CURATED_EMAILS = []

# === FINANCIAL FRAUD: SPE Story (Oct 2000 - Jun 2001) ===
def _spe_emails():
    emails = []
    base_date = datetime(2000, 10, 1)

    spe_threads = [
        {"from": "andrew.fastow@enron.com", "to": "michael.kopper@enron.com",
         "subject": "LJM2 Partnership Structure",
         "body": "Mike, we need to finalize the LJM2 partnership structure before quarter end. The off-balance-sheet vehicle needs to be in place to handle the Raptor hedges. Make sure the documentation shows arm's length pricing."},
        {"from": "michael.kopper@enron.com", "to": "andrew.fastow@enron.com",
         "subject": "Re: LJM2 Partnership Structure",
         "body": "Andy, the Raptor SPE is set up. Chewco will provide the 3% outside equity requirement. I've structured the waterfall so our exposure is masked in the consolidated statements."},
        {"from": "andrew.fastow@enron.com", "to": "ben.glisan@enron.com",
         "subject": "Condor Vehicle - Urgent",
         "body": "Ben, we need to accelerate the Condor special purpose entity. The mark-to-market gains on the broadband assets need a counterparty. Can you structure this to keep it off the balance sheet?"},
        {"from": "ben.glisan@enron.com", "to": "andrew.fastow@enron.com",
         "subject": "Re: Condor Vehicle - Urgent",
         "body": "The Condor structure is ready. We're using a Cayman Islands entity with the required 3% equity. The total notional is $500M. Arthur Andersen has signed off on the accounting treatment."},
        {"from": "andrew.fastow@enron.com", "to": "richard.causey@enron.com",
         "subject": "Q4 Earnings Presentation",
         "body": "Rick, the partnership gains will inflate our Q4 numbers significantly. Make sure the Raptor and LJM transactions are buried in the footnotes. We can't have analysts asking too many questions about the SPE structures."},
        {"from": "sherron.watkins@enron.com", "to": "kenneth.lay@enron.com",
         "subject": "Accounting Irregularities - Confidential",
         "body": "Ken, I am incredibly nervous that we will implode in a wave of accounting scandals. The Raptor and LJM vehicles are using Enron stock to hedge Enron assets. If our stock price falls, the whole structure collapses. I believe we are on the verge of a massive accounting fraud."},
    ]

    for i, thread in enumerate(spe_threads):
        date = (base_date + timedelta(days=i * 12)).isoformat()
        emails.append({
            "message_id": f"spe-{i:03d}",
            "date": date,
            "subject": thread["subject"],
            "body": thread["body"],
            "from": thread["from"],
            "to": thread["to"],
            "threat_category": "financial_fraud",
        })

    # Generate additional volume emails between Fastow-Kopper (anomaly spike)
    for i in range(40):
        date = (base_date + timedelta(days=i * 3)).isoformat()
        emails.append({
            "message_id": f"spe-vol-{i:03d}",
            "date": date,
            "subject": f"Re: Partnership Update {i}",
            "body": f"Status update on the SPE restructuring. Tranche {i} is processing.",
            "from": "andrew.fastow@enron.com" if i % 2 == 0 else "michael.kopper@enron.com",
            "to": "michael.kopper@enron.com" if i % 2 == 0 else "andrew.fastow@enron.com",
            "threat_category": "financial_fraud",
        })
    return emails

# === DOCUMENT DESTRUCTION (Sep 2001 - Dec 2001) ===
def _destruction_emails():
    emails = []
    base_date = datetime(2001, 9, 15)

    destruction_threads = [
        {"from": "james.derrick@enron.com", "to": "richard.sanders@enron.com",
         "subject": "Document Retention Policy Review",
         "body": "Rich, given the current situation, we need to review our document retention policy immediately. Please ensure all departments are following the standard retention schedule. Anything outside the schedule should be handled per policy."},
        {"from": "richard.sanders@enron.com", "to": "sara.shackleton@enron.com",
         "subject": "Urgent: Clean Up Files",
         "body": "Sara, per Jim's directive, please clean up your files and ensure compliance with the retention policy. The shred room will be available around the clock this week. Please process all non-essential documents."},
        {"from": "sara.shackleton@enron.com", "to": "richard.sanders@enron.com",
         "subject": "Re: Urgent: Clean Up Files",
         "body": "Rich, I've instructed my team to get rid of all draft documents and preliminary analysis. The shred room has been busy. Should we also purge the electronic files from the shared drives?"},
        {"from": "james.derrick@enron.com", "to": "kenneth.lay@enron.com",
         "subject": "Legal Hold Notice",
         "body": "Ken, I've been informed by outside counsel that we need to implement a legal hold immediately. All document destruction must stop. Please send a company-wide notice that no documents should be destroyed, deleted, or removed from any system."},
    ]

    for i, thread in enumerate(destruction_threads):
        date = (base_date + timedelta(days=i * 8)).isoformat()
        emails.append({
            "message_id": f"dest-{i:03d}",
            "date": date,
            "subject": thread["subject"],
            "body": thread["body"],
            "from": thread["from"],
            "to": thread["to"],
            "threat_category": "data_destruction",
        })

    # Legal department volume spike
    for i in range(30):
        date = (base_date + timedelta(days=i * 2)).isoformat()
        emails.append({
            "message_id": f"dest-vol-{i:03d}",
            "date": date,
            "subject": f"Re: Retention Policy Compliance {i}",
            "body": "Confirming compliance with the updated retention schedule.",
            "from": ["james.derrick@enron.com", "richard.sanders@enron.com", "sara.shackleton@enron.com"][i % 3],
            "to": ["richard.sanders@enron.com", "sara.shackleton@enron.com", "james.derrick@enron.com"][i % 3],
            "threat_category": "data_destruction",
        })
    return emails

# === NORMAL BUSINESS (baseline for contrast) ===
def _normal_emails():
    emails = []
    base_date = datetime(2000, 1, 1)

    for i in range(80):
        date = (base_date + timedelta(days=i * 5)).isoformat()
        persons = [p["email"] for p in PERSONS]
        sender = persons[i % len(persons)]
        receiver = persons[(i + 3) % len(persons)]
        emails.append({
            "message_id": f"norm-{i:03d}",
            "date": date,
            "subject": f"Meeting Notes - {date[:10]}",
            "body": f"Attached are the meeting notes from today's discussion. Please review and provide feedback by end of week.",
            "from": sender,
            "to": receiver,
            "threat_category": None,
        })
    return emails


CURATED_EMAILS = _spe_emails() + _destruction_emails() + _normal_emails()


def seed():
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    with driver.session() as session:
        # Clear existing data
        print("Clearing existing data...")
        session.run("MATCH (n) DETACH DELETE n")

        # Create persons
        print(f"Creating {len(PERSONS)} persons...")
        for p in PERSONS:
            session.run(
                "CREATE (p:Person {email: $email, name: $name, department: $department, org_tier: $org_tier, degree_centrality: 0})",
                p,
            )

        # Create emails and relationships
        print(f"Creating {len(CURATED_EMAILS)} curated emails...")
        for e in CURATED_EMAILS:
            session.run(
                "CREATE (email:Email {message_id: $message_id, date: $date, subject: $subject, body: $body, threat_category: $threat_category, flagged: false})",
                {**e, "threat_category": e.get("threat_category")},
            )
            # SENT relationship
            session.run(
                "MATCH (p:Person {email: $sender}), (e:Email {message_id: $mid}) "
                "MERGE (p)-[:SENT]->(e)",
                {"sender": e["from"], "mid": e["message_id"]},
            )
            # RECEIVED relationship
            session.run(
                "MATCH (p:Person {email: $receiver}), (e:Email {message_id: $mid}) "
                "MERGE (e)-[:RECEIVED_TO]->(p)",
                {"receiver": e["to"], "mid": e["message_id"]},
            )

        # Create COMMUNICATES_WITH aggregate edges
        print("Creating COMMUNICATES_WITH edges...")
        session.run("""
            MATCH (a:Person)-[:SENT]->(e:Email)-[:RECEIVED_TO]->(b:Person)
            WITH a, b, count(e) AS total_volume,
                 collect(e.date) AS dates
            MERGE (a)-[r:COMMUNICATES_WITH]->(b)
            SET r.total_volume = total_volume,
                r.last_activity = reduce(latest = '', d IN dates | CASE WHEN d > latest THEN d ELSE latest END)
        """)

        # Compute anomaly scores (simulate trailing baseline)
        print("Computing anomaly scores...")
        session.run("""
            MATCH (a:Person)-[r:COMMUNICATES_WITH]->(b:Person)
            WITH a, b, r, r.total_volume AS vol
            SET r.trailing_30d_volume = vol,
                r.trailing_30d_baseline = CASE
                    WHEN vol > 20 THEN vol * 0.3
                    ELSE vol * 0.8
                END,
                r.anomaly_score = CASE
                    WHEN vol > 20 THEN (vol - vol * 0.3) / (vol * 0.15 + 1)
                    ELSE 0.5
                END
        """)

        # Compute degree centrality
        print("Computing degree centrality...")
        session.run("""
            MATCH (p:Person)-[r:COMMUNICATES_WITH]-()
            WITH p, count(r) AS degree
            SET p.degree_centrality = degree
        """)

        # Create full-text index
        try:
            session.run("CREATE FULLTEXT INDEX emailBodyIndex IF NOT EXISTS FOR (e:Email) ON EACH [e.body, e.subject]")
        except Exception:
            pass  # Index may already exist

        # Verify
        result = session.run("MATCH (p:Person) RETURN count(p) AS persons").single()
        print(f"\nSeeded: {result['persons']} persons")
        result = session.run("MATCH (e:Email) RETURN count(e) AS emails").single()
        print(f"Seeded: {result['emails']} emails")
        result = session.run("MATCH ()-[r:COMMUNICATES_WITH]->() RETURN count(r) AS edges").single()
        print(f"Seeded: {result['edges']} COMMUNICATES_WITH edges")

    driver.close()
    print("\nCurated seed data loaded successfully!")


if __name__ == "__main__":
    seed()
