"""Cypher query tool functions for the Investigator agent."""
from db.neo4j_client import neo4j_client
from forensic.wrapper import forensic_tool


@forensic_tool("neo4j_degree_centrality", "investigator")
async def get_degree_centrality(trace_id: str = "unknown") -> list[dict]:
    """Get top nodes by degree centrality."""
    query = """
        MATCH (p:Person)
        RETURN p.email AS email, p.name AS name, p.department AS department,
               p.degree_centrality AS degree_centrality
        ORDER BY p.degree_centrality DESC
        LIMIT 50
    """
    return neo4j_client.execute_read(query)


@forensic_tool("neo4j_communication_volume", "investigator")
async def get_communication_volume(
    start_date: str,
    end_date: str,
    trace_id: str = "unknown",
) -> list[dict]:
    """Get communication edges with volume for a time window."""
    query = """
        MATCH (a:Person)-[:SENT]->(e:Email)-[:RECEIVED_TO|RECEIVED_CC]->(b:Person)
        WHERE e.date >= $start_date AND e.date <= $end_date
        RETURN a.email AS source, b.email AS target, count(e) AS volume
        ORDER BY volume DESC
        LIMIT 100
    """
    return neo4j_client.execute_read(query, {"start_date": start_date, "end_date": end_date})


@forensic_tool("neo4j_anomaly_detection", "investigator")
async def detect_anomalies(
    start_date: str,
    end_date: str,
    threshold: float = 2.0,
    person_emails: list[str] | None = None,
    departments: list[str] | None = None,
    trace_id: str = "unknown",
) -> list[dict]:
    """Detect communication anomalies using trailing 30-day baseline comparison.

    Returns edges where recent volume exceeds the baseline by more than threshold standard deviations.
    Optionally filtered to specific people or departments.
    """
    query = """
        MATCH (a:Person)-[r:COMMUNICATES_WITH]->(b:Person)
        WHERE r.anomaly_score >= $threshold
    """
    params: dict = {"threshold": threshold}

    if person_emails:
        query += " AND (a.email IN $person_emails OR b.email IN $person_emails)"
        params["person_emails"] = person_emails

    if departments:
        query += " AND (a.department IN $departments OR b.department IN $departments)"
        params["departments"] = departments

    query += """
        RETURN a.email AS source, b.email AS target,
               r.trailing_30d_volume AS recent_volume,
               r.trailing_30d_baseline AS baseline,
               r.anomaly_score AS anomaly_score,
               r.total_volume AS total_volume
        ORDER BY r.anomaly_score DESC
    """
    return neo4j_client.execute_read(query, params)


@forensic_tool("neo4j_threat_keyword_scan", "investigator")
async def detect_threat_emails(
    start_date: str,
    end_date: str,
    person_emails: list[str] | None = None,
    departments: list[str] | None = None,
    trace_id: str = "unknown",
) -> list[dict]:
    """Find communication edges containing threat-category emails,
    regardless of anomaly score. Ensures content-based threats are surfaced
    even when volume-based anomaly detection misses them."""
    query = """
        MATCH (a:Person)-[:SENT]->(e:Email)-[:RECEIVED_TO|RECEIVED_CC]->(b:Person)
        WHERE e.threat_category IS NOT NULL AND e.threat_category <> ''
          AND e.date >= $start_date AND e.date <= $end_date
    """
    params: dict = {"start_date": start_date, "end_date": end_date}

    if person_emails:
        query += " AND (a.email IN $person_emails OR b.email IN $person_emails)"
        params["person_emails"] = person_emails

    if departments:
        query += " AND (a.department IN $departments OR b.department IN $departments)"
        params["departments"] = departments

    query += """
        WITH a, b, count(e) AS threat_volume,
             collect(DISTINCT e.threat_category) AS categories,
             collect(e.message_id) AS email_ids
        OPTIONAL MATCH (a)-[r:COMMUNICATES_WITH]->(b)
        RETURN a.email AS source, b.email AS target,
               threat_volume,
               categories,
               email_ids,
               COALESCE(r.anomaly_score, 1.0) AS anomaly_score,
               COALESCE(r.total_volume, threat_volume) AS total_volume
        ORDER BY threat_volume DESC
    """
    return neo4j_client.execute_read(query, params)


@forensic_tool("neo4j_get_emails", "investigator")
async def get_emails_between(
    source: str,
    target: str,
    start_date: str,
    end_date: str,
    trace_id: str = "unknown",
) -> list[dict]:
    """Retrieve emails between two people in a time window."""
    query = """
        MATCH (a:Person {email: $source})-[:SENT]->(e:Email)-[:RECEIVED_TO|RECEIVED_CC]->(b:Person {email: $target})
        WHERE e.date >= $start_date AND e.date <= $end_date
        RETURN e.message_id AS message_id, e.date AS date, e.subject AS subject,
               e.body AS body, e.vader_compound AS vader_compound,
               a.email AS from_addr, b.email AS to_addr
        ORDER BY e.date
    """
    return neo4j_client.execute_read(query, {
        "source": source, "target": target,
        "start_date": start_date, "end_date": end_date,
    })
