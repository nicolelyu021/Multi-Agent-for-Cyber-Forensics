"""Exporters for forensic records: PDF audit report.

The PDF is structured as a professional investigation report with:
  1. Executive Summary  — plain-English overview of findings
  2. Suspicious Emails  — specific emails with highlighted quotes
  3. People of Interest — communication pairs with anomaly data
  4. Agent Findings     — structured per-agent sections with subheadings
  5. Deliberation       — inter-agent disagreement resolution
  6. Evidence Integrity — hash chain verification
  7. Compliance         — NIST/EU AI Act regulatory mapping
"""
import io
import json
import re
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether,
)

from forensic.hasher import verify_chain

# ── Colours ─────────────────────────────────────────────────────────────────
NAVY  = colors.HexColor("#0f172a")
BLUE  = colors.HexColor("#1d4ed8")
AMBER = colors.HexColor("#b45309")
RED   = colors.HexColor("#dc2626")
GREEN = colors.HexColor("#16a34a")
MUTED = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#f8fafc")
LIGHT_BLUE = colors.HexColor("#eff6ff")
LIGHT_RED  = colors.HexColor("#fef2f2")
LIGHT_AMB  = colors.HexColor("#fffbeb")
WHITE = colors.white

AGENT_NAMES = {
    "investigator": "Investigator (Network Analysis)",
    "sentiment_analyzer": "Sentiment Analyzer (Language Analysis)",
    "escalation": "Escalation (Final Decision)",
    "deliberation": "Deliberation (Disagreement Resolution)",
}

THREAT_PLAIN = {
    "financial_fraud": "Financial Fraud",
    "data_destruction": "Document Destruction",
    "inappropriate_relations": "Inappropriate Relationships",
}


def _safe(text: str | None, max_chars: int = 8000) -> str:
    """Escape XML chars and truncate for ReportLab."""
    if not text:
        return ""
    text = str(text)[:max_chars]
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _heading(label: str, styles) -> list:
    return [
        Spacer(1, 14),
        Paragraph(label, styles["SHead"]),
        HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=6),
    ]


def _subheading(label: str, styles) -> Paragraph:
    return Paragraph(label, styles["SubHead"])


