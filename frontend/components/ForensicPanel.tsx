"use client";
import { useState } from "react";
import { TraceTree } from "./TraceTree";
import { ConfidenceGauge } from "./ConfidenceGauge";
import { CounterfactualToggle } from "./CounterfactualToggle";
import { TamperSimulation } from "./TamperSimulation";
import { AnalystOverride } from "./AnalystOverride";
import { AuditReportExport } from "./AuditReportExport";
import type {
  ForensicRecord,
  ChainVerification,
  CounterfactualResult,
  TamperSimResult,
} from "@/lib/types";
import {
  Shield,
  CheckCircle,
  XCircle,
  Fingerprint,
  FlaskConical,
  UserCheck,
  GitBranch,
} from "lucide-react";

type SubView = "trace" | "counterfactual" | "tamper" | "override";

interface ForensicPanelProps {
  records: ForensicRecord[];
  verification: ChainVerification | null;
  counterfactual: CounterfactualResult | null;
  tamperSim: TamperSimResult | null;
  loading: boolean;
  traceId: string | null;
  onVerify: () => void;
  onCounterfactual: () => void;
  onTamperSim: () => void;
  onExport: () => void;
}

export function ForensicPanel({
  records, verification, counterfactual, tamperSim,
  loading, traceId, onVerify, onCounterfactual, onTamperSim, onExport,
}: ForensicPanelProps) {
  const [subView, setSubView] = useState<SubView>("trace");

  if (loading) {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {[180, 320, 240, 80, 320, 280].map((w, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: i === 3 ? 80 : 16, width: w, maxWidth: "100%" }}
          />
        ))}
      </div>
    );
  }

  if (!records.length) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 256, color: "var(--text-muted)",
      }}>
        <div style={{ textAlign: "center" }}>
          <Fingerprint style={{ width: 40, height: 40, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 13 }}>No forensic records loaded</p>
        </div>
      </div>
    );
  }

  const escalationRecord = records.find((r) => r.event_type === "escalation_alert");
  const confidence = escalationRecord?.confidence_score ?? 0;

  const tabs: { key: SubView; icon: typeof GitBranch; label: string }[] = [
    { key: "trace", icon: GitBranch, label: "Trace" },
    { key: "counterfactual", icon: FlaskConical, label: "What-If" },
    { key: "tamper", icon: Shield, label: "Tamper" },
    { key: "override", icon: UserCheck, label: "Review" },
  ];

  const getVerifyStyle = () => {
    if (!verification) return {
      bg: "var(--bg-card)", color: "var(--text-secondary)", border: "var(--border)",
    };
    return verification.chain_valid
      ? { bg: "rgba(34,197,94,0.15)", color: "var(--accent-green)", border: "rgba(34,197,94,0.5)" }
      : { bg: "rgba(239,68,68,0.15)", color: "var(--accent-red)", border: "rgba(239,68,68,0.5)" };
  };

  const vs = getVerifyStyle();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
            <Shield style={{ width: 16, height: 16, color: "var(--accent-blue)" }} />
            Forensic Trace
          </h2>
          <span style={{
            fontSize: 11, fontFamily: "monospace", padding: "2px 8px", borderRadius: 4,
            background: "var(--bg-card)", color: "var(--text-muted)",
          }}>
            {traceId?.slice(0, 8)}...
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ConfidenceGauge value={confidence} size={56} />
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Records</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>{records.length}</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={onVerify}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 11, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
                background: vs.bg, color: vs.color,
                border: `1px solid ${vs.border}`, transition: "all 0.15s",
              }}
            >
              {verification ? (
                verification.chain_valid
                  ? <><CheckCircle style={{ width: 12, height: 12 }} /> Chain Intact</>
                  : <><XCircle style={{ width: 12, height: 12 }} /> Chain Broken</>
              ) : (
                <><Fingerprint style={{ width: 12, height: 12 }} /> Verify</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => {
              setSubView(key);
              if (key === "counterfactual") onCounterfactual();
            }}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "10px 0", fontSize: 11, fontWeight: 500, cursor: "pointer",
              color: subView === key ? "var(--accent-cyan)" : "var(--text-muted)",
              background: "transparent", border: "none",
              borderBottom: subView === key ? "2px solid var(--accent-cyan)" : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            <Icon style={{ width: 13, height: 13 }} />
            {label}
          </button>
        ))}
      </div>

      {/* Sub-view content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {subView === "trace" && <TraceTree records={records} verification={verification} />}
        {subView === "counterfactual" && <CounterfactualToggle data={counterfactual} />}
        {subView === "tamper" && <TamperSimulation data={tamperSim} onSimulate={onTamperSim} />}
        {subView === "override" && traceId && <AnalystOverride traceId={traceId} />}
      </div>

      <AuditReportExport onExport={onExport} />
    </div>
  );
}
