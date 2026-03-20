"use client";
import { useMemo } from "react";
import { COMPLIANCE_ROWS } from "@/lib/constants";
import type { ForensicRecord, ChainVerification } from "@/lib/types";
import { CheckCircle, AlertTriangle, Clock, ExternalLink, FileText, ArrowRight } from "lucide-react";

interface ComplianceScorecardProps {
  records?: ForensicRecord[];
  verification?: ChainVerification | null;
  traceId?: string | null;
  onViewTrace?: (traceId: string) => void;
}

const STATUS_CONFIG = {
  demonstrated: { icon: CheckCircle, color: "var(--accent-green, #22c55e)", label: "Demonstrated" },
  partial: { icon: AlertTriangle, color: "var(--accent-amber, #f59e0b)", label: "Partial" },
  pending: { icon: Clock, color: "var(--text-muted, #7d8590)", label: "Pending" },
};

export function ComplianceScorecard({ records, verification, traceId, onViewTrace }: ComplianceScorecardProps) {
  const evaluatedRows = useMemo(() => {
    return COMPLIANCE_ROWS.map((row) => {
      if (!records || records.length === 0) {
        return { ...row, status: row.defaultStatus, evidenceCount: 0, evidenceTraceId: null as string | null };
      }

      // Check if any forensic records match the evidence event types
      const matchingRecords = records.filter((r) =>
        row.evidenceEventTypes.includes(r.event_type)
      );

      let status: "demonstrated" | "partial" | "pending" = row.defaultStatus;
      if (matchingRecords.length > 0) {
        status = "demonstrated";
      }

      // Special cases
      if (row.requirement.includes("Govern 1.2") && verification) {
        status = verification.chain_valid ? "demonstrated" : "partial";
      }
      if (row.requirement.includes("Map 1.6")) {
        const hasHumanReview = records.some((r) => r.event_type === "human_override");
        const hasEscalation = records.some((r) => r.event_type === "escalation_alert");
        status = hasHumanReview ? "demonstrated" : hasEscalation ? "partial" : "pending";
      }

      return {
        ...row,
        status,
        evidenceCount: matchingRecords.length,
        evidenceTraceId: traceId || null,
      };
    });
  }, [records, verification, traceId]);

  const demonstrated = evaluatedRows.filter((r) => r.status === "demonstrated").length;
  const partial = evaluatedRows.filter((r) => r.status === "partial").length;
  const total = evaluatedRows.length;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Title */}
      <div>
        <h2 style={{
          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
          color: "var(--text-primary)", marginBottom: 4,
        }}>
          <FileText style={{ width: 16, height: 16, color: "var(--accent-cyan)" }} />
          Governance Compliance Scorecard
        </h2>
        <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {records && records.length > 0
            ? "Live mapping verified against forensic trace evidence"
            : "Run analysis to verify compliance requirements"}
        </p>
      </div>

      {/* Summary boxes */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{
          flex: 1, padding: 12, borderRadius: 8, textAlign: "center",
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)",
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent-green)" }}>
            {demonstrated}/{total}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Verified</div>
        </div>
        {partial > 0 && (
          <div style={{
            flex: 1, padding: 12, borderRadius: 8, textAlign: "center",
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent-amber, #f59e0b)" }}>
              {partial}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Partial</div>
          </div>
        )}
        <div style={{
          flex: 1, padding: 12, borderRadius: 8, textAlign: "center",
          background: "var(--bg-card)",
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent-cyan)" }}>2</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Frameworks</div>
        </div>
      </div>

      {/* Compliance rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {evaluatedRows.map((row, idx) => {
          const config = STATUS_CONFIG[row.status];
          const StatusIcon = config.icon;
          return (
            <div key={idx} style={{
              padding: 12, borderRadius: 8, background: "var(--bg-card)",
              border: "1px solid var(--border)", transition: "background 0.15s",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                    {row.requirement}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {row.framework}
                  </div>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 100,
                  background: `${config.color}15`, color: config.color,
                  flexShrink: 0,
                }}>
                  <StatusIcon style={{ width: 12, height: 12 }} />
                  <span style={{ fontSize: 11 }}>{config.label}</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: row.evidenceCount > 0 ? 6 : 0 }}>
                System Feature:{" "}
                <span style={{ color: "var(--accent-cyan)" }}>{row.feature}</span>
              </div>

              {/* Evidence link */}
              {row.evidenceCount > 0 && row.evidenceTraceId && (
                <button
                  onClick={() => onViewTrace?.(row.evidenceTraceId!)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 10, color: "var(--accent-blue, #3b82f6)",
                    background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
                    padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  <ArrowRight style={{ width: 10, height: 10 }} />
                  {row.evidenceCount} evidence records in trace {row.evidenceTraceId.slice(0, 8)}...
                </button>
              )}
              {row.status === "pending" && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
                  Run analysis to verify this requirement
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reference links */}
      <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Reference Documents
        </h3>
        {[
          { label: "NIST AI Risk Management Framework", url: "https://www.nist.gov/artificial-intelligence/ai-risk-management-framework" },
          { label: "EU Artificial Intelligence Act", url: "https://artificialintelligenceact.eu/" },
        ].map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 11, color: "var(--text-secondary)", textDecoration: "none",
              padding: "4px 0", transition: "color 0.15s",
            }}
          >
            <ExternalLink style={{ width: 12, height: 12 }} />
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
