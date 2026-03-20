"use client";
import { ConfidenceGauge } from "./ConfidenceGauge";
import type { ForensicRecord } from "@/lib/types";
import { AlertTriangle, Shield, FileText } from "lucide-react";

interface ExecutiveSummaryProps {
  records: ForensicRecord[];
  traceId: string | null;
  confidence: number;
  threatCategory: string;
  people: string[];
  onExport: () => void;
}

export function ExecutiveSummary({
  records, traceId, confidence, threatCategory, people, onExport,
}: ExecutiveSummaryProps) {
  const severity = confidence >= 0.7 ? "HIGH" : confidence >= 0.4 ? "MODERATE" : "LOW";
  const sevColor = severity === "HIGH" ? "var(--accent-red)" : severity === "MODERATE" ? "var(--accent-amber, #f59e0b)" : "var(--accent-green)";
  const threatLabel = threatCategory.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  const action = confidence >= 0.7
    ? "Immediate review recommended. Escalate to compliance team."
    : confidence >= 0.4
      ? "Further investigation warranted. Monitor communications."
      : "Low risk. Continue standard monitoring.";

  // Count key metrics
  const agentCount = new Set(records.filter(r => r.agent_id).map(r => r.agent_id)).size;
  const hasDeliberation = records.some(r => r.event_type === "inter_agent_deliberation");
  const hasHumanReview = records.some(r => r.event_type === "human_override");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: 20, borderBottom: "1px solid var(--border)", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
          <Shield style={{ width: 18, height: 18, color: "var(--accent-blue)" }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
            Threat Assessment Summary
          </h2>
        </div>

        <ConfidenceGauge value={confidence} size={90} />

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12,
          padding: "6px 16px", borderRadius: 8,
          background: `${sevColor}15`, border: `1px solid ${sevColor}40`,
        }}>
          <AlertTriangle style={{ width: 14, height: 14, color: sevColor }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: sevColor }}>
            {severity} RISK — {threatLabel}
          </span>
        </div>
      </div>

      {/* Key findings */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 12, letterSpacing: "0.04em" }}>
          Key Findings
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FindingCard
            label="People of Interest"
            value={people.length > 0 ? people.slice(0, 4).join(", ") + (people.length > 4 ? ` +${people.length - 4} more` : "") : "None identified"}
          />
          <FindingCard
            label="AI Analysis"
            value={`${agentCount} AI agents analyzed the data${hasDeliberation ? " (agents disagreed and resolved via deliberation)" : " (agents reached consensus)"}`}
          />
          <FindingCard
            label="Human Oversight"
            value={hasHumanReview ? "Analyst has reviewed and submitted a decision" : "Awaiting analyst review"}
          />
        </div>

        <div style={{
          marginTop: 20, padding: 14, borderRadius: 8,
          background: `${sevColor}08`, border: `1px solid ${sevColor}25`,
        }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: sevColor, marginBottom: 6 }}>
            Recommended Action
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>
            {action}
          </p>
        </div>

        {/* Metadata */}
        <div style={{ marginTop: 20, fontSize: 10, color: "var(--text-muted)" }}>
          <div>Trace: {traceId?.slice(0, 12)}...</div>
          <div>Records: {records.length}</div>
          <div>Generated: {new Date().toLocaleString()}</div>
        </div>
      </div>

      {/* Export */}
      <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onExport}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "10px 0", borderRadius: 8,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "var(--accent-blue)", color: "white",
            border: "none", transition: "all 0.15s",
          }}
        >
          <FileText style={{ width: 14, height: 14 }} />
          Export Full Audit Report (PDF)
        </button>
      </div>
    </div>
  );
}

function FindingCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 8,
      background: "var(--bg-card)", border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>
        {value}
      </p>
    </div>
  );
}
