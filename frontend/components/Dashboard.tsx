"use client";
import { useState, useCallback, useEffect } from "react";
import { FilterPanel } from "./FilterPanel";
import { GraphView } from "./GraphView";
import { ForensicPanel } from "./ForensicPanel";
import { TimeSlider } from "./TimeSlider";
import { AlertBanner } from "./AlertBanner";
import { ComplianceScorecard } from "./ComplianceScorecard";
import { useGraphData } from "@/hooks/useGraphData";
import { useForensicTrace } from "@/hooks/useForensicTrace";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTimeSlider } from "@/hooks/useTimeSlider";
import { listTraces } from "@/lib/api";
import type { TraceSummary } from "@/lib/api";
import type { ThreatCategory, GraphEdge, GraphNode } from "@/lib/types";
import { DEPARTMENT_COLORS, THREAT_COLORS } from "@/lib/constants";
import { Shield, FileText, GitBranch, ArrowRight, User, Mail, AlertTriangle, Activity } from "lucide-react";

type PanelView = "forensic" | "compliance" | "traces" | "person" | "edge" | "empty";

export function Dashboard() {
  const [department, setDepartment] = useState<string>("");
  const [threats, setThreats] = useState<ThreatCategory[]>([]);
  const [rightPanel, setRightPanel] = useState<PanelView>("empty");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null);
  const [availableTraces, setAvailableTraces] = useState<TraceSummary[]>([]);

  const timeSlider = useTimeSlider("1999-06-01", "2002-06-01");
  const { nodes, edges, loading: graphLoading, refetch } = useGraphData({
    start_date: timeSlider.startDate,
    end_date: timeSlider.currentDate,
    department: department || undefined,
    threat_category: threats.length === 1 ? threats[0] : undefined,
  });
  const forensic = useForensicTrace();
  const { alerts, connected, dismissAlert } = useWebSocket();

  // Load available traces on mount
  useEffect(() => {
    listTraces().then(setAvailableTraces).catch(() => {});
  }, []);

  const refreshTraces = useCallback(() => {
    listTraces().then(setAvailableTraces).catch(() => {});
  }, []);

  const loadTraceById = useCallback((traceId: string) => {
    forensic.loadTrace(traceId);
    forensic.loadVerification(traceId);
    setRightPanel("forensic");
  }, [forensic]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode(nodeId);
    setSelectedEdge(null);
    setRightPanel("person");
  }, []);

  const handleEdgeClick = useCallback(
    (source: string, target: string, traceId?: string) => {
      setSelectedEdge({ source, target });
      setSelectedNode(null);
      if (traceId) {
        loadTraceById(traceId);
      } else {
        setRightPanel("edge");
      }
    },
    [loadTraceById]
  );

  const handleAlertClick = useCallback(
    (alert: any) => {
      if (alert.trace_id) {
        loadTraceById(alert.trace_id);
      }
    },
    [loadTraceById]
  );

  const handleAnalysisComplete = useCallback(
    (traceId: string | null) => {
      refetch();
      refreshTraces();
      if (traceId) {
        loadTraceById(traceId);
      }
    },
    [refetch, refreshTraces, loadTraceById]
  );

  // Find selected node/edge data
  const selectedNodeData = selectedNode
    ? nodes.find((n) => n.id === selectedNode) || null
    : null;

  const selectedEdgeData = selectedEdge
    ? edges.find(
        (e) =>
          (e.source === selectedEdge.source && e.target === selectedEdge.target) ||
          (e.source === selectedEdge.target && e.target === selectedEdge.source)
      ) || null
    : null;

  return (
    <div className="dashboard-root">
      {/* ── Header ── */}
      <header className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield style={{ width: 18, height: 18, color: "white" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
              Enron Threat Analysis
            </h1>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Multi-Agent Forensic Traceability
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {availableTraces.length > 0 && (
            <button
              onClick={() => setRightPanel("traces")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: rightPanel === "traces" ? "var(--bg-card)" : "transparent",
                color: rightPanel === "traces" ? "var(--accent-blue)" : "var(--text-secondary)",
                border: rightPanel === "traces" ? "1px solid var(--accent-blue)" : "1px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <GitBranch style={{ width: 14, height: 14 }} />
              Traces ({availableTraces.length})
            </button>
          )}

          <button
            onClick={() => setRightPanel("compliance")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: rightPanel === "compliance" ? "var(--bg-card)" : "transparent",
              color: rightPanel === "compliance" ? "var(--accent-cyan)" : "var(--text-secondary)",
              border: rightPanel === "compliance" ? "1px solid var(--accent-cyan)" : "1px solid transparent",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <FileText style={{ width: 14, height: 14 }} />
            Compliance
          </button>

          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 100,
            background: connected ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            border: `1px solid ${connected ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connected ? "var(--accent-green)" : "var(--accent-red)",
              boxShadow: connected ? "0 0 6px rgba(34,197,94,0.5)" : "none",
            }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: connected ? "var(--accent-green)" : "var(--accent-red)" }}>
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Alert Banner ── */}
      {alerts.length > 0 && (
        <AlertBanner alerts={alerts} onDismiss={dismissAlert} onClick={handleAlertClick} />
      )}

      {/* ── Three-Panel Body ── */}
      <div className="dashboard-body">
        <div className="panel-left">
          <FilterPanel
            department={department}
            onDepartmentChange={setDepartment}
            threats={threats}
            onThreatsChange={setThreats}
            onRunAnalysis={handleAnalysisComplete}
          />
        </div>

        <div className="panel-center">
          <div className="graph-container">
            <GraphView
              nodes={nodes}
              edges={edges}
              loading={graphLoading}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
            />
          </div>
          <div className="time-slider-bar">
            <TimeSlider
              currentDate={timeSlider.currentDate}
              startDate={timeSlider.startDate}
              endDate={timeSlider.endDate}
              isPlaying={timeSlider.isPlaying}
              speed={timeSlider.speed}
              onDateChange={timeSlider.setCurrentDate}
              onPlay={timeSlider.play}
              onPause={timeSlider.pause}
              onSpeedChange={timeSlider.setSpeed}
            />
          </div>
        </div>

        <div className="panel-right">
          {rightPanel === "forensic" && (
            <ForensicPanel
              records={forensic.records}
              verification={forensic.verification}
              counterfactual={forensic.counterfactual}
              tamperSim={forensic.tamperSim}
              loading={forensic.loading}
              traceId={forensic.activeTraceId}
              onVerify={() => forensic.activeTraceId && forensic.loadVerification(forensic.activeTraceId)}
              onCounterfactual={() => forensic.activeTraceId && forensic.loadCounterfactual(forensic.activeTraceId)}
              onTamperSim={() => forensic.activeTraceId && forensic.runTamperSim(forensic.activeTraceId)}
              onExport={() => forensic.activeTraceId && forensic.downloadReport(forensic.activeTraceId)}
            />
          )}

          {rightPanel === "compliance" && <ComplianceScorecard />}

          {rightPanel === "traces" && (
            <TraceBrowser
              traces={availableTraces}
              onSelectTrace={loadTraceById}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              selectedEdgeData={selectedEdgeData}
            />
          )}

          {rightPanel === "person" && selectedNodeData && (
            <PersonDetail
              node={selectedNodeData}
              edges={edges}
              nodes={nodes}
              traces={availableTraces}
              onSelectTrace={loadTraceById}
              onViewEdge={(src, tgt) => {
                setSelectedEdge({ source: src, target: tgt });
                setRightPanel("edge");
              }}
            />
          )}

          {rightPanel === "edge" && selectedEdge && (
            <EdgeDetail
              edge={selectedEdgeData}
              source={selectedEdge.source}
              target={selectedEdge.target}
              nodes={nodes}
              traces={availableTraces}
              onSelectTrace={loadTraceById}
              onViewTraces={() => setRightPanel("traces")}
            />
          )}

          {rightPanel === "empty" && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", flexDirection: "column", gap: 12, padding: 32,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: "var(--bg-card)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Shield style={{ width: 24, height: 24, color: "var(--text-muted)", opacity: 0.4 }} />
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 }}>
                Click a node or edge on the graph to inspect,<br />
                or run a threat analysis to generate<br />
                multi-agent forensic traces
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Person Detail Panel ──
function PersonDetail({
  node, edges, nodes, traces, onSelectTrace, onViewEdge,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  nodes: GraphNode[];
  traces: TraceSummary[];
  onSelectTrace: (traceId: string) => void;
  onViewEdge: (source: string, target: string) => void;
}) {
  const name = node.name || node.id.split("@")[0].replace(/\./g, " ");
  const displayName = name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const deptColor = DEPARTMENT_COLORS[node.department] || DEPARTMENT_COLORS.Unknown;

  // Find all edges connected to this node
  const connectedEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id
  ).sort((a, b) => (b.anomaly_score || 0) - (a.anomaly_score || 0));

  const totalEmails = connectedEdges.reduce((sum, e) => sum + (e.volume || 0), 0);
  const anomalousEdges = connectedEdges.filter(e => (e.anomaly_score || 0) > 2);

  // Find traces that mention this person
  const relatedTraces = traces.filter(t =>
    t.people.some(p => p.toLowerCase().includes(node.id.split("@")[0].replace(".", " ")))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${deptColor}20`, border: `1.5px solid ${deptColor}50`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <User style={{ width: 18, height: 18, color: deptColor }} />
          </div>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              {displayName}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 4,
                background: `${deptColor}18`, color: deptColor,
                fontWeight: 600, textTransform: "uppercase",
              }}>
                {node.department || "Unknown"}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {node.id}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <StatBox label="Connections" value={connectedEdges.length} icon={<Activity style={{ width: 12, height: 12 }} />} />
        <StatBox label="Emails" value={totalEmails} icon={<Mail style={{ width: 12, height: 12 }} />} />
        <StatBox label="Anomalous" value={anomalousEdges.length} color="var(--accent-red)" icon={<AlertTriangle style={{ width: 12, height: 12 }} />} />
      </div>

      {/* Connected people */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.04em" }}>
          Communications ({connectedEdges.length})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {connectedEdges.map((edge, i) => {
            const otherId = edge.source === node.id ? edge.target : edge.source;
            const otherNode = nodes.find(n => n.id === otherId);
            const otherName = (otherNode?.name || otherId.split("@")[0]).replace(/\./g, " ");
            const otherDisplay = otherName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const isAnomalous = (edge.anomaly_score || 0) > 2;
            const otherDept = otherNode?.department || "Unknown";
            const otherColor = DEPARTMENT_COLORS[otherDept] || DEPARTMENT_COLORS.Unknown;

            return (
              <button
                key={`${edge.source}-${edge.target}-${i}`}
                onClick={() => onViewEdge(edge.source, edge.target)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 10px", borderRadius: 6, cursor: "pointer", width: "100%",
                  background: isAnomalous ? "rgba(239,68,68,0.06)" : "var(--bg-card)",
                  border: `1px solid ${isAnomalous ? "rgba(239,68,68,0.2)" : "var(--border)"}`,
                  transition: "all 0.15s", textAlign: "left",
                  color: "var(--text-primary)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = isAnomalous ? "rgba(239,68,68,0.4)" : "var(--accent-blue)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = isAnomalous ? "rgba(239,68,68,0.2)" : "var(--border)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", background: otherColor, flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{otherDisplay}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{otherDept}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {edge.volume || 0} emails
                  </span>
                  {isAnomalous && (
                    <span style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 3,
                      background: "rgba(239,68,68,0.15)", color: "var(--accent-red)", fontWeight: 600,
                    }}>
                      {(edge.anomaly_score || 0).toFixed(1)}
                    </span>
                  )}
                  <ArrowRight style={{ width: 10, height: 10, color: "var(--text-muted)" }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Related traces */}
        {relatedTraces.length > 0 && (
          <>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginTop: 16, marginBottom: 8, letterSpacing: "0.04em" }}>
              Related Analysis Traces
            </h3>
            {relatedTraces.map((trace) => (
              <TraceCard key={trace.trace_id} trace={trace} onClick={() => onSelectTrace(trace.trace_id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Edge Detail Panel ──
function EdgeDetail({
  edge, source, target, nodes, traces, onSelectTrace, onViewTraces,
}: {
  edge: GraphEdge | null;
  source: string;
  target: string;
  nodes: GraphNode[];
  traces: TraceSummary[];
  onSelectTrace: (traceId: string) => void;
  onViewTraces: () => void;
}) {
  const srcNode = nodes.find(n => n.id === source);
  const tgtNode = nodes.find(n => n.id === target);
  const srcName = (srcNode?.name || source.split("@")[0]).replace(/\./g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const tgtName = (tgtNode?.name || target.split("@")[0]).replace(/\./g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const srcDept = srcNode?.department || "Unknown";
  const tgtDept = tgtNode?.department || "Unknown";
  const srcColor = DEPARTMENT_COLORS[srcDept] || DEPARTMENT_COLORS.Unknown;
  const tgtColor = DEPARTMENT_COLORS[tgtDept] || DEPARTMENT_COLORS.Unknown;
  const anomalyScore = edge?.anomaly_score || 0;
  const isAnomalous = anomalyScore > 2;
  const volume = edge?.volume || 0;

  // Find related traces
  const srcShort = source.split("@")[0].replace(".", " ");
  const tgtShort = target.split("@")[0].replace(".", " ");
  const relatedTraces = traces.filter(t =>
    t.people.some(p => p.toLowerCase().includes(srcShort)) ||
    t.people.some(p => p.toLowerCase().includes(tgtShort))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Mail style={{ width: 16, height: 16, color: isAnomalous ? "var(--accent-red)" : "var(--accent-blue)" }} />
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Communication Link
          </h2>
        </div>

        {/* Source → Target visualization */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 8,
          background: isAnomalous ? "rgba(239,68,68,0.06)" : "var(--bg-card)",
          border: `1px solid ${isAnomalous ? "rgba(239,68,68,0.2)" : "var(--border)"}`,
        }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, margin: "0 auto 6px",
              background: `${srcColor}20`, border: `1.5px solid ${srcColor}50`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User style={{ width: 14, height: 14, color: srcColor }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{srcName}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{srcDept}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <ArrowRight style={{ width: 16, height: 16, color: isAnomalous ? "var(--accent-red)" : "var(--text-muted)" }} />
            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{volume} emails</span>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, margin: "0 auto 6px",
              background: `${tgtColor}20`, border: `1.5px solid ${tgtColor}50`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User style={{ width: 14, height: 14, color: tgtColor }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{tgtName}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{tgtDept}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <StatBox label="Email Volume" value={volume} icon={<Mail style={{ width: 12, height: 12 }} />} />
        <StatBox
          label="Anomaly Score"
          value={anomalyScore.toFixed(1)}
          color={isAnomalous ? "var(--accent-red)" : "var(--accent-green)"}
          icon={<AlertTriangle style={{ width: 12, height: 12 }} />}
        />
      </div>

      {/* Anomaly explanation */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {isAnomalous && (
          <div style={{
            padding: 10, borderRadius: 6, marginBottom: 12,
            background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-red)", marginBottom: 4 }}>
              Anomalous Communication Pattern
            </div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
              The email volume between these two people ({volume} emails) is significantly higher
              than expected. Anomaly score {anomalyScore.toFixed(1)} indicates the communication
              intensity is {anomalyScore >= 3.5 ? "very far" : "moderately far"} above the baseline,
              {anomalyScore >= 3.5
                ? " which may indicate coordinated activity worth investigating."
                : " which warrants attention but may have legitimate explanations."}
            </p>
          </div>
        )}

        {!isAnomalous && (
          <div style={{
            padding: 10, borderRadius: 6, marginBottom: 12,
            background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-green)", marginBottom: 4 }}>
              Normal Communication Pattern
            </div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
              The email volume between these people appears within normal operational range.
              No unusual patterns were detected by the anomaly detection system.
            </p>
          </div>
        )}

        {/* Related traces */}
        {relatedTraces.length > 0 ? (
          <>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.04em" }}>
              Related Analysis Traces
            </h3>
            {relatedTraces.map((trace) => (
              <TraceCard key={trace.trace_id} trace={trace} onClick={() => onSelectTrace(trace.trace_id)} />
            ))}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
            <GitBranch style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.3 }} />
            <p style={{ fontSize: 12 }}>No analysis traces yet</p>
            <p style={{ fontSize: 10, marginTop: 4 }}>
              Run a threat analysis to generate forensic traces for this communication pair
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared: Stat box ──
function StatBox({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: React.ReactNode }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 6,
      background: "var(--bg-card)", border: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
        {icon && <span style={{ color: "var(--text-muted)" }}>{icon}</span>}
        <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

// ── Shared: Trace card ──
function TraceCard({ trace, onClick }: { trace: TraceSummary; onClick: () => void }) {
  const conf = trace.confidence;
  const confColor = conf !== null
    ? conf >= 0.7 ? "var(--accent-red)" : conf >= 0.4 ? "var(--accent-amber)" : "var(--accent-green)"
    : "var(--text-muted)";

  const threatLabel = trace.threat_category
    ? trace.threat_category.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
    : null;

  const title = trace.short_summary || threatLabel || "Analysis Trace";

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 4,
        padding: 10, borderRadius: 6, textAlign: "left", cursor: "pointer",
        background: "var(--bg-card)", border: "1px solid var(--border)",
        transition: "all 0.15s", color: "var(--text-primary)", width: "100%", marginBottom: 4,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-blue)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{title}</span>
        <ArrowRight style={{ width: 10, height: 10, color: "var(--text-muted)", flexShrink: 0 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {threatLabel && (
          <span style={{
            fontSize: 9, padding: "1px 5px", borderRadius: 3,
            background: "rgba(239,68,68,0.1)", color: "var(--accent-red)",
            textTransform: "uppercase", fontWeight: 600,
          }}>
            {threatLabel}
          </span>
        )}
        {conf !== null && (
          <span style={{ fontSize: 10, fontWeight: 600, color: confColor }}>
            {(conf * 100).toFixed(0)}% confidence
          </span>
        )}
        {trace.people.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {trace.people.slice(0, 2).join(", ")}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
        {new Date(trace.started_at).toLocaleDateString()} &middot; {trace.record_count} records
      </div>
    </button>
  );
}

// ── Trace Browser sub-component ──
function TraceBrowser({
  traces, onSelectTrace, selectedNode, selectedEdge, selectedEdgeData,
}: {
  traces: TraceSummary[];
  onSelectTrace: (traceId: string) => void;
  selectedNode: string | null;
  selectedEdge: { source: string; target: string } | null;
  selectedEdgeData: GraphEdge | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
          <GitBranch style={{ width: 16, height: 16, color: "var(--accent-blue)" }} />
          Forensic Traces
        </h2>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Select a trace to view the full multi-agent reasoning chain
        </p>
      </div>

      {(selectedNode || selectedEdge) && (
        <div style={{
          padding: 12, margin: "12px 12px 0", borderRadius: 8,
          background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
        }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Selected</div>
          {selectedNode && (
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--accent-blue)" }}>
              Node: {selectedNode.split("@")[0]}
            </div>
          )}
          {selectedEdge && (
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--accent-blue)" }}>
              {selectedEdge.source.split("@")[0]} &harr; {selectedEdge.target.split("@")[0]}
              {selectedEdgeData && selectedEdgeData.anomaly_score > 2 && (
                <span style={{
                  marginLeft: 8, fontSize: 10, padding: "1px 6px", borderRadius: 3,
                  background: "rgba(239,68,68,0.15)", color: "var(--accent-red)",
                }}>
                  anomaly: {selectedEdgeData.anomaly_score.toFixed(1)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        {traces.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
            <GitBranch style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
            <p style={{ fontSize: 13 }}>No traces yet</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>Run a threat analysis to generate traces</p>
          </div>
        ) : (
          traces.map((trace) => (
            <TraceCard key={trace.trace_id} trace={trace} onClick={() => onSelectTrace(trace.trace_id)} />
          ))
        )}
      </div>
    </div>
  );
}
