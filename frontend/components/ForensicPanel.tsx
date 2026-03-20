"use client";
import { useState, useEffect } from "react";
import { EmailEvidence } from "./EmailEvidence";
import { AgentTimeline } from "./AgentTimeline";
import { AuditTrail } from "./AuditTrail";
import { AgentPipeline } from "./AgentPipeline";
import { ConfidenceChart } from "./ConfidenceChart";
import { DeliberationView } from "./DeliberationView";
import { ConfidenceGauge } from "./ConfidenceGauge";
import { AuditReportExport } from "./AuditReportExport";
import { getSensitivity, getDrift } from "@/lib/api";
import type { ForensicRecord, ChainVerification } from "@/lib/types";
import {
  Shield, CheckCircle, XCircle, Fingerprint,
  Mail, Clock, Lock, Activity, Scale,
} from "lucide-react";

type SubView = "evidence" | "timeline" | "deliberation" | "audit" | "monitoring";

interface ForensicPanelProps {
  records: ForensicRecord[];
  verification: ChainVerification | null;
  loading: boolean;
  traceId: string | null;
  onVerify: () => void;
  onExport: () => void;
  onReviewSubmitted?: () => void;
  personFilter?: string | null;
  edgeFilter?: { source: string; target: string } | null;
  defaultTab?: SubView;
}

export function ForensicPanel({
  records, verification, loading, traceId,
  onVerify, onExport, onReviewSubmitted, personFilter, edgeFilter, defaultTab,
}: ForensicPanelProps) {
  const [subView, setSubView] = useState<SubView>(defaultTab || "evidence");

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
        height: "100%", color: "var(--text-muted)",
      }}>
        <div style={{ textAlign: "center" }}>
          <Shield style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.2 }} />
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>No Investigation Active</p>
          <p style={{ fontSize: 11, lineHeight: 1.5 }}>
            Run Threat Analysis to begin.<br />
            Forensic traces will appear here.
          </p>
        </div>
      </div>
    );
  }

  // Get confidence from escalation record
  const escalationRecord = records.find(
    (r) => r.event_type === "escalation_alert" || (r.event_type === "agent_end" && r.agent_id === "escalation")
  );
  const confidence = escalationRecord?.confidence_score ?? 0;

  // Check if deliberation was triggered
  const hasDeliberation = records.some((r) => r.event_type === "inter_agent_deliberation");

  const tabs: { key: SubView; icon: typeof Mail; label: string }[] = [
    { key: "evidence", icon: Mail, label: "Evidence" },
    { key: "timeline", icon: Clock, label: "Timeline" },
    { key: "deliberation", icon: Scale, label: hasDeliberation ? "Debate" : "Debate" },
    { key: "audit", icon: Lock, label: "Audit" },
    { key: "monitoring", icon: Activity, label: "Monitor" },
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
            Investigation
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
                  ? <><CheckCircle style={{ width: 12, height: 12 }} /> Verified</>
                  : <><XCircle style={{ width: 12, height: 12 }} /> Broken</>
              ) : (
                <><Fingerprint style={{ width: 12, height: 12 }} /> Verify</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Agent Pipeline Visualization */}
      <div style={{ padding: "0 12px", borderBottom: "1px solid var(--border)" }}>
        <AgentPipeline records={records} onSelectAgent={(id) => {
          if (id === "deliberation") setSubView("deliberation");
          else setSubView("timeline");
        }} />
        <ConfidenceChart records={records} onStageClick={(id) => {
          if (id === "deliberation") setSubView("deliberation");
          else setSubView("timeline");
        }} />
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setSubView(key)}
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

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {subView === "evidence" && (
          <EmailEvidence
            traceId={traceId}
            personFilter={personFilter}
            edgeFilter={edgeFilter}
          />
        )}
        {subView === "timeline" && (
          <AgentTimeline records={records} />
        )}
        {subView === "deliberation" && (
          <DeliberationView records={records} />
        )}
        {subView === "audit" && (
          <AuditTrail
            records={records}
            verification={verification}
            traceId={traceId}
            onVerify={onVerify}
            onReviewSubmitted={onReviewSubmitted}
          />
        )}
        {subView === "monitoring" && (
          <MonitoringView traceId={traceId} />
        )}
      </div>

      <AuditReportExport onExport={onExport} />
    </div>
  );
}

// ── Monitoring View ──
function MonitoringView({ traceId }: { traceId: string | null }) {
  const [sensitivity, setSensitivity] = useState<{ threshold: number; flagged_edges: number; flagged_people: number }[]>([]);
  const [drift, setDrift] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!traceId) return;
    setLoading(true);
    Promise.all([
      getSensitivity(traceId).catch(() => []),
      getDrift(traceId).catch(() => null),
    ]).then(([s, d]) => {
      setSensitivity(s);
      setDrift(d);
    }).finally(() => setLoading(false));
  }, [traceId]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[200, 150, 180].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: 16, width: w }} />
        ))}
      </div>
    );
  }

  const maxEdges = Math.max(...sensitivity.map(s => s.flagged_edges), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Threshold Sensitivity */}
      <div>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.04em" }}>
          Threshold Sensitivity
        </h3>
        <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>
          How results change with different anomaly thresholds
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sensitivity.map((s) => (
            <div key={s.threshold} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, width: 30, textAlign: "right", flexShrink: 0,
                color: s.threshold === 2.0 ? "var(--accent-blue)" : "var(--text-muted)",
              }}>
                {s.threshold}
              </span>
              <div style={{ flex: 1, height: 18, background: "var(--bg-card)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                <div style={{
                  height: "100%", borderRadius: 4, transition: "width 0.3s ease",
                  width: `${(s.flagged_edges / maxEdges) * 100}%`,
                  background: s.threshold === 2.0
                    ? "linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))"
                    : "rgba(125,133,144,0.3)",
                }} />
                <span style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  fontSize: 9, fontWeight: 600, color: "var(--text-secondary)",
                }}>
                  {s.flagged_edges} edges / {s.flagged_people} people
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Drift Detection */}
      <div>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 10, letterSpacing: "0.04em" }}>
          Drift Detection
        </h3>
        {drift && drift.drift_detected ? (
          <div style={{
            padding: 12, borderRadius: 8,
            background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-amber, #f59e0b)", marginBottom: 6 }}>
              Drift Detected
            </div>
            <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 8px" }}>
              {drift.summary}
            </p>
            {drift.new_anomalous_edges?.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>NEW ANOMALOUS EDGES</div>
                {drift.new_anomalous_edges.slice(0, 5).map((edge: string, i: number) => (
                  <div key={i} style={{ fontSize: 10, color: "var(--accent-red)", fontFamily: "monospace" }}>
                    + {edge}
                  </div>
                ))}
              </div>
            )}
            {drift.score_changes?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>SCORE CHANGES</div>
                {drift.score_changes.slice(0, 5).map((change: any, i: number) => (
                  <div key={i} style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {change.edge}: {change.prev.toFixed(1)} → {change.current.toFixed(1)}
                    <span style={{ color: change.delta > 0 ? "var(--accent-red)" : "var(--accent-green)" }}>
                      {" "}({change.delta > 0 ? "+" : ""}{change.delta.toFixed(1)})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            padding: 12, borderRadius: 8,
            background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-green)", marginBottom: 4 }}>
              No Drift Detected
            </div>
            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
              {drift?.message || "Run analysis again on a different date range to compare results."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
