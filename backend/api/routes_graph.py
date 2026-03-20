from fastapi import APIRouter
from db.neo4j_client import neo4j_client

router = APIRouter()


@router.get("/nodes")
async def get_nodes(
    department: str | None = None,
    min_degree: int = 0,
):
    query = "MATCH (p:Person) WHERE p.degree_centrality >= $min_degree"
    params: dict = {"min_degree": min_degree}
    if department:
        query += " AND p.department = $department"
        params["department"] = department
    query += " RETURN p.email AS id, p.name AS name, p.department AS department, p.degree_centrality AS degree"
    return neo4j_client.execute_read(query, params)


@router.get("/snapshot")
async def get_graph_snapshot(
    start_date: str | None = None,
    end_date: str | None = None,
    department: str | None = None,
    threat_category: str | None = None,
    include_scores: bool = False,
):
    """Full graph snapshot filtered by time/dept/threat for dashboard rendering.

    Edges are computed dynamically from actual Email nodes in the time window
    so the graph updates correctly as the time slider moves.
    """
    # ── Nodes ──
    # COALESCE guards against missing properties (name, department, degree).
    # LIMIT 150 keeps the force graph performant on the Enron dataset.
    node_query = "MATCH (p:Person)"
    node_conditions = []
    node_params: dict = {}
    if department:
        node_conditions.append("p.department = $department")
        node_params["department"] = department
    if node_conditions:
        node_query += " WHERE " + " AND ".join(node_conditions)
    node_query += """
        RETURN p.email AS id,
               COALESCE(p.name, p.email) AS name,
               COALESCE(p.department, 'Unknown') AS department,
               COALESCE(p.degree_centrality, 1.0) AS degree
        ORDER BY degree DESC
        LIMIT 150
    """

    # ── Edges (dynamic: count actual emails in the time window) ──
    # This makes the graph truly responsive to the time slider.
    edge_params: dict = {"start_date": start_date, "end_date": end_date}

    # Seed script creates (Email)-[:RECEIVED_TO]->(Person), so the arrow
    # from Email to Person is outgoing — use -[:RECEIVED_TO]-> not <-
    edge_query = """
        MATCH (a:Person)-[:SENT]->(e:Email)-[:RECEIVED_TO|RECEIVED_CC]->(b:Person)
        WHERE ($start_date IS NULL OR e.date >= $start_date)
          AND ($end_date   IS NULL OR e.date <= $end_date)
    """

    if department:
        edge_query += " AND (a.department = $dept OR b.department = $dept)"
        edge_params["dept"] = department

    if threat_category:
        edge_query += " AND e.threat_category = $threat_category"
        edge_params["threat_category"] = threat_category

    edge_query += """
        WITH a, b, count(e) AS volume
        WHERE volume > 0
        OPTIONAL MATCH (a)-[r:COMMUNICATES_WITH]->(b)
        RETURN a.email AS source, b.email AS target,
               volume,
               COALESCE(r.anomaly_score,
                 CASE WHEN volume > 8 THEN 3.5
                      WHEN volume > 4 THEN 2.0
                      ELSE 0.8 END) AS anomaly_score
        ORDER BY anomaly_score DESC, volume DESC
        LIMIT 300
    """

    nodes = neo4j_client.execute_read(node_query, node_params)
    edges = neo4j_client.execute_read(edge_query, edge_params)

    # Prune lonely nodes: only keep nodes that appear in at least one edge
    # to prevent isolated dots cluttering the force graph.
    if edges:
        active_ids = set()
        for e in edges:
            active_ids.add(e["source"])
            active_ids.add(e["target"])
        nodes = [n for n in nodes if n["id"] in active_ids]

    # Compute per-node suspicion scores from edge anomaly data
    if include_scores and edges:
        score_map: dict[str, dict] = {}
        for e in edges:
            for person_id in (e["source"], e["target"]):
                if person_id not in score_map:
                    score_map[person_id] = {"total_anomaly": 0.0, "anomalous_edges": 0, "total_volume": 0}
                score_map[person_id]["total_anomaly"] += float(e.get("anomaly_score", 0))
                score_map[person_id]["total_volume"] += int(e.get("volume", 0))
                if float(e.get("anomaly_score", 0)) > 2.0:
                    score_map[person_id]["anomalous_edges"] += 1

        for node in nodes:
            nid = node["id"]
            if nid in score_map:
                s = score_map[nid]
                # Suspicion = weighted combo of anomaly scores and edge count, normalized 0-100
                raw = (s["total_anomaly"] * 8) + (s["anomalous_edges"] * 15) + (s["total_volume"] * 0.3)
                node["suspicion_score"] = round(min(100, max(0, raw)), 1)
            else:
                node["suspicion_score"] = 0

    return {"nodes": nodes, "edges": edges}
