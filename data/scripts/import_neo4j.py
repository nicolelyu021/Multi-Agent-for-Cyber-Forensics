"""Import parsed Enron CSVs into Neo4j."""
import csv
import sys
from pathlib import Path

from neo4j import GraphDatabase

DATA_DIR = Path(__file__).parent.parent
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "enronpass123"

# Known Enron departments (partial mapping)
DEPARTMENT_MAP = {
    "jeff.skilling": "Executive", "kenneth.lay": "Executive", "andrew.fastow": "Finance",
    "richard.causey": "Accounting", "ben.glisan": "Finance", "michael.kopper": "Finance",
    "lea.fastow": "Finance", "sherron.watkins": "Accounting",
    "james.derrick": "Legal", "richard.sanders": "Legal", "sara.shackleton": "Legal",
    "mark.haedicke": "Legal", "elizabeth.sager": "Legal",
    "louise.kitchen": "Trading", "john.lavorato": "Trading", "greg.whalley": "Trading",
    "vince.kaminski": "Research", "stinson.gibner": "Research",
}


def get_department(email_addr: str) -> str:
    username = email_addr.split("@")[0] if "@" in email_addr else email_addr
    # Check first.last pattern
    for known, dept in DEPARTMENT_MAP.items():
        if known in username:
            return dept
    return "Unknown"


def import_data(deidentified=False):
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    with driver.session() as session:
        # Create constraints and indexes
        print("Creating indexes...")
        session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.email IS UNIQUE")
        session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (e:Email) REQUIRE e.message_id IS UNIQUE")
        session.run("CREATE INDEX IF NOT EXISTS FOR (e:Email) ON (e.date)")

        # Import persons
        print("Importing persons...")
        prefix = "deidentified_" if deidentified else ""
        persons_file = DATA_DIR / f"{prefix}persons.csv"
        if not persons_file.exists():
            print(f"{persons_file.name} not found. Run prepare_deidentified.py first." if deidentified else "persons.csv not found. Run parse_maildir.py first.")
            return

        with open(persons_file) as f:
            reader = csv.DictReader(f)
            batch = []
            for row in reader:
                dept = get_department(row["email"])
                name = row["email"].split("@")[0].replace(".", " ").title()
                batch.append({"email": row["email"], "name": name, "department": dept})
                if len(batch) >= 500:
                    session.run(
                        "UNWIND $batch AS row "
                        "MERGE (p:Person {email: row.email}) "
                        "SET p.name = row.name, p.department = row.department",
                        {"batch": batch},
                    )
                    batch = []
            if batch:
                session.run(
                    "UNWIND $batch AS row "
                    "MERGE (p:Person {email: row.email}) "
                    "SET p.name = row.name, p.department = row.department",
                    {"batch": batch},
                )
        print("  Persons imported.")

        # Import emails
        print("Importing emails...")
        emails_file = DATA_DIR / f"{prefix}emails.csv"
        with open(emails_file) as f:
            reader = csv.DictReader(f)
            batch = []
            count = 0
            for row in reader:
                batch.append({
                    "message_id": row["message_id"],
                    "date": row["date"],
                    "subject": row["subject"],
                    "body": row["body"][:2000],  # Truncate for Neo4j
                })
                count += 1
                if len(batch) >= 200:
                    session.run(
                        "UNWIND $batch AS row "
                        "MERGE (e:Email {message_id: row.message_id}) "
                        "SET e.date = row.date, e.subject = row.subject, e.body = row.body",
                        {"batch": batch},
                    )
                    batch = []
                    if count % 10000 == 0:
                        print(f"  {count} emails...")
            if batch:
                session.run(
                    "UNWIND $batch AS row "
                    "MERGE (e:Email {message_id: row.message_id}) "
                    "SET e.date = row.date, e.subject = row.subject, e.body = row.body",
                    {"batch": batch},
                )
        print(f"  {count} emails imported.")

        # Import SENT relationships
        print("Importing SENT relationships...")
        sent_file = DATA_DIR / f"{prefix}sent_rels.csv"
        with open(sent_file) as f:
            reader = csv.DictReader(f)
            batch = []
            for row in reader:
                batch.append(row)
                if len(batch) >= 500:
                    session.run(
                        "UNWIND $batch AS row "
                        "MATCH (p:Person {email: row.person}) "
                        "MATCH (e:Email {message_id: row.message_id}) "
                        "MERGE (p)-[:SENT]->(e)",
                        {"batch": batch},
                    )
                    batch = []
            if batch:
                session.run(
                    "UNWIND $batch AS row "
                    "MATCH (p:Person {email: row.person}) "
                    "MATCH (e:Email {message_id: row.message_id}) "
                    "MERGE (p)-[:SENT]->(e)",
                    {"batch": batch},
                )
        print("  SENT relationships imported.")

        # Import RECEIVED relationships
        print("Importing RECEIVED relationships...")
        received_file = DATA_DIR / f"{prefix}received_rels.csv"
        with open(received_file) as f:
            reader = csv.DictReader(f)
            batch = []
            for row in reader:
                batch.append(row)
                if len(batch) >= 500:
                    session.run(
                        "UNWIND $batch AS row "
                        "MATCH (p:Person {email: row.person}) "
                        "MATCH (e:Email {message_id: row.message_id}) "
                        "FOREACH (x IN CASE WHEN row.type = 'TO' THEN [1] ELSE [] END | MERGE (p)<-[:RECEIVED_TO]-(e)) "
                        "FOREACH (x IN CASE WHEN row.type = 'CC' THEN [1] ELSE [] END | MERGE (p)<-[:RECEIVED_CC]-(e))",
                        {"batch": batch},
                    )
                    batch = []
            if batch:
                session.run(
                    "UNWIND $batch AS row "
                    "MATCH (p:Person {email: row.person}) "
                    "MATCH (e:Email {message_id: row.message_id}) "
                    "FOREACH (x IN CASE WHEN row.type = 'TO' THEN [1] ELSE [] END | MERGE (p)<-[:RECEIVED_TO]-(e)) "
                    "FOREACH (x IN CASE WHEN row.type = 'CC' THEN [1] ELSE [] END | MERGE (p)<-[:RECEIVED_CC]-(e))",
                    {"batch": batch},
                )
        print("  RECEIVED relationships imported.")

        # Create COMMUNICATES_WITH aggregate edges
        print("Creating COMMUNICATES_WITH aggregate edges...")
        session.run("""
            MATCH (a:Person)-[:SENT]->(e:Email)-[:RECEIVED_TO|RECEIVED_CC]->(b:Person)
            WITH a, b, count(e) AS total_volume, collect(e.date) AS dates
            MERGE (a)-[r:COMMUNICATES_WITH]->(b)
            SET r.total_volume = total_volume,
                r.last_activity = reduce(latest = '', d IN dates | CASE WHEN d > latest THEN d ELSE latest END)
        """)
        print("  COMMUNICATES_WITH edges created.")

        # Compute degree centrality
        print("Computing degree centrality...")
        session.run("""
            MATCH (p:Person)-[r:COMMUNICATES_WITH]-()
            WITH p, count(r) AS degree
            SET p.degree_centrality = degree
        """)
        print("  Degree centrality computed.")

    driver.close()
    print("\nImport complete!")


if __name__ == "__main__":
    use_deid = "--deidentified" in sys.argv
    import_data(deidentified=use_deid)
