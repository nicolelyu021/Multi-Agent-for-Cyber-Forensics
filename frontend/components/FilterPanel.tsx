"use client";
import { useState } from "react";
import { startAnalysis, pollAnalysisUntilDone } from "@/lib/api";
import { THREAT_COLORS, DEPARTMENT_COLORS } from "@/lib/constants";
import type { ThreatCategory } from "@/lib/types";
import { Play, Loader2, Scan, CheckCircle, XCircle } from "lucide-react";

interface FilterPanelProps {
  department: string;
  onDepartmentChange: (d: string) => void;
  threats: ThreatCategory[];
  onThreatsChange: (t: ThreatCategory[]) => void;
  onRunAnalysis: (traceId: string | null) => void;
}

const DEPARTMENTS = ["Executive", "Finance", "Accounting", "Legal", "Trading", "Research"];
const THREAT_TYPES: { key: ThreatCategory; label: string }[] = [
  { key: "financial_fraud", label: "Financial Fraud" },
  { key: "data_destruction", label: "Data Destruction" },
  { key: "inappropriate_relations", label: "Inappropriate" },
];

export function FilterPanel({
  department, onDepartmentChange, threats, onThreatsChange, onRunAnalysis,
}: FilterPanelProps) {
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [startDate, setStartDate] = useState("2000-10-01");
  const [endDate, setEndDate] = useState("2001-12-31");

  const toggleThreat = (t: ThreatCategory) => {
    // Radio-style: clicking the same one deselects, clicking a new one selects just that
    onThreatsChange(threats.includes(t) ? [] : [t]);
  };

  const handleRunAnalysis = async () => {
    setAnalysisStatus("running");
    setStatusMessage("Starting analysis...");
    try {
      const { run_id } = await startAnalysis({ start_date: startDate, end_date: endDate });
      setStatusMessage("Agents working...");

      const results = await pollAnalysisUntilDone(run_id, (status) => {
        setStatusMessage(
          status === "running" ? "Agents analyzing emails..." :
          status === "queued" ? "Queued..." : status
        );
      });

      if (results.status === "completed" && results.result) {
        setAnalysisStatus("completed");
        const traceId = results.result.trace_id || results.result.root_trace_id;
        setStatusMessage(traceId ? `Trace: ${traceId.slice(0, 8)}...` : "Analysis complete");
        onRunAnalysis(traceId || null);
      } else {
        setAnalysisStatus("failed");
        setStatusMessage(results.result?.error || "Analysis failed");
        onRunAnalysis(null);
      }
    } catch (err: any) {
      setAnalysisStatus("failed");
      setStatusMessage(err.message || "Analysis failed");
      onRunAnalysis(null);
    }
  };

  const isRunning = analysisStatus === "running";

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
      {/* Date Range */}
      <div>
        <div className="section-label">Time Window</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Department */}
      <div>
        <div className="section-label">Department</div>
        <select value={department} onChange={(e) => onDepartmentChange(e.target.value)}>
          <option value="">All Departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* Threat Categories */}
      <div>
        <div className="section-label">Filter by Threat Type</div>
        <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, marginTop: -4 }}>
          Click to show only emails of this type
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {THREAT_TYPES.map(({ key, label }) => {
            const active = threats.includes(key);
            const color = THREAT_COLORS[key];
            return (
              <button
                key={key}
                onClick={() => toggleThreat(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: active ? `${color}20` : "var(--bg-card)",
                  border: `1px solid ${active ? color : "var(--border)"}`,
                  color: active ? color : "var(--text-secondary)",
                  cursor: "pointer", transition: "all 0.15s", textAlign: "left",
                  boxShadow: active ? `0 0 8px ${color}30` : "none",
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${color}`,
                  background: active ? color : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {active && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "white" }} />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Run Button */}
      <button
        className="btn-primary"
        onClick={handleRunAnalysis}
        disabled={isRunning}
      >
        {isRunning ? (
          <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> Analyzing...</>
        ) : (
          <><Scan style={{ width: 15, height: 15 }} /> Run Threat Analysis</>
        )}
      </button>

      {/* Analysis Status */}
      {analysisStatus !== "idle" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 6, fontSize: 11,
          background: analysisStatus === "completed" ? "rgba(34,197,94,0.1)" :
                     analysisStatus === "failed" ? "rgba(239,68,68,0.1)" :
                     "rgba(59,130,246,0.1)",
          border: `1px solid ${
            analysisStatus === "completed" ? "rgba(34,197,94,0.3)" :
            analysisStatus === "failed" ? "rgba(239,68,68,0.3)" :
            "rgba(59,130,246,0.3)"
          }`,
          color: analysisStatus === "completed" ? "var(--accent-green)" :
                 analysisStatus === "failed" ? "var(--accent-red)" :
                 "var(--accent-blue)",
        }}>
          {analysisStatus === "completed" && <CheckCircle style={{ width: 12, height: 12 }} />}
          {analysisStatus === "failed" && <XCircle style={{ width: 12, height: 12 }} />}
          {analysisStatus === "running" && (
            <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
          )}
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {statusMessage}
          </span>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <div className="section-label">Node Colors (Department)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(DEPARTMENT_COLORS).map(([dept, color]) => (
            <div key={dept} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
              <span className="dot" style={{ background: color }} />
              {dept}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="section-label" style={{ marginBottom: 4 }}>Edge Colors</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
            <span style={{ width: 16, height: 2, background: "rgba(139,157,195,0.4)", borderRadius: 1, flexShrink: 0 }} />
            Normal
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--accent-red)" }}>
            <span style={{ width: 16, height: 3, background: "#ef4444", borderRadius: 1, flexShrink: 0, boxShadow: "0 0 4px rgba(239,68,68,0.4)" }} />
            Anomalous
          </div>
        </div>
      </div>
    </div>
  );
}
