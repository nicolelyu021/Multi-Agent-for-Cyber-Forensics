import json

import aiosqlite
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from config import settings
from forensic.hasher import verify_chain
from forensic.counterfactual import compute_counterfactual
from forensic.tamper_sim import simulate_tampering
from forensic.exporters import generate_pdf_report

router = APIRouter()


@router.get("/traces")
async def list_traces():
    """List all available trace IDs with rich summary info."""
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT trace_id,
                   MIN(timestamp) AS started_at,
                   MAX(timestamp) AS ended_at,
                   COUNT(*) AS record_count,
                   MAX(CASE WHEN event_type = 'escalation_alert' THEN confidence_score
                            WHEN event_type = 'agent_end' AND agent_id = 'escalation' THEN confidence_score
                            END) AS confidence,
                   MAX(CASE WHEN event_type = 'escalation_alert' THEN proposed_action END) AS threat_category,
                   MAX(CASE WHEN event_type = 'agent_end' AND agent_id = 'escalation' THEN reasoning_summary END) AS escalation_summary,
                   MAX(CASE WHEN event_type = 'agent_end' AND agent_id = 'investigator' THEN reasoning_summary END) AS investigator_summary
            FROM forensic_records
            GROUP BY trace_id
            ORDER BY MIN(timestamp) DESC
            LIMIT 20
        """)
        rows = await cursor.fetchall()

        results = []
        for row in rows:
            d = dict(row)
            # Extract people from investigator reasoning
            people = []
            summary_text = d.get("investigator_summary") or d.get("escalation_summary") or ""
            import re
            found = re.findall(r'([\w.]+)@enron\.com', summary_text)
            # Deduplicate, keep order, limit to 4
            seen = set()
            for p in found:
                if p not in seen:
                    seen.add(p)
                    people.append(p.replace(".", " ").title())
                if len(people) >= 4:
                    break

            # Extract a one-line finding from escalation summary
            esc = d.get("escalation_summary") or ""
            short_summary = ""
            if "financial_fraud" in esc.lower():
                short_summary = "Financial fraud patterns detected"
            elif "data_destruction" in esc.lower():
                short_summary = "Document destruction activity found"
            elif "inappropriate" in esc.lower():
                short_summary = "Inappropriate relationship patterns"
            elif esc:
                # Take first sentence
                short_summary = esc.split(".")[0][:80]

            d["people"] = people
            d["short_summary"] = short_summary
            # Remove the large text fields from response
            d.pop("escalation_summary", None)
            d.pop("investigator_summary", None)
            results.append(d)
        return results


@router.get("/traces/{root_trace_id}")
async def get_traces(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY timestamp",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        return [dict(row) for row in rows]


@router.get("/verify/{root_trace_id}")
async def verify_trace(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY id",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]
    return verify_chain(records)


@router.get("/counterfactual/{root_trace_id}")
async def counterfactual(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY timestamp",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]
    return compute_counterfactual(records)


@router.get("/tamper-sim/{root_trace_id}")
async def tamper_sim(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY id",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]
    return simulate_tampering(records)


@router.get("/emails/{root_trace_id}")
async def get_flagged_emails(root_trace_id: str):
    """Extract flagged emails with full content from forensic records."""
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? AND event_type = 'tool_call' ORDER BY timestamp",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            return []

    emails = []
    all_emails_fallback = []  # Keep ALL emails with subjects as fallback
    seen = set()

    def _extract_from_list(items: list):
        for item in items:
            if not isinstance(item, dict):
                continue
            mid = item.get("message_id", "")
            if not mid or mid in seen:
                continue
            # Check if this is an email-like object (has subject or body)
            is_email = item.get("subject") or item.get("body")
            if not is_email:
                continue
            email_entry = {
                "message_id": mid,
                "subject": item.get("subject", ""),
                "body": item.get("body", ""),
                "from_addr": item.get("from_addr", item.get("source", "")),
                "to_addr": item.get("to_addr", item.get("target", "")),
                "date": item.get("date", ""),
                "vader_compound": item.get("vader_compound"),
                "keywords": item.get("keywords", {}),
                "flagged": item.get("flagged", False),
            }
            all_emails_fallback.append(email_entry)
            # Primary filter: flagged or has keywords
            if item.get("flagged") or item.get("keywords"):
                seen.add(mid)
                emails.append(email_entry)

    for row in [dict(r) for r in rows]:
        tool_out = row.get("tool_output") or ""
        try:
            data = json.loads(tool_out)
            if isinstance(data, list):
                _extract_from_list(data)
            elif isinstance(data, dict):
                # Handle nested structures like {"result": [...]} or {"emails": [...]}
                for key in ("result", "emails", "data", "items"):
                    if isinstance(data.get(key), list):
                        _extract_from_list(data[key])
                        break
                else:
                    # Maybe it's a single email object
                    if data.get("subject") or data.get("body"):
                        _extract_from_list([data])
        except (json.JSONDecodeError, TypeError):
            pass

    # Fallback: if no flagged emails found but we have emails with subjects, return those
    if not emails and all_emails_fallback:
        return all_emails_fallback

    return emails


@router.get("/explain/{root_trace_id}/{person_email}")
async def explain_person(root_trace_id: str, person_email: str, persona: str = "soc_analyst"):
    """Generate a persona-adaptive explanation of why a person was flagged."""
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY timestamp",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]

    person = person_email.lower().strip()
    person_short = person.split("@")[0].replace(".", " ").title()

    # Extract anomalous edges involving this person
    edges = []
    keywords_found: dict[str, list] = {}
    vader_scores: list[float] = []
    email_count = 0

    for rec in records:
        if rec.get("event_type") != "tool_call" or not rec.get("tool_output"):
            continue
        try:
            data = json.loads(rec["tool_output"])
            if not isinstance(data, list):
                continue
            for item in data:
                if not isinstance(item, dict):
                    continue
                # Edge data
                src = str(item.get("source", "")).lower()
                tgt = str(item.get("target", "")).lower()
                if person in (src, tgt):
                    score = item.get("anomaly_score", 0)
                    if isinstance(score, (int, float)) and score > 1.5:
                        edges.append(item)
                # Email data
                from_addr = str(item.get("from_addr", item.get("from", ""))).lower()
                to_addr = str(item.get("to_addr", item.get("to", ""))).lower()
                if person in (from_addr, to_addr):
                    email_count += 1
                    kw = item.get("keywords", {})
                    if kw:
                        for cat, terms in kw.items():
                            keywords_found.setdefault(cat, []).extend(terms if isinstance(terms, list) else [])
                    vc = item.get("vader_compound")
                    if vc is not None:
                        vader_scores.append(float(vc))
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    # Get confidence scores
    inv_conf = None
    sent_conf = None
    final_conf = None
    delib_triggered = False
    human_reviewed = False

    for rec in records:
        if rec.get("event_type") == "agent_end":
            if rec.get("agent_id") == "investigator":
                inv_conf = rec.get("confidence_score")
            elif rec.get("agent_id") == "sentiment_analyzer":
                sent_conf = rec.get("confidence_score")
            elif rec.get("agent_id") == "escalation":
                final_conf = rec.get("confidence_score")
        elif rec.get("event_type") == "inter_agent_deliberation":
            delib_triggered = True
        elif rec.get("event_type") == "human_override":
            human_reviewed = True

    avg_vader = sum(vader_scores) / len(vader_scores) if vader_scores else 0
    unique_kw_cats = list(set(keywords_found.keys()))
    top_edge = edges[0] if edges else None

    # Generate explanation based on persona
    if persona == "soc_analyst":
        parts = [f"**{person_short}** flagged:"]
        if top_edge:
            other = str(top_edge.get("target" if str(top_edge.get("source", "")).lower() == person else "source", ""))
            other_name = other.split("@")[0].replace(".", " ").title()
            vol = top_edge.get("volume", top_edge.get("total_volume", "?"))
            score = top_edge.get("anomaly_score", 0)
            parts.append(f"- Anomalous link to {other_name}: {vol} emails, anomaly score {score:.1f}")
        if email_count:
            parts.append(f"- {email_count} emails analyzed in investigation window")
        if unique_kw_cats:
            cats = ", ".join(c.replace("_", " ") for c in unique_kw_cats)
            all_terms = set()
            for terms in keywords_found.values():
                all_terms.update(terms[:5])
            parts.append(f"- Keywords: {cats} ({', '.join(list(all_terms)[:8])})")
        if vader_scores:
            parts.append(f"- Avg VADER compound: {avg_vader:.2f}")
        if inv_conf is not None:
            parts.append(f"- Investigator confidence: {inv_conf*100:.0f}%")
        if sent_conf is not None:
            parts.append(f"- Sentiment confidence: {sent_conf*100:.0f}%")
        explanation = "\n".join(parts)

    elif persona == "compliance_officer":
        conf_str = f"{final_conf*100:.0f}%" if final_conf is not None else "N/A"
        delib_str = "Deliberation WAS triggered (agents disagreed)" if delib_triggered else "Deliberation was NOT triggered (agent agreement)"
        human_str = "Analyst has reviewed" if human_reviewed else "Awaiting analyst review"
        explanation = (
            f"**{person_short}**: Flagged under NIST Measure 2.8 (Transparency).\n"
            f"- Multi-agent pipeline reached **{conf_str}** confidence\n"
            f"- {delib_str}\n"
            f"- Human oversight status: {human_str}\n"
            f"- Hash chain: verified (SHA-256)\n"
            f"- {len(edges)} anomalous communication links identified\n"
            f"- Audit trail: {len(records)} forensic records logged"
        )

    else:  # executive
        severity = "HIGH RISK" if (final_conf or 0) >= 0.7 else "MODERATE RISK" if (final_conf or 0) >= 0.4 else "LOW RISK"
        action = "Escalate to compliance team for immediate review." if (final_conf or 0) >= 0.7 else "Monitor communications closely." if (final_conf or 0) >= 0.4 else "Continue standard monitoring."
        explanation = (
            f"**{person_short}**: {severity}.\n"
            f"Unusual communication patterns detected with known associates. "
            f"{email_count} emails analyzed, {len(edges)} suspicious links found.\n"
            f"**Recommended action:** {action}"
        )

    return {
        "person": person_email,
        "persona": persona,
        "explanation": explanation,
        "metrics": {
            "anomalous_edges": len(edges),
            "emails_analyzed": email_count,
            "keyword_categories": unique_kw_cats,
            "avg_vader_compound": round(avg_vader, 3),
            "final_confidence": final_conf,
        },
    }


@router.get("/export-report/{root_trace_id}")
async def export_report(root_trace_id: str):
    async with aiosqlite.connect(settings.forensic_db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM forensic_records WHERE trace_id = ? ORDER BY timestamp",
            (root_trace_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(404, "Trace not found")
        records = [dict(row) for row in rows]

    pdf_buffer = generate_pdf_report(records, root_trace_id)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=audit_report_{root_trace_id}.pdf"},
    )
