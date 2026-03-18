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
    trace_id: str = "unknown",
) -> list[dict]:
    """Detect communication anomalies using trailing 30-day baseline comparison.

    Returns edges where recent volume exceeds the baseline by more than threshold standard deviations.
    """
    query = """
        MATCH (a:Person)-[r:COMMUNICATES_WITH]->(b:Person)
        WHERE r.anomaly_score >= $threshold
        RETURN a.email AS source, b.email AS target,
               r.trailing_30d_volume AS recent_volume,
               r.trailing_30d_baseline AS baseline,
               r.anomaly_score AS anomaly_score,
               r.total_volume AS total_volume
        ORDER BY r.anomaly_score DESC
    """
    return neo4j_client.execute_read(query, {"threshold": threshold})


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
               e.body AS body, e.vader_compound AS vader_compound
        ORDER BY e.date
    """
    return neo4j_client.execute_read(query, {
        "source": source, "target": target,
        "start_date": start_date, "end_date": end_date,
    })
