"use client";
import { useState, useMemo } from "react";
import type { ForensicRecord, ChainVerification } from "@/lib/types";
import { AGENT_LABELS } from "@/lib/constants";
import { getPendingReviews, submitReview } from "@/lib/api";
import {
  CheckCircle, XCircle, Shield, Clock, Send,
  ChevronDown, ChevronRight, Lock, UserCheck,
} from "lucide-react";

const EVENT_LABELS: Record<string, string> = {
  agent_start: "Agent Started",
  agent_end: "Agent Completed",
  tool_call: "Tool Executed",
  inter_agent_deliberation: "Deliberation",
  escalation_alert: "Alert Generated",
  human_override: "Analyst Decision",
};

interface AuditTrailProps {
  records: ForensicRecord[];
  verification: ChainVerification | null;
  traceId: string | null;
  onVerify: () => void;
  onReviewSubmitted?: () => void;
}

export function AuditTrail({ records, verification, traceId, onVerify, onReviewSubmitted }: AuditTrailProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"confirm" | "dismiss" | "escalate" | null>(null);
  const [rationale, setRationale] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Show key records by default, all on toggle
  const displayRecords = useMemo(() => {
    if (showAllRecords) return records;
    return records.filter(
      (r) => r.event_type !== "agent_start"
    );
  }, [records, showAllRecords]);

  // Build verification lookup
  const verificationMap = useMemo(() => {
    if (!verification) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    for (const rec of verification.records) {
      map.set(rec.span_id, rec.valid);
    }
    return map;
  }, [verification]);

  const chainIsIntact = verification?.chain_valid ?? null;

  // Find escalation alert for review
  const escalationAlert = records.find(
    (r) => r.event_type === "escalation_alert" || (r.event_type === "agent_end" && r.agent_id === "escalation")
  );
  const hasHumanOverride = records.some((r) => r.event_type === "human_override");

  const handleSubmitReview = async () => {
    if (!traceId || !escalationAlert || !reviewDecision || !rationale.trim()) return;
    setSubmitting(true);
    try {
      await submitReview(escalationAlert.span_id, {
        analyst_id: "demo_analyst",
        decision: reviewDecision,
        rationale: rationale.trim(),
      });
      setReviewSubmitted(true);
      onReviewSubmitted?.();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  if (records.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-muted)" }}>
        <div style={{ textAlign: "center" }}>
          <Lock style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 12 }}>No audit records yet</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Chain integrity banner */}
      <div
        onClick={onVerify}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: 10, borderRadius: 8, cursor: "pointer",
          background: chainIsIntact === null
            ? "var(--bg-card)"
            : chainIsIntact
              ? "rgba(34,197,94,0.06)"
              : "rgba(239,68,68,0.06)",
          border: `1px solid ${
            chainIsIntact === null ? "var(--border)"
              : chainIsIntact ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"
          }`,
          transition: "all 0.15s",
        }}
      >
        <Lock style={{
          width: 16, height: 16,
          color: chainIsIntact === null ? "var(--text-muted)" : chainIsIntact ? "var(--accent-green)" : "var(--accent-red)",
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
            SHA-256 Hash Chain
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {chainIsIntact === null
              ? "Click to verify evidence integrity"
              : chainIsIntact
                ? `All ${records.length} records verified \u2014 no tampering detected`
                : "Chain integrity compromised \u2014 possible tampering"}
          </div>
        </div>
        {chainIsIntact !== null && (
          chainIsIntact
            ? <CheckCircle style={{ width: 16, height: 16, color: "var(--accent-green)" }} />
            : <XCircle style={{ width: 16, height: 16, color: "var(--accent-red)" }} />
        )}
      </div>

      {/* Record count + toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {displayRecords.length} of {records.length} records
        </span>
        <button
          onClick={() => setShowAllRecords(!showAllRecords)}
          style={{
            fontSize: 10, color: "var(--accent-blue)", background: "transparent",
            border: "none", cursor: "pointer", padding: "2px 4px",
          }}
        >
          {showAllRecords ? "Hide noise events" : "Show all records"}
        </button>
      </div>

      {/* Decision log */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {displayRecords.map((rec) => {
          const isExpanded = expandedId === rec.id;
          const isValid = verificationMap.get(rec.span_id);
          const agentLabel = rec.agent_id?.startsWith("human:")
            ? "Analyst"
            : AGENT_LABELS[rec.agent_id] || rec.agent_id;
          const eventLabel = EVENT_LABELS[rec.event_type] || rec.event_type;

          return (
            <div key={rec.id}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "6px 8px", borderRadius: 4, cursor: "pointer",
                  background: isExpanded ? "var(--bg-card)" : "transparent",
                  border: "none", color: "var(--text-primary)", textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
              >
                {/* Verification status */}
                {verification !== null && (
                  <span style={{ flexShrink: 0 }}>
                    {isValid === true
                      ? <CheckCircle style={{ width: 11, height: 11, color: "var(--accent-green)" }} />
                      : isValid === false
                        ? <XCircle style={{ width: 11, height: 11, color: "var(--accent-red)" }} />
                        : <div style={{ width: 11, height: 11 }} />
                    }
                  </span>
                )}

                {/* Timestamp */}
                <span style={{ fontSize: 9, color: "var(--text-muted)", width: 60, flexShrink: 0, fontFamily: "monospace" }}>
                  {new Date(rec.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>

                {/* Agent */}
                <span style={{ fontSize: 10, fontWeight: 500, width: 80, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {agentLabel}
                </span>

                {/* Event type */}
                <span style={{ fontSize: 10, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {eventLabel}
                  {rec.tool_name && <span style={{ color: "var(--text-muted)" }}> ({rec.tool_name})</span>}
                </span>

                {/* Expand arrow */}
                {isExpanded
                  ? <ChevronDown style={{ width: 11, height: 11, color: "var(--text-muted)", flexShrink: 0 }} />
                  : <ChevronRight style={{ width: 11, height: 11, color: "var(--text-muted)", flexShrink: 0 }} />
                }
              </button>

              {isExpanded && (
                <div style={{
                  padding: "8px 12px", marginLeft: 20, marginBottom: 4, borderRadius: 6,
                  background: "var(--bg-secondary)", border: "1px solid var(--border)",
                  fontSize: 10,
                }}>
                  {rec.reasoning_summary && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>Reasoning</div>
                      <p style={{ color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, maxHeight: 120, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                        {rec.reasoning_summary.slice(0, 500)}
                        {rec.reasoning_summary.length > 500 && "..."}
                      </p>
                    </div>
                  )}
                  {rec.confidence_score !== null && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>Confidence: </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {(rec.confidence_score * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <div style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 9 }}>
                    hash: {rec.record_hash?.slice(0, 16)}...
                    {rec.tool_call_hash && <> | tool: {rec.tool_call_hash.slice(0, 16)}...</>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Analyst Review Section */}
      {escalationAlert && !hasHumanOverride && !reviewSubmitted && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 8,
          background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <UserCheck style={{ width: 14, height: 14, color: "var(--accent-blue)" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              Human-in-the-Loop Review
            </span>
          </div>
          <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
            Review the findings above and provide your assessment. Your decision is logged as a forensic record.
          </p>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {(["confirm", "dismiss", "escalate"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setReviewDecision(d)}
                style={{
                  flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 10, fontWeight: 600,
                  cursor: "pointer", textTransform: "capitalize", transition: "all 0.15s",
                  background: reviewDecision === d
                    ? d === "confirm" ? "rgba(34,197,94,0.15)" : d === "escalate" ? "rgba(239,68,68,0.15)" : "rgba(107,114,128,0.15)"
                    : "var(--bg-card)",
                  color: reviewDecision === d
                    ? d === "confirm" ? "var(--accent-green)" : d === "escalate" ? "var(--accent-red)" : "var(--text-secondary)"
                    : "var(--text-muted)",
                  border: `1px solid ${
                    reviewDecision === d
                      ? d === "confirm" ? "rgba(34,197,94,0.4)" : d === "escalate" ? "rgba(239,68,68,0.4)" : "rgba(107,114,128,0.3)"
                      : "var(--border)"
                  }`,
                }}
              >
                {d}
              </button>
            ))}
          </div>

          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Provide your rationale for this decision..."
            rows={3}
            style={{
              width: "100%", padding: 8, borderRadius: 6, fontSize: 11,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              color: "var(--text-primary)", resize: "vertical", outline: "none",
              fontFamily: "inherit",
            }}
          />

          <button
            onClick={handleSubmitReview}
            disabled={!reviewDecision || !rationale.trim() || submitting}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              width: "100%", padding: "8px 0", borderRadius: 6, marginTop: 8,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              background: reviewDecision && rationale.trim() ? "var(--accent-blue)" : "var(--bg-card)",
              color: reviewDecision && rationale.trim() ? "white" : "var(--text-muted)",
              border: "1px solid var(--border)", transition: "all 0.15s",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            <Send style={{ width: 12, height: 12 }} />
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </div>
      )}

      {/* Review submitted confirmation */}
      {(reviewSubmitted || hasHumanOverride) && (
        <div style={{
          padding: 10, borderRadius: 8,
          background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <CheckCircle style={{ width: 16, height: 16, color: "var(--accent-green)" }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-green)" }}>
              Analyst review recorded
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Decision logged as a forensic record in the hash chain
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
