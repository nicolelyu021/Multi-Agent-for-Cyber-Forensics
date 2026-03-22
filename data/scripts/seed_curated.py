"""Seed Neo4j with a curated subset of ~1200 emails covering all 3 threat categories.

This script creates synthetic but realistic demo data based on known Enron events,
allowing the dashboard to function without the full 500K email corpus.
"""
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

from neo4j import GraphDatabase

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "enronpass123"

# Key Enron figures for demo
PERSONS = [
    # Executive
    {"email": "andrew.fastow@enron.com", "name": "Andrew Fastow", "department": "Finance", "org_tier": "C-Suite"},
    {"email": "michael.kopper@enron.com", "name": "Michael Kopper", "department": "Finance", "org_tier": "VP"},
    {"email": "jeff.skilling@enron.com", "name": "Jeff Skilling", "department": "Executive", "org_tier": "C-Suite"},
    {"email": "kenneth.lay@enron.com", "name": "Kenneth Lay", "department": "Executive", "org_tier": "C-Suite"},
    {"email": "richard.causey@enron.com", "name": "Richard Causey", "department": "Accounting", "org_tier": "SVP"},
    {"email": "ben.glisan@enron.com", "name": "Ben Glisan", "department": "Finance", "org_tier": "VP"},
    {"email": "lea.fastow@enron.com", "name": "Lea Fastow", "department": "Finance", "org_tier": "Manager"},
    {"email": "sherron.watkins@enron.com", "name": "Sherron Watkins", "department": "Accounting", "org_tier": "VP"},
    # Legal
    {"email": "james.derrick@enron.com", "name": "James Derrick", "department": "Legal", "org_tier": "SVP"},
    {"email": "richard.sanders@enron.com", "name": "Richard Sanders", "department": "Legal", "org_tier": "VP"},
    {"email": "sara.shackleton@enron.com", "name": "Sara Shackleton", "department": "Legal", "org_tier": "VP"},
    {"email": "mark.taylor@enron.com", "name": "Mark Taylor", "department": "Legal", "org_tier": "VP"},
    # Trading
    {"email": "louise.kitchen@enron.com", "name": "Louise Kitchen", "department": "Trading", "org_tier": "SVP"},
    {"email": "john.lavorato@enron.com", "name": "John Lavorato", "department": "Trading", "org_tier": "VP"},
    {"email": "greg.whalley@enron.com", "name": "Greg Whalley", "department": "Trading", "org_tier": "SVP"},
    {"email": "tim.belden@enron.com", "name": "Tim Belden", "department": "Trading", "org_tier": "VP"},
    {"email": "john.arnold@enron.com", "name": "John Arnold", "department": "Trading", "org_tier": "Manager"},
    # Research
    {"email": "vince.kaminski@enron.com", "name": "Vince Kaminski", "department": "Research", "org_tier": "VP"},
    {"email": "stinson.gibner@enron.com", "name": "Stinson Gibner", "department": "Research", "org_tier": "Manager"},
    {"email": "vasant.shanbhogue@enron.com", "name": "Vasant Shanbhogue", "department": "Research", "org_tier": "Analyst"},
    # Accounting
    {"email": "david.duncan@enron.com", "name": "David Duncan", "department": "Accounting", "org_tier": "SVP"},
    {"email": "wes.colwell@enron.com", "name": "Wes Colwell", "department": "Accounting", "org_tier": "VP"},
    # Additional Finance
    {"email": "timothy.despain@enron.com", "name": "Timothy DeSpain", "department": "Finance", "org_tier": "VP"},
    {"email": "raymond.bowen@enron.com", "name": "Raymond Bowen", "department": "Finance", "org_tier": "VP"},
    # Additional Executive
    {"email": "mark.frevert@enron.com", "name": "Mark Frevert", "department": "Executive", "org_tier": "SVP"},
    {"email": "cliff.baxter@enron.com", "name": "Cliff Baxter", "department": "Executive", "org_tier": "SVP"},
]

random.seed(42)  # Reproducible

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
        {"from": "andrew.fastow@enron.com", "to": "lea.fastow@enron.com",
         "subject": "Whitewing Structure Update",
         "body": "Lea, the Whitewing special purpose entity needs restructuring. The current off-balance-sheet arrangement has too much exposure to our stock price. Move the SPE assets to the new Cayman vehicle before the auditors review."},
        {"from": "michael.kopper@enron.com", "to": "ben.glisan@enron.com",
         "subject": "Raptor III Hedge Unwind",
         "body": "Ben, Raptor III is underwater. The mark-to-market losses are mounting and the hedge is no longer effective. We need to restructure before the next audit cycle. Can we roll the exposure into a new LJM vehicle?"},
        {"from": "ben.glisan@enron.com", "to": "richard.causey@enron.com",
         "subject": "SPE Consolidation Risk",
         "body": "Rick, if the stock drops below $40, we'll trigger consolidation of the Raptor entities. That means $1.2B in hidden losses hit our balance sheet. We need to discuss contingency plans."},
        {"from": "andrew.fastow@enron.com", "to": "jeff.skilling@enron.com",
         "subject": "Partnership Returns for Board",
         "body": "Jeff, the board wants an update on LJM returns. I've prepared a presentation that shows the partnership investments without the related-party detail. The self-dealing aspects should not be highlighted."},
        {"from": "richard.causey@enron.com", "to": "david.duncan@enron.com",
         "subject": "Audit Treatment of SPE Transactions",
         "body": "David, we need Arthur Andersen to approve the consolidation exemption for Raptor IV. The 3% equity test is technically met through the Chewco structure but the substance is questionable. Please expedite."},
        {"from": "timothy.despain@enron.com", "to": "andrew.fastow@enron.com",
         "subject": "LJM Fee Schedule Concerns",
         "body": "Andy, the management fees from LJM2 are significantly above market. The board may push back if they see the full fee schedule. Should we present the net returns instead?"},
    ]

    for i, thread in enumerate(spe_threads):
        date = (base_date + timedelta(days=i * 8)).isoformat()
        emails.append({
            "message_id": f"spe-{i:03d}",
            "date": date,
            "subject": thread["subject"],
            "body": thread["body"],
            "from": thread["from"],
            "to": thread["to"],
            "threat_category": "financial_fraud",
        })

    # Generate volume emails between Fastow-Kopper (anomaly spike)
    fastow_kopper_subjects = [
        "Re: Partnership Update", "Re: LJM Status", "Re: SPE Transfer",
        "Raptor Update", "Chewco Equity", "Off-balance Sheet Item",
        "Mark-to-Market Review", "Vehicle Documentation",
    ]
    for i in range(60):
        date = (base_date + timedelta(days=i * 2 + random.randint(0, 1))).isoformat()
        emails.append({
            "message_id": f"spe-vol-{i:03d}",
            "date": date,
            "subject": f"{random.choice(fastow_kopper_subjects)} #{i}",
            "body": f"Status update on the SPE restructuring. The off-balance-sheet vehicle for tranche {i} is processing. LJM partnership documentation attached.",
            "from": "andrew.fastow@enron.com" if i % 2 == 0 else "michael.kopper@enron.com",
            "to": "michael.kopper@enron.com" if i % 2 == 0 else "andrew.fastow@enron.com",
            "threat_category": "financial_fraud",
        })

    # Fastow-Glisan volume
    for i in range(30):
        date = (base_date + timedelta(days=i * 4 + random.randint(0, 2))).isoformat()
        emails.append({
            "message_id": f"spe-fg-{i:03d}",
            "date": date,
            "subject": f"Condor/Whitewing Update #{i}",
            "body": f"Ben, updating on Condor entity status. The special purpose vehicle capitalization is on track. Need your signoff on the mark-to-market adjustment.",
            "from": "andrew.fastow@enron.com" if i % 2 == 0 else "ben.glisan@enron.com",
            "to": "ben.glisan@enron.com" if i % 2 == 0 else "andrew.fastow@enron.com",
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
        {"from": "richard.sanders@enron.com", "to": "mark.taylor@enron.com",
         "subject": "File Cleanup - Trading Floor",
         "body": "Mark, we need the trading floor to comply with the retention policy update. Make sure all preliminary deal memos and draft term sheets are sent through the shred room. Only keep final executed documents."},
        {"from": "mark.taylor@enron.com", "to": "richard.sanders@enron.com",
         "subject": "Re: File Cleanup - Trading Floor",
         "body": "Rich, the trading desk has started the cleanup. We're wiping the shared drive folders that contain draft analyses. The physical files are going to the shred room in batches. Should take 2-3 days to complete."},
        {"from": "david.duncan@enron.com", "to": "richard.causey@enron.com",
         "subject": "Audit Workpapers - Urgent",
         "body": "Rick, per our discussion, we are implementing the document retention policy for the audit workpapers. The team has begun destroying non-essential records per the standard Andersen policy."},
        {"from": "sara.shackleton@enron.com", "to": "james.derrick@enron.com",
         "subject": "Electronic Records Purge Status",
         "body": "Jim, we've completed the purge of electronic draft files from the legal shared drives. Backup tapes from Q1-Q2 have been wiped per the retention schedule. Should we also address email archives?"},
    ]

    for i, thread in enumerate(destruction_threads):
        date = (base_date + timedelta(days=i * 6)).isoformat()
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
    legal_people = [
        "james.derrick@enron.com", "richard.sanders@enron.com",
        "sara.shackleton@enron.com", "mark.taylor@enron.com",
    ]
    destruction_subjects = [
        "Re: Retention Policy Compliance", "Re: File Cleanup Status",
        "Shred Room Schedule", "Document Review", "Re: Purge Update",
    ]
    for i in range(50):
        date = (base_date + timedelta(days=i * 1.5 + random.random())).isoformat()
        sender = legal_people[i % len(legal_people)]
        receiver = legal_people[(i + 1) % len(legal_people)]
        emails.append({
            "message_id": f"dest-vol-{i:03d}",
            "date": date,
            "subject": f"{random.choice(destruction_subjects)} {i}",
            "body": "Confirming compliance with the updated retention schedule. The shred room is processing documents from our floor. Please confirm your team's status.",
            "from": sender,
            "to": receiver,
            "threat_category": "data_destruction",
        })
    return emails

# === NORMAL BUSINESS EMAILS (baseline for contrast) ===
def _normal_emails():
    emails = []

    all_people = [p["email"] for p in PERSONS]
    departments = {}
    for p in PERSONS:
        departments.setdefault(p["department"], []).append(p["email"])

    # Normal meeting/status emails across the full timeline
    normal_subjects = [
        "Meeting Notes", "Weekly Update", "Q{q} Planning", "Budget Review",
        "Team Standup Notes", "Action Items from Today", "FYI - Schedule Change",
        "Conference Room Booking", "Re: Lunch Plans", "Holiday Schedule",
        "Performance Review Reminder", "Training Session", "IT System Update",
        "Benefits Enrollment", "Re: Office Supplies", "Quarterly Objectives",
        "Travel Arrangements", "Client Follow-up", "Project Status",
        "Re: Upcoming Presentation", "Draft Agenda", "Expense Report Reminder",
    ]

    normal_bodies = [
        "Attached are the meeting notes from today's discussion. Please review and provide feedback by end of week.",
        "Just wanted to follow up on our conversation earlier. Let me know if you need anything else from my end.",
        "Here's the weekly status update. All projects are on track. No blockers to report at this time.",
        "Please find the budget figures attached. We're within 5% of projections for this quarter.",
        "Reminder: the team lunch is scheduled for Friday at noon. Please RSVP by Wednesday.",
        "The quarterly planning session is confirmed for next Monday at 10am in the main conference room.",
        "Following up on the action items from yesterday's meeting. I've completed items 1-3 on the list.",
        "Hi team, just a reminder that expense reports are due by end of month. Please submit through the portal.",
        "The IT team will be performing maintenance this weekend. Systems may be unavailable Saturday 6am-12pm.",
        "Please review the attached draft presentation for the client meeting next week. Feedback welcome.",
        "Confirming the travel arrangements for the Houston conference. Flights and hotel are booked.",
        "Thanks for the quick turnaround on the analysis. The numbers look solid. Let's discuss in our 1:1.",
    ]

    # Generate 850+ normal emails across Jan 2000 - Dec 2001
    for i in range(850):
        # Random date across the Enron timeline
        days_offset = random.randint(0, 700)  # ~Jan 2000 to Dec 2001
        date = (datetime(2000, 1, 1) + timedelta(days=days_offset)).isoformat()

        # Prefer intra-department communication (more realistic)
        if random.random() < 0.6:
            # Same department
            dept = random.choice(list(departments.keys()))
            dept_people = departments[dept]
            if len(dept_people) >= 2:
                sender, receiver = random.sample(dept_people, 2)
            else:
                sender = dept_people[0]
                receiver = random.choice([p for p in all_people if p != sender])
        else:
            # Cross-department
            sender, receiver = random.sample(all_people, 2)

        quarter = (datetime(2000, 1, 1) + timedelta(days=days_offset)).month // 4 + 1
        subject = random.choice(normal_subjects).replace("{q}", str(quarter))
        body = random.choice(normal_bodies)

        emails.append({
            "message_id": f"norm-{i:03d}",
            "date": date,
            "subject": f"{subject} - {date[:10]}",
            "body": body,
            "from": sender,
            "to": receiver,
            "threat_category": None,
        })
    return emails

# === INAPPROPRIATE RELATIONS (scattered through timeline) ===
def _inappropriate_emails():
    emails = []
    base_date = datetime(2001, 3, 1)

    inappropriate_threads = [
        {"from": "jeff.skilling@enron.com", "to": "louise.kitchen@enron.com",
         "subject": "Private Dinner Tonight",
         "body": "Louise, let's keep tonight's dinner between us. The usual place at 8pm. I don't think anyone from the office needs to know about our personal meetings."},
        {"from": "louise.kitchen@enron.com", "to": "jeff.skilling@enron.com",
         "subject": "Re: Private Dinner Tonight",
         "body": "Jeff, I'm uncomfortable with how often we're meeting outside of work. People are starting to talk. I think we need to keep our relationship strictly professional going forward."},
        {"from": "cliff.baxter@enron.com", "to": "jeff.skilling@enron.com",
         "subject": "Complaint About Working Conditions",
         "body": "Jeff, the hostile work environment on the trading floor needs to be addressed. I've received multiple complaints about inappropriate comments and retaliation against those who speak up. HR has been unresponsive."},
        {"from": "jeff.skilling@enron.com", "to": "cliff.baxter@enron.com",
         "subject": "Re: Complaint About Working Conditions",
         "body": "Cliff, I'll look into the harassment complaints. But I need you to keep this quiet for now. We can't have the board hearing about internal issues while we're dealing with the stock price situation."},
    ]

    for i, thread in enumerate(inappropriate_threads):
        date = (base_date + timedelta(days=i * 15)).isoformat()
        emails.append({
            "message_id": f"inap-{i:03d}",
            "date": date,
            "subject": thread["subject"],
            "body": thread["body"],
            "from": thread["from"],
            "to": thread["to"],
            "threat_category": "inappropriate_relations",
        })

    # Additional volume
    for i in range(20):
        date = (base_date + timedelta(days=i * 5 + random.randint(0, 3))).isoformat()
        emails.append({
            "message_id": f"inap-vol-{i:03d}",
            "date": date,
            "subject": f"Re: Personal Matter #{i}",
            "body": "This is a private matter that should remain confidential. Let's discuss in person rather than over email.",
            "from": "jeff.skilling@enron.com" if i % 2 == 0 else "louise.kitchen@enron.com",
            "to": "louise.kitchen@enron.com" if i % 2 == 0 else "jeff.skilling@enron.com",
            "threat_category": "inappropriate_relations",
        })

    return emails


CURATED_EMAILS = _spe_emails() + _destruction_emails() + _normal_emails() + _inappropriate_emails()


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

        # Create emails and relationships in batches
        print(f"Creating {len(CURATED_EMAILS)} curated emails...")
        batch_size = 100
        for batch_start in range(0, len(CURATED_EMAILS), batch_size):
            batch = CURATED_EMAILS[batch_start:batch_start + batch_size]
            for e in batch:
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
            print(f"  Created {min(batch_start + batch_size, len(CURATED_EMAILS))}/{len(CURATED_EMAILS)} emails...")

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
                    WHEN vol > 15 THEN vol * 0.3
                    WHEN vol > 5  THEN vol * 0.5
                    ELSE vol * 0.8
                END,
                r.anomaly_score = CASE
                    WHEN vol > 30 THEN (vol - vol * 0.3) / (vol * 0.12 + 1)
                    WHEN vol > 15 THEN (vol - vol * 0.5) / (vol * 0.15 + 1) + 0.5
                    WHEN vol > 8  THEN 1.2
                    WHEN vol > 3  THEN 0.8
                    ELSE 0.3
                END
        """)

        # Boost anomaly score for edges carrying threat-category emails
        print("Boosting scores for threat-category edges...")
        session.run("""
            MATCH (a:Person)-[:SENT]->(e:Email)-[:RECEIVED_TO|RECEIVED_CC]->(b:Person)
            WHERE e.threat_category IS NOT NULL AND e.threat_category <> ''
            WITH a, b, count(e) AS threat_count
            MATCH (a)-[r:COMMUNICATES_WITH]->(b)
            SET r.anomaly_score = CASE
                    WHEN r.anomaly_score + (threat_count * 0.3) < 2.5
                    THEN 2.5 + threat_count * 0.1
                    ELSE r.anomaly_score + (threat_count * 0.3)
                END,
                r.threat_email_count = threat_count
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
        result = session.run("MATCH (e:Email) WHERE e.threat_category IS NOT NULL RETURN count(e) AS threat_emails").single()
        print(f"Seeded: {result['threat_emails']} threat-related emails")

    driver.close()
    print(f"\nCurated seed data loaded successfully! ({len(CURATED_EMAILS)} total emails)")


if __name__ == "__main__":
    seed()