def _kv_table(rows, col_widths=(160, 320)):
    tbl = Table(rows, colWidths=list(col_widths))
    tbl.setStyle(TableStyle([
        ("FONTNAME",      (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("TEXTCOLOR",     (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR",     (1, 0), (1, -1), NAVY),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    return tbl


def _extract_emails_and_people(records: list[dict]) -> dict:
    """Extract specific emails, people, and communication pairs from forensic records."""
    people = set()
    edge_map: dict[tuple[str, str], dict] = {}
    emails_detail = []

    for rec in records:
        if rec.get("event_type") == "tool_call" and rec.get("tool_output"):
            try:
                data = json.loads(rec["tool_output"])
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            if "source" in item and "target" in item:
                                src = str(item["source"]).lower().strip()
                                tgt = str(item["target"]).lower().strip()
                                people.add(item["source"])
                                people.add(item["target"])
                                # Deduplicate by normalized pair
                                key = (min(src, tgt), max(src, tgt))
                                if key in edge_map:
                                    existing = edge_map[key]
                                    # Sum volumes, keep max anomaly_score
                                    for vol_key in ("volume", "total_volume"):
                                        if vol_key in item and vol_key in existing:
                                            try:
                                                existing[vol_key] = int(existing[vol_key]) + int(item[vol_key])
                                            except (ValueError, TypeError):
                                                pass
                                    cur_score = item.get("anomaly_score", 0)
                                    ex_score = existing.get("anomaly_score", 0)
                                    if isinstance(cur_score, (int, float)) and isinstance(ex_score, (int, float)):
                                        existing["anomaly_score"] = max(cur_score, ex_score)
                                else:
                                    edge_map[key] = dict(item)
                            if "subject" in item and "body" in item:
                                emails_detail.append(item)
                            elif "subject" in item:
                                emails_detail.append(item)
            except (json.JSONDecodeError, TypeError):
                pass

        if rec.get("event_type") == "tool_call" and rec.get("tool_input"):
            try:
                inp = json.loads(rec["tool_input"])
                if isinstance(inp, dict):
                    if "source" in inp:
                        people.add(inp["source"])
                    if "target" in inp:
                        people.add(inp["target"])
            except (json.JSONDecodeError, TypeError):
                pass

        reasoning = rec.get("reasoning_summary") or ""
        found_emails = re.findall(r'[\w.]+@enron\.com', reasoning)
        people.update(found_emails)

    # Sort edges by anomaly_score descending
    edges = sorted(edge_map.values(), key=lambda e: e.get("anomaly_score", 0), reverse=True)

    return {
        "people": sorted(people)[:20],
        "edges": edges[:15],
        "emails": emails_detail[:20],
    }


def _extract_flagged_email_details(records: list[dict]) -> list[dict]:
    """Extract individual flagged emails with subjects, keywords, body snippets, and reasons."""
    flagged = []

    for rec in records:
        if rec.get("event_type") != "tool_call":
            continue
        tool_out = rec.get("tool_output") or ""
        try:
            data = json.loads(tool_out)
            if isinstance(data, list):
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    if item.get("flagged") or item.get("keywords"):
                        entry = {
                            "message_id": item.get("message_id", ""),
                            "subject": item.get("subject", ""),
                            "from": item.get("from_addr", item.get("from", item.get("sender", ""))),
                            "to": item.get("to_addr", item.get("to", item.get("receiver", ""))),
                            "date": item.get("date", ""),
                            "vader_compound": item.get("vader_compound"),
                            "keywords": item.get("keywords", {}),
                            "body_snippet": "",
                        }
                        body = item.get("body", "")
                        if body:
                            entry["body_snippet"] = body[:400]
                        flagged.append(entry)
        except (json.JSONDecodeError, TypeError):
            pass

    # Deduplicate by message_id
    seen = set()
    unique = []
    for f in flagged:
        mid = f["message_id"]
        if mid and mid not in seen:
            seen.add(mid)
            unique.append(f)
    return unique[:15]


def _parse_reasoning_into_sections(reasoning_text: str) -> list[dict]:
    """Break a wall of agent reasoning text into structured sections.

    Returns list of {heading, content} dicts. If no clear structure is found,
    returns a single section with the full text.
    """
    if not reasoning_text:
        return []

    sections = []

    # Try to split on numbered sections, bullet headers, or capitalized headers
    # Pattern: "1. Something:" or "**Something**:" or "SOMETHING:" or "- Something:"
    pattern = r'(?:^|\n)(?:(?:\d+[\.\)]\s*)|(?:\*\*)|(?:- ))([A-Z][^:\n]{3,50})(?:\*\*)?:'
    matches = list(re.finditer(pattern, reasoning_text))

    if matches and len(matches) >= 2:
        for i, match in enumerate(matches):
            heading = match.group(1).strip().strip("*").strip()
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(reasoning_text)
            content = reasoning_text[start:end].strip()
            if content:
                sections.append({"heading": heading, "content": content})
    else:
        # Try splitting on sentences for very long text
        sentences = re.split(r'(?<=[.!?])\s+', reasoning_text)
        if len(sentences) > 6:
            # Group into logical chunks
            chunk_size = max(2, len(sentences) // 3)
            chunks = [sentences[i:i + chunk_size] for i in range(0, len(sentences), chunk_size)]
            labels = ["Key Observations", "Analysis Details", "Conclusions"]
            for i, chunk in enumerate(chunks[:3]):
                label = labels[i] if i < len(labels) else f"Additional Details ({i + 1})"
                sections.append({"heading": label, "content": " ".join(chunk)})
        else:
            sections.append({"heading": "", "content": reasoning_text})

    return sections


def _quote_box(text: str, styles) -> Table:
    """Wrap text in a single-cell Table to create a reliable bordered box."""
    para = Paragraph(text, styles["Quote"])
    tbl = Table([[para]], colWidths=[440])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#94a3b8")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    return tbl


def _highlight_keywords_in_text(text: str) -> str:
    """Add bold/red formatting around suspicious keywords in text."""
    keywords = [
        "shred", "destroy", "delete", "wipe", "clean up", "retention policy",
        "off-balance", "SPE", "special purpose", "LJM", "Raptor", "Chewco",
        "mark to market", "mark-to-market", "insider", "manipulat",
        "inappropriat", "relationship", "personal", "romantic",
        "fraud", "suspicious", "anomal", "unusual", "irregular",
        "concealment", "hidden", "disguise",
    ]
    safe_text = _safe(text)

    for kw in keywords:
        # Case-insensitive replacement with bold+red
        pattern = re.compile(re.escape(kw), re.IGNORECASE)
        safe_text = pattern.sub(
            lambda m: f'<font color="#dc2626"><b>{m.group(0)}</b></font>',
            safe_text
        )
    return safe_text


def generate_pdf_report(records: list[dict], trace_id: str) -> io.BytesIO:
    """Generate a well-formatted, human-readable PDF audit report."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )

    base = getSampleStyleSheet()
    styles = {}

    def _add(name, parent_key="Normal", **kw):
        styles[name] = ParagraphStyle(name, parent=base[parent_key], **kw)

    _add("DocTitle",  "Title",    fontSize=20, textColor=NAVY,  spaceAfter=4, fontName="Helvetica-Bold")
    _add("SHead",     "Heading2", fontSize=12, textColor=BLUE,  spaceAfter=2, fontName="Helvetica-Bold")
    _add("SubHead",   "Normal",   fontSize=10, textColor=NAVY,  fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=3)
    _add("SubHead2",  "Normal",   fontSize=9,  textColor=colors.HexColor("#334155"), fontName="Helvetica-Bold", spaceBefore=6, spaceAfter=2)
    _add("Body",      "Normal",   fontSize=9,  textColor=NAVY,  leading=14)
    _add("BodySmall", "Normal",   fontSize=8,  textColor=NAVY,  leading=12)
    _add("Muted",     "Normal",   fontSize=8,  textColor=MUTED)
    _add("AgentTag",  "Normal",   fontSize=10, textColor=BLUE,  fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4)
    _add("DelibTag",  "Normal",   fontSize=10, textColor=AMBER, fontName="Helvetica-Bold")
    _add("Highlight", "Normal",   fontSize=9,  textColor=RED,   fontName="Helvetica-Bold")
    _add("EmailSubj", "Normal",   fontSize=9,  textColor=NAVY,  fontName="Helvetica-Bold", spaceBefore=6)
    _add("Quote",     "Normal",   fontSize=8,  textColor=colors.HexColor("#334155"), leading=12,
         leftIndent=4, rightIndent=4)
    _add("KeyFinding", "Normal",  fontSize=9, textColor=colors.HexColor("#991b1b"), leading=13,
         leftIndent=10, backColor=LIGHT_RED, borderPadding=6)

    story = []

    # ── Cover ────────────────────────────────────────────────────────────────
    story.append(Paragraph("Forensic Audit Report", styles["DocTitle"]))
    story.append(Paragraph(
        "Insider Threat Analysis &mdash; Enron Email Corpus",
        styles["Muted"],
    ))
    story.append(Spacer(1, 6))
    story.append(_kv_table([
        ("Trace ID",         trace_id),
        ("Generated",        datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")),
        ("Records analyzed", str(len(records))),
    ]))

    # Pre-extract all evidence
    evidence = _extract_emails_and_people(records)
    flagged_emails = _extract_flagged_email_details(records)

    # Find key records
    escalation_rec = None
    agent_end_records = []
    delib_records = []
    for r in records:
        if r.get("event_type") == "escalation_alert":
            escalation_rec = r
        elif r.get("event_type") == "agent_end":
            agent_end_records.append(r)
            if r.get("agent_id") == "escalation" and not escalation_rec:
                escalation_rec = r
        elif r.get("event_type") == "inter_agent_deliberation":
            delib_records.append(r)

    # ── 1. EXECUTIVE SUMMARY ─────────────────────────────────────────────────
    story += _heading("1. Summary: What Was Found", styles)

    if escalation_rec:
        confidence = escalation_rec.get("confidence_score")
        conf_pct = f"{confidence * 100:.1f}%" if confidence is not None else "N/A"
        reasoning = escalation_rec.get("reasoning_summary") or ""

        threat_cat = "Unknown"
        for cat_key, cat_label in THREAT_PLAIN.items():
            if cat_key in reasoning.lower().replace(" ", "_"):
                threat_cat = cat_label
                break

        is_high = confidence is not None and confidence >= 0.7
        severity = "HIGH" if is_high else "MODERATE" if confidence and confidence >= 0.4 else "LOW"

        people_names = ", ".join(
            e.split("@")[0].replace(".", " ").title() for e in evidence["people"][:4]
        )

        # Recommended action based on severity
        if is_high:
            action_text = "Immediate review recommended. Escalate to compliance team."
        elif confidence and confidence >= 0.4:
            action_text = "Further investigation warranted. Monitor communications closely."
        else:
            action_text = "Low risk detected. Continue standard monitoring procedures."

        story.append(Paragraph(
            f"The system analyzed emails between <b>{_safe(people_names)}</b> "
            f"and found <b>{severity} risk</b> of <b>{threat_cat}</b> activity. "
            f"The overall confidence score is <b>{conf_pct}</b>.",
            styles["Body"],
        ))
        story.append(Spacer(1, 8))

        story.append(_kv_table([
            ("Threat type",          threat_cat),
            ("Confidence level",     f"{conf_pct} ({severity} risk)"),
            ("Recommended action",   action_text),
            ("Suspicious email pairs", str(len(evidence["edges"]))),
            ("Emails flagged",       str(len(flagged_emails))),
            ("Agents involved",      str(len(set(r.get("agent_id") for r in records if r.get("agent_id"))))),
        ]))
    else:
        agent_ends = [r for r in records if r.get("event_type") == "agent_end"]
        if agent_ends:
            last = agent_ends[-1]
            conf = last.get("confidence_score")
            story.append(Paragraph(
                f"The system completed its analysis with a confidence of "
                f"<b>{conf * 100:.1f}%</b> (below the alert threshold). "
                f"No formal alert was raised, but the following patterns were noted.",
                styles["Body"],
            ))
        else:
            story.append(Paragraph(
                "The analysis completed without generating an alert.",
                styles["Body"],
            ))

    # ── 2. SUSPICIOUS EMAILS ─────────────────────────────────────────────────
    story += _heading("2. Suspicious Emails Found", styles)

    if flagged_emails:
        # Key Finding callout — most concerning finding
        all_kw_categories = set()
        for fe in flagged_emails:
            all_kw_categories.update(fe.get("keywords", {}).keys())
        kw_summary = ", ".join(cat.replace("_", " ") for cat in all_kw_categories) if all_kw_categories else "behavioral anomalies"
        high_risk_count = sum(1 for fe in flagged_emails if fe.get("keywords") and (fe.get("vader_compound") or 0) < -0.3)

        finding_text = (
            f"<b>{len(flagged_emails)} emails</b> were flagged for <b>{kw_summary}</b>."
        )
        if high_risk_count:
            finding_text += f" Of these, <b>{high_risk_count}</b> show both threat keywords and negative tone, indicating heightened risk."

        story.append(Paragraph(finding_text, styles["KeyFinding"]))
        story.append(Spacer(1, 8))

        story.append(Paragraph(
            f"Key details and the specific content that triggered each flag are shown below.",
            styles["Body"],
        ))
        story.append(Spacer(1, 8))

        for i, email in enumerate(flagged_emails, 1):
            email_elements = []

            subj = _safe(email.get("subject") or "(no subject)")
            sender = _safe(str(email.get("from", "")).split("@")[0].replace(".", " ").title())
            recipient = _safe(str(email.get("to", "")).split("@")[0].replace(".", " ").title())
            date_str = str(email.get("date", ""))[:10]

            # Email header
            email_elements.append(Paragraph(
                f'<b>Email #{i}:</b> &ldquo;{subj}&rdquo;',
                styles["EmailSubj"],
            ))
            email_elements.append(Paragraph(
                f"<b>From:</b> {sender} &rarr; <b>To:</b> {recipient} &nbsp;|&nbsp; <b>Date:</b> {date_str}",
                styles["BodySmall"],
            ))
            email_elements.append(Spacer(1, 4))

            # Why flagged — with specific keywords
            keywords = email.get("keywords", {})
            if keywords:
                email_elements.append(Paragraph("<b>Why this email was flagged:</b>", styles["SubHead2"]))
                for category, terms in keywords.items():
                    if terms:
                        cat_label = category.replace("_", " ").title()
                        terms_str = ", ".join(f'<font color="#dc2626"><b>{_safe(t)}</b></font>' for t in terms)
                        email_elements.append(Paragraph(
                            f"&bull; <b>{cat_label}</b> keywords found: {terms_str}",
                            styles["BodySmall"],
                        ))
            else:
                email_elements.append(Paragraph(
                    "<b>Why flagged:</b> Flagged by sentiment analysis (unusual tone or pattern)",
                    styles["BodySmall"],
                ))

            # Risk indicator (replaces raw sentiment score)
            vader = email.get("vader_compound")
            has_keywords = bool(keywords)
            has_negative_tone = vader is not None and vader < -0.3

            if has_keywords and has_negative_tone:
                risk_text = '<font color="#dc2626"><b>HIGH RISK</b></font> &mdash; Threat keywords detected with negative tone'
            elif has_keywords:
                risk_categories = ", ".join(cat.replace("_", " ").title() for cat in keywords.keys())
                risk_text = f'<font color="#dc2626"><b>FLAGGED</b></font> &mdash; {risk_categories} keywords detected'
            elif has_negative_tone:
                risk_text = f'<font color="#b45309"><b>WATCH</b></font> &mdash; Unusually negative tone (may indicate stress or urgency)'
            else:
                risk_text = '<b>FLAGGED</b> &mdash; Flagged by behavioral pattern analysis'

            email_elements.append(Paragraph(
                f"&bull; <b>Risk Assessment:</b> {risk_text}",
                styles["BodySmall"],
            ))

            email_elements.append(Spacer(1, 4))

            # Body snippet with highlighted keywords
            snippet = email.get("body_snippet", "")[:300]
            if snippet:
                email_elements.append(Paragraph("<b>Relevant excerpt from the email:</b>", styles["SubHead2"]))
                highlighted = _highlight_keywords_in_text(snippet)
                if len(email.get("body_snippet", "")) > 300:
                    highlighted += "..."
                email_elements.append(_quote_box(
                    f'&ldquo;{highlighted}&rdquo;',
                    styles,
                ))

            email_elements.append(Spacer(1, 8))
            story.append(KeepTogether(email_elements))
    else:
        story.append(Paragraph(
            "No individual email records were captured in the forensic trace. "
            "This may occur when the forensic wrapper captured tool outputs "
            "at a summary level rather than individual email level. "
            "See the agent findings below for the analysis details.",
            styles["Body"],
        ))

    # ── 3. PEOPLE OF INTEREST ─────────────────────────────────────────────────
    story += _heading("3. People of Interest", styles)

    if evidence["edges"]:
        story.append(Paragraph(
            "The following communication pairs showed unusual patterns. "
            "A high anomaly score means the email volume between two people "
            "was significantly above their normal baseline.",
            styles["Body"],
        ))
        story.append(Spacer(1, 6))

        edge_data = [["Person A", "Person B", "Emails", "Anomaly Score", "Assessment"]]
        for e in evidence["edges"][:10]:
            src = str(e.get("source", "")).split("@")[0].replace(".", " ").title()
            tgt = str(e.get("target", "")).split("@")[0].replace(".", " ").title()
            vol = str(e.get("volume", e.get("total_volume", "?")))
            score = e.get("anomaly_score", 0)
            score_str = f"{score:.2f}" if isinstance(score, (int, float)) else str(score)
            # Human-readable assessment
            if isinstance(score, (int, float)):
                if score > 3.5:
                    assessment = "Very suspicious"
                elif score > 2:
                    assessment = "Above normal"
                else:
                    assessment = "Normal range"
            else:
                assessment = "—"
            edge_data.append([src, tgt, vol, score_str, assessment])

        if len(edge_data) > 1:
            e_tbl = Table(edge_data, colWidths=[100, 100, 50, 70, 90])
            e_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
                ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",      (0, 0), (-1, -1), 8),
                ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING",    (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
                ("ALIGN",         (2, 0), (3, -1), "CENTER"),
            ]))
            story.append(e_tbl)
    elif evidence["people"]:
        story.append(_subheading("Identified Individuals", styles))
        people_str = ", ".join(
            f"<b>{_safe(p.split('@')[0].replace('.', ' ').title())}</b>"
            for p in evidence["people"]
        )
        story.append(Paragraph(people_str, styles["Body"]))
    else:
        story.append(Paragraph(
            "People details are included in each agent's findings below.",
            styles["Body"],
        ))

    # ── 4. AGENT FINDINGS ─────────────────────────────────────────────────────
    story += _heading("4. What Each AI Agent Found", styles)
    story.append(Paragraph(
        "Multiple AI agents analyzed the data independently. "
        "Each agent's findings are organized below with key observations highlighted.",
        styles["Muted"],
    ))
    story.append(Spacer(1, 6))

    # Group agent_end records by agent
    agents_seen = {}
    for rec in records:
        if rec.get("event_type") == "agent_end" and rec.get("reasoning_summary"):
            aid = rec.get("agent_id", "unknown")
            if aid not in agents_seen:
                agents_seen[aid] = rec

    if not agents_seen:
        story.append(Paragraph("No agent reasoning records found in the forensic trace.", styles["Muted"]))
    else:
        for idx, (agent_id, rec) in enumerate(agents_seen.items(), 1):
            agent_label = AGENT_NAMES.get(agent_id, agent_id.replace("_", " ").title())
            conf = rec.get("confidence_score")
            conf_str = f" &mdash; Confidence: <b>{conf * 100:.1f}%</b>" if conf is not None else ""
            ts = (rec.get("timestamp") or "")[:19]

            story.append(Paragraph(f"{idx}. {agent_label}{conf_str}", styles["AgentTag"]))
            if ts:
                story.append(Paragraph(f"Analyzed at: {ts}", styles["Muted"]))
            story.append(Spacer(1, 4))

            reasoning = rec.get("reasoning_summary", "")
            sections = _parse_reasoning_into_sections(reasoning)

            if sections:
                for section in sections:
                    if section["heading"]:
                        story.append(_subheading(section["heading"], styles))
                    # Highlight suspicious keywords in the text
                    highlighted_content = _highlight_keywords_in_text(section["content"])
                    story.append(Paragraph(highlighted_content, styles["Body"]))
            else:
                highlighted = _highlight_keywords_in_text(reasoning)
                story.append(Paragraph(highlighted, styles["Body"]))

            # Show proposed action if present
            action = rec.get("proposed_action")
            if action:
                story.append(Spacer(1, 4))
                story.append(Paragraph(
                    f'<b>Recommended action:</b> <font color="#dc2626">{_safe(action)}</font>',
                    styles["Body"],
                ))

            story.append(Spacer(1, 10))

    # ── 5. INTER-AGENT DELIBERATION ──────────────────────────────────────────
    story += _heading("5. Did the Agents Disagree?", styles)

    if not delib_records:
        story.append(Paragraph(
            "No. The agents' confidence scores were close enough "
            "(within 0.3 of each other) that no deliberation was needed. "
            "They essentially agreed on the assessment.",
            styles["Body"],
        ))
    else:
        story.append(Paragraph(
            f"<b>Yes.</b> The agents disagreed significantly on <b>{len(delib_records)}</b> occasion(s), "
            "triggering a Deliberation step where each agent explained its reasoning "
            "and a joint conclusion was reached.",
            styles["Body"],
        ))
        story.append(Spacer(1, 6))

        for j, dr in enumerate(delib_records, 1):
            conf = dr.get("confidence_score")
            conf_str = f"{conf * 100:.1f}%" if conf is not None else "N/A"
            ts = (dr.get("timestamp") or "")[:19]

            meta_rows = []
            try:
                tin  = json.loads(dr.get("tool_input")  or "{}")
                tout = json.loads(dr.get("tool_output") or "{}")
                inv_c = tin.get("investigator_confidence")
                sen_c = tin.get("sentiment_confidence")
                div   = tin.get("divergence")
                resolution = str(tout.get("resolution_method", "—"))
                meta_rows = [
                    ("Network Agent said",     f"{inv_c * 100:.1f}% confident" if inv_c else "—"),
                    ("Language Agent said",     f"{sen_c * 100:.1f}% confident" if sen_c else "—"),
                    ("Gap between them",       f"{div:.2f}" if div else "—"),
                    ("How it was resolved",    resolution.replace("_", " ").title()),
                    ("Final agreed confidence", conf_str),
                ]
            except Exception:
                meta_rows = [("Agreed confidence", conf_str)]

            story.append(Paragraph(f"Deliberation {j} — {ts}", styles["DelibTag"]))
            story.append(Spacer(1, 4))
            story.append(_kv_table(meta_rows, col_widths=(170, 200)))
            story.append(Spacer(1, 6))

            delib_reasoning = dr.get("reasoning_summary", "")
            if delib_reasoning:
                story.append(_subheading("Joint Assessment", styles))
                highlighted = _highlight_keywords_in_text(delib_reasoning)
                story.append(Paragraph(highlighted, styles["Body"]))
            story.append(Spacer(1, 10))

    # ── 6. EVIDENCE INTEGRITY ─────────────────────────────────────────────────
    story += _heading("6. Evidence Integrity", styles)

    verification = verify_chain(records)
    chain_ok = verification["chain_valid"]
    label = "INTACT — no records have been altered" if chain_ok else "BROKEN — possible tampering detected"

    story.append(_subheading("What is the Hash Chain?", styles))
    story.append(Paragraph(
        "Every action taken by the AI agents during this investigation was recorded "
        "and cryptographically linked to the previous record using SHA-256 hashing. "
        "This creates a tamper-evident chain: if anyone modifies, deletes, or reorders "
        "any record after the fact, the chain breaks and the system detects it.",
        styles["Body"],
    ))
    story.append(Spacer(1, 6))

    story.append(_subheading("Verification Result", styles))
    sc = "green" if chain_ok else "red"
    story.append(Paragraph(
        f'<font color="{sc}"><b>{label}</b></font>',
        styles["Body"],
    ))
    story.append(Paragraph(
        f"Total records in chain: <b>{len(records)}</b> &nbsp;|&nbsp; "
        f"Hash algorithm: <b>SHA-256</b> &nbsp;|&nbsp; "
        f"Verified at: <b>{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}</b>",
        styles["Muted"],
    ))

    if not chain_ok and "broken_links" in verification:
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            f"<font color='red'><b>Warning:</b> {len(verification['broken_links'])} broken link(s) "
            f"detected in the hash chain. This may indicate evidence tampering.</font>",
            styles["Body"],
        ))

    # ── 7. COMPLIANCE ─────────────────────────────────────────────────────────
    story += _heading("7. Regulatory Compliance", styles)

    story.append(Paragraph(
        "This report maps the system's capabilities to specific AI governance requirements. "
        "Each row shows how a regulatory requirement is addressed by the system.",
        styles["Body"],
    ))
    story.append(Spacer(1, 6))

    c_data = [
        ["Requirement", "Framework", "How This Report Satisfies It"],
        ["AI decisions must be\nexplainable", "NIST AI RMF\n(Measure 2.8)",
         "Full agent reasoning shown in Section 4\nwith highlighted decision factors"],
        ["Humans must be able to\noverride AI decisions", "NIST AI RMF\n(Map 1.6)",
         "Analyst review queue with logged\noverrides captured as forensic records"],
        ["AI decisions must have\nan audit trail", "NIST AI RMF\n(Govern 1.2)",
         "SHA-256 hash chain verified in\nSection 6 — tamper-evident by design"],
        ["AI systems must have\nrisk management", "EU AI Act\n(Article 9)",
         "Confidence thresholds prevent\nautonomous action; deliberation resolves\nagent disagreements"],
        ["AI reasoning must be\ndisclosed", "EU AI Act\n(Article 13)",
         "This PDF contains verbatim agent\nreasoning with source email evidence"],
        ["Human oversight must\nbe built in", "EU AI Act\n(Article 14)",
         "Alerts require human confirmation;\noverrrides are logged and auditable"],
    ]
    c_tbl = Table(c_data, colWidths=[130, 80, 230])
    c_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
    ]))
    story.append(c_tbl)

    # ── Footer ───────────────────────────────────────────────────────────────
    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MUTED, spaceAfter=8))
    story.append(Paragraph(
        "Enron Insider Threat Analysis System &mdash; "
        "CMU AI Governance Project (Raghav Trivedi, Rin, Nicole)",
        styles["Muted"],
    ))
    story.append(Paragraph(
        f"Report generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')} &nbsp;|&nbsp; "
        f"Trace ID: {_safe(trace_id[:16])}...",
        styles["Muted"],
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer
