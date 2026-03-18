"use client";
import { useState, useEffect } from "react";
import { getPendingReviews, submitReview } from "@/lib/api";
import type { PendingReview } from "@/lib/types";
import { UserCheck, CheckCircle, XCircle, ArrowUpCircle, Loader2 } from "lucide-react";

interface AnalystOverrideProps {
  traceId: string;
}

export function AnalystOverride({ traceId }: AnalystOverrideProps) {
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    getPendingReviews().then(setPending).catch(() => setPending([]));
  }, []);

  const handleSubmit = async (alertId: string, decision: string) => {
    if (!rationale.trim()) return;
    setSubmitting(true);
    try {
      await submitReview(alertId, { analyst_id: "analyst_demo", decision, rationale });
      setSubmitted(decision);
      setPending((prev) => prev.filter((p) => p.span_id !== alertId));
      setRationale("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const relatedAlert = pending.find((p) => p.trace_id === traceId);

  const btnBase: React.CSSProperties = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "8px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
    cursor: "pointer", transition: "all 0.15s",
    opacity: rationale.trim() ? 1 : 0.4,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 className="section-label">Human-in-the-Loop Review</h3>
        <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          Review alerts and provide analyst decisions (logged as forensic records)
        </p>
      </div>

      {submitted && (
        <div style={{
          padding: 12, borderRadius: 8, display: "flex", alignItems: "center", gap: 8,
          background: "rgba(34,197,94,0.1)", border: "1px solid var(--accent-green)",
        }}>
          <CheckCircle style={{ width: 16, height: 16, color: "var(--accent-green)" }} />
          <span style={{ fontSize: 13, color: "var(--accent-green)" }}>
            Decision recorded: <strong>{submitted}</strong>
          </span>
        </div>
      )}

      {relatedAlert ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Alert Detail */}
          <div style={{ padding: 12, borderRadius: 8, background: "var(--bg-card)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Pending Alert</span>
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 100,
                background: "rgba(239,68,68,0.15)", color: "var(--accent-red)",
              }}>
                {((relatedAlert.confidence_score || 0) * 100).toFixed(0)}% confidence
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {relatedAlert.reasoning_summary}
            </p>
          </div>

          {/* Rationale Input */}
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Provide analyst rationale (required)..."
            rows={3}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 12,
              resize: "none", fontFamily: "inherit",
              background: "var(--bg-card)", border: "1px solid var(--border)",
              color: "var(--text-primary)", outline: "none",
            }}
          />

          {/* Decision Buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleSubmit(relatedAlert.span_id, "confirm")}
              disabled={submitting || !rationale.trim()}
              style={{
                ...btnBase,
                background: "rgba(34,197,94,0.15)", color: "var(--accent-green)",
                border: "1px solid var(--accent-green)",
              }}
            >
              {submitting
                ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                : <CheckCircle style={{ width: 12, height: 12 }} />}
              Confirm
            </button>
            <button
              onClick={() => handleSubmit(relatedAlert.span_id, "dismiss")}
              disabled={submitting || !rationale.trim()}
              style={{
                ...btnBase,
                background: "rgba(100,116,139,0.15)", color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              <XCircle style={{ width: 12, height: 12 }} />
              Dismiss
            </button>
            <button
              onClick={() => handleSubmit(relatedAlert.span_id, "escalate")}
              disabled={submitting || !rationale.trim()}
              style={{
                ...btnBase,
                background: "rgba(239,68,68,0.15)", color: "var(--accent-red)",
                border: "1px solid var(--accent-red)",
              }}
            >
              <ArrowUpCircle style={{ width: 12, height: 12 }} />
              Escalate
            </button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)" }}>
          <UserCheck style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 13 }}>No pending alerts for this trace</p>
          {pending.length > 0 && (
            <p style={{ fontSize: 11, marginTop: 4 }}>
              {pending.length} alert{pending.length > 1 ? "s" : ""} pending in other traces
            </p>
          )}
        </div>
      )}
    </div>
  );
}
