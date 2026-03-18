"use client";
import { COMPLIANCE_ROWS } from "@/lib/constants";
import { CheckCircle, AlertTriangle, Clock, ExternalLink, FileText } from "lucide-react";

const STATUS_CONFIG = {
  demonstrated: { icon: CheckCircle, color: "var(--accent-green)", label: "Demonstrated" },
  partial: { icon: AlertTriangle, color: "var(--accent-amber)", label: "Partial" },
  pending: { icon: Clock, color: "var(--text-muted)", label: "Pending" },
};

export function ComplianceScorecard() {
  const demonstrated = COMPLIANCE_ROWS.filter((r) => r.status === "demonstrated").length;
  const total = COMPLIANCE_ROWS.length;

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
          Live mapping of system capabilities to NIST AI RMF &amp; EU AI Act requirements
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
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Requirements Met</div>
        </div>
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
        {COMPLIANCE_ROWS.map((row, idx) => {
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
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                System Feature:{" "}
                <span style={{ color: "var(--accent-cyan)" }}>{row.feature}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reference links */}
      <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 className="section-label">Reference Documents</h3>
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
