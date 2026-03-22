"use client";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { FilterPanel } from "./FilterPanel";
import { GraphView } from "./GraphView";
import { ForensicPanel } from "./ForensicPanel";
import { TimeSlider } from "./TimeSlider";
import { AlertBanner } from "./AlertBanner";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { ExecutiveSummary } from "./ExecutiveSummary";
// StreamControl moved to GraphView overlay
import { SlackNotificationLog } from "./SlackNotificationLog";
import { ComplianceScorecard } from "./ComplianceScorecard";
import { AgentReasoning } from "./AgentReasoning";
import { PatternAnalytics } from "./PatternAnalytics";
import { useGraphData } from "@/hooks/useGraphData";
import { useForensicTrace } from "@/hooks/useForensicTrace";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTimeSlider } from "@/hooks/useTimeSlider";
import { listTraces } from "@/lib/api";
import type { TraceSummary } from "@/lib/api";
import type { ThreatCategory, GraphEdge, GraphNode, Persona } from "@/lib/types";
import { DEPARTMENT_COLORS } from "@/lib/constants";
import { getPersonExplanation, getPersonEmails, queryPerson } from "@/lib/api";
import type { SelectedEmployee } from "./FilterPanel";
import {
  Shield, FileText, GitBranch, ArrowRight, User, Mail,
  AlertTriangle, Activity, Network, BarChart3, X, Brain, Bell,
  Sun, Moon, Send, ChevronDown, ChevronRight, Search, Loader2,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

type PanelView = "forensic" | "traces" | "person" | "edge" | "notifications" | "compliance" | "reasoning" | "analytics" | "empty";

export function Dashboard() {
  const [department, setDepartment] = useState<string>("");
  const [threats, setThreats] = useState<ThreatCategory[]>([]);
  const [rightPanel, setRightPanel] = useState<PanelView>("empty");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null);
  const [availableTraces, setAvailableTraces] = useState<TraceSummary[]>([]);
  const [investigationNodeIds, setInvestigationNodeIds] = useState<Set<string>>(new Set());
  const [analysisSummary, setAnalysisSummary] = useState<{ confidence: number; threat: string; people: string[]; summary?: string } | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [persona, setPersona] = useState<Persona>("soc_analyst");
  const [selectedEmployees, setSelectedEmployees] = useState<SelectedEmployee[]>([]);
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(340);
  const { theme, toggle: toggleTheme, mounted: themeMounted } = useTheme();
  const lastAnalysisResultRef = useRef<any>(null);

  const timeSlider = useTimeSlider("1999-06-01", "2002-06-01");
  const { nodes, edges, loading: graphLoading, refetch } = useGraphData({
    start_date: timeSlider.startDate,
    end_date: timeSlider.currentDate,
    department: department || undefined,
    threat_category: threats.length === 1 ? threats[0] : undefined,
    include_scores: hasRunAnalysis,
    person_emails: selectedEmployees.length > 0 ? selectedEmployees.map(e => e.id) : undefined,
  });
  const forensic = useForensicTrace();
  const { alerts, connected, dismissAlert, slackNotifications } = useWebSocket();
  const [showNotifications, setShowNotifications] = useState(false);

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
    (traceId: string | null, result?: any) => {
      setHasRunAnalysis(true);
      if (result) lastAnalysisResultRef.current = result;
      refetch();
      refreshTraces();
      if (traceId) {
        loadTraceById(traceId);
      }
      // Initial extraction from analysis result (edges may be stale here — useEffect below re-computes)
      if (result) {
        const nodeIds = new Set<string>();
        const payload = result.alert_payload || {};
        const anomEdges = payload.anomalous_edges || result.anomalous_edges || [];
        for (const e of anomEdges) {
          if (e.source) nodeIds.add(e.source);
          if (e.target) nodeIds.add(e.target);
        }
        const profiles = payload.behavioral_profiles || result.behavioral_profiles || [];
        for (const p of profiles) {
          if (p.person) nodeIds.add(p.person);
        }
        setInvestigationNodeIds(nodeIds);
        setAnalysisSummary({
          confidence: result.final_confidence || 0,
          threat: result.threat_category || "unknown",
          people: Array.from(nodeIds).map(id => id.split("@")[0].replace(/\./g, " ")).map(n => n.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")),
          summary: payload.summary || "",
        });
        setShowBanner(true);
      }
    },
    [refetch, refreshTraces, loadTraceById]
  );

  // Reactively update investigation nodes when edges change (fixes stale-edge timing bug)
  useEffect(() => {
    if (!hasRunAnalysis || !lastAnalysisResultRef.current) return;
    const result = lastAnalysisResultRef.current;
    const nodeIds = new Set<string>();
    const payload = result.alert_payload || {};
    const anomEdges = payload.anomalous_edges || result.anomalous_edges || [];
    for (const e of anomEdges) {
      if (e.source) nodeIds.add(e.source);
      if (e.target) nodeIds.add(e.target);
    }
    const profiles = payload.behavioral_profiles || result.behavioral_profiles || [];
    for (const p of profiles) {
      if (p.person) nodeIds.add(p.person);
    }
    // Include nodes from graph edges that are anomalous (now with fresh edge data)
    for (const e of edges) {
      if ((e.anomaly_score || 0) > 2) {
        nodeIds.add(e.source);
        nodeIds.add(e.target);
      }
    }
    setInvestigationNodeIds(nodeIds);
    // Update people list in summary
    setAnalysisSummary(prev => prev ? {
      ...prev,
      people: Array.from(nodeIds).map(id => id.split("@")[0].replace(/\./g, " ")).map(n => n.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")),
    } : prev);
  }, [edges, hasRunAnalysis]);

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

  const displayNodes = useMemo(() => {
    if (!hasRunAnalysis) return [];
    if (!suspiciousOnly) return nodes;
    // Filter to only nodes with suspicion_score > 0 and their connected edges
    const suspiciousIds = new Set(nodes.filter(n => (n.suspicion_score || 0) > 15).map(n => n.id));
    return nodes.filter(n => suspiciousIds.has(n.id));
  }, [hasRunAnalysis, nodes, suspiciousOnly]);

  const displayEdges = useMemo(() => {
    if (!hasRunAnalysis) return [];
    if (!suspiciousOnly) return edges;
    const suspiciousIds = new Set(nodes.filter(n => (n.suspicion_score || 0) > 15).map(n => n.id));
    return edges.filter(e => suspiciousIds.has(e.source) || suspiciousIds.has(e.target));
  }, [hasRunAnalysis, edges, nodes, suspiciousOnly]);

  const anomalousCount = displayEdges.filter((e) => e.anomaly_score > 2).length;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { setRightPanel("empty"); setSelectedNode(null); setSelectedEdge(null); }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus(); }
      if (e.key === "1" && !e.metaKey) setPersona("soc_analyst");
      if (e.key === "2" && !e.metaKey) setPersona("compliance_officer");
      if (e.key === "3" && !e.metaKey) setPersona("executive");
      if (e.key === " " && !e.metaKey && !e.ctrlKey) { e.preventDefault(); timeSlider.isPlaying ? timeSlider.pause() : timeSlider.play(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [timeSlider]);

  // Auto-switch panel based on persona
  useEffect(() => {
    if (persona === "compliance_officer") setRightPanel("compliance");
    else if (persona === "executive") setRightPanel("forensic");
  }, [persona]);

  // Icon sidebar items
  const sidebarItems: { key: PanelView; icon: React.ReactNode; label: string }[] = [
    { key: "forensic", icon: <Shield style={{ width: 18, height: 18 }} />, label: "Forensic" },
    { key: "traces", icon: <GitBranch style={{ width: 18, height: 18 }} />, label: "Traces" },
    { key: "compliance", icon: <FileText style={{ width: 18, height: 18 }} />, label: "Comply" },
    { key: "notifications", icon: <Bell style={{ width: 18, height: 18 }} />, label: "Alerts" },
  ];

  return (
    <div className="dashboard-root">
      {/* ── Header ── */}
      <header className="dashboard-header">
        {/* Left: Logo + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield style={{ width: 15, height: 15, color: "white" }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
            Enron Threat Analysis
          </span>
        </div>

        {/* Center: Persona Switcher + Data Chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PersonaSwitcher persona={persona} onChange={setPersona} />
          <div style={{ width: 1, height: 20, background: "var(--border)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DataChip label="NODES" value={displayNodes.length} />
          <DataChip label="EDGES" value={displayEdges.length} />
          <DataChip
            label="ANOMALOUS"
            value={anomalousCount}
            valueColor={anomalousCount > 0 ? "var(--accent-red)" : "var(--accent-green)"}
          />
          <DataChip
            label="TRACES"
            value={availableTraces.length}
            valueColor={availableTraces.length > 0 ? "var(--accent-cyan)" : undefined}
          />
        </div>

        {/* Right: Theme toggle + Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 6,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              cursor: "pointer", color: "var(--text-secondary)",
              transition: "all 0.15s",
            }}
          >
            {(!themeMounted || theme === "dark")
              ? <Sun style={{ width: 14, height: 14 }} />
              : <Moon style={{ width: 14, height: 14 }} />}
          </button>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 8px", borderRadius: 100,
            background: connected ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${connected ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: "50%",
              background: connected ? "var(--accent-green)" : "var(--accent-red)",
              boxShadow: connected ? "0 0 6px rgba(34,197,94,0.5)" : "none",
            }} />
            <span style={{ fontSize: 10, fontWeight: 500, color: connected ? "var(--accent-green)" : "var(--accent-red)" }}>
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* Alert banner removed for cleaner readability */}

      {/* ── Body: Left Panel | Center | Right Panel | Icon Sidebar ── */}
      <div className="dashboard-body">
        <div className="panel-left" style={{ width: leftWidth }}>
          {leftWidth > 80 ? (
            <FilterPanel
              department={department}
              onDepartmentChange={setDepartment}
              threats={threats}
              onThreatsChange={setThreats}
              onRunAnalysis={handleAnalysisComplete}
              selectedEmployees={selectedEmployees}
              onEmployeesChange={setSelectedEmployees}
            />
          ) : (
            <button
              onClick={() => setLeftWidth(240)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", padding: "12px 0", width: "100%",
                fontSize: 16,
              }}
              title="Expand filters"
            >
              ›
            </button>
          )}
        </div>
        <ResizeHandle side="left" onResize={setLeftWidth} currentWidth={leftWidth} min={48} max={400} />

        <div className="panel-center">
          <div className="graph-container">
            <GraphView
              nodes={displayNodes}
              edges={displayEdges}
              loading={hasRunAnalysis && graphLoading}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              investigationNodes={investigationNodeIds}
              simplified={persona === "executive"}
            />

            {/* Post-analysis summary banner */}
            {showBanner && analysisSummary && (
              <div style={{
                position: "absolute", bottom: 12, left: 12, right: 12,
                padding: "10px 14px", borderRadius: 8, zIndex: 20,
                background: theme === "light" ? "rgba(255,255,255,0.94)" : "rgba(15,19,24,0.92)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(59,130,246,0.3)",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <AlertTriangle style={{
                  width: 18, height: 18, flexShrink: 0,
                  color: analysisSummary.confidence >= 0.7 ? "var(--accent-red)" : "var(--accent-amber)",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
                    {analysisSummary.threat.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} Detected
                    <span style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 600,
                      color: analysisSummary.confidence >= 0.7 ? "var(--accent-red)" : "var(--accent-amber)",
                    }}>
                      {(analysisSummary.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {analysisSummary.people.slice(0, 3).join(", ")}
                    {analysisSummary.people.length > 3 && ` +${analysisSummary.people.length - 3} more`}
                  </div>
                </div>
                <button
                  onClick={() => { setRightPanel("forensic"); }}
                  style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                    cursor: "pointer", background: "var(--accent-blue)", color: "white",
                    border: "none", whiteSpace: "nowrap",
                  }}
                >
                  Review Evidence
                </button>
                <button
                  onClick={() => forensic.activeTraceId && forensic.downloadReport(forensic.activeTraceId, { threat: analysisSummary?.threat, date: new Date().toISOString().slice(0, 10) })}
                  style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                    cursor: "pointer", background: "var(--bg-card)", color: "var(--text-secondary)",
                    border: "1px solid var(--border)", whiteSpace: "nowrap",
                  }}
                >
                  Export PDF
                </button>
                <button
                  onClick={() => setShowBanner(false)}
                  style={{
                    padding: 4, borderRadius: 4, cursor: "pointer",
                    background: "transparent", border: "none", color: "var(--text-muted)",
                  }}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            )}
          </div>
          {hasRunAnalysis && (
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
                suspiciousOnly={suspiciousOnly}
                onSuspiciousOnlyChange={setSuspiciousOnly}
              />
            </div>
          )}
        </div>

        <ResizeHandle side="right" onResize={setRightWidth} currentWidth={rightWidth} min={48} max={600} />
        <div className="panel-right" style={{ width: rightWidth }}>
          {rightPanel === "forensic" && persona === "executive" && (
            forensic.records.length > 0 ? (
              <ExecutiveSummary
                records={forensic.records}
                traceId={forensic.activeTraceId}
                confidence={analysisSummary?.confidence || 0}
                threatCategory={analysisSummary?.threat || "unknown"}
                people={analysisSummary?.people || []}
                summary={analysisSummary?.summary}
                onExport={() => forensic.activeTraceId && forensic.downloadReport(forensic.activeTraceId, { threat: analysisSummary?.threat, date: new Date().toISOString().slice(0, 10) })}
              />
            ) : (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: "100%", flexDirection: "column", gap: 12, padding: 32,
              }}>
                <Shield style={{ width: 32, height: 32, color: "var(--text-muted)", opacity: 0.3 }} />
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
                  Run a threat analysis to see the<br />executive summary
                </p>
              </div>
            )
          )}
          {rightPanel === "forensic" && persona !== "executive" && (
            <ForensicPanel
              records={forensic.records}
              verification={forensic.verification}
              loading={forensic.loading}
              traceId={forensic.activeTraceId}
              onVerify={() => forensic.activeTraceId && forensic.loadVerification(forensic.activeTraceId)}
              onExport={() => forensic.activeTraceId && forensic.downloadReport(forensic.activeTraceId, { threat: analysisSummary?.threat, date: new Date().toISOString().slice(0, 10) })}
              onReviewSubmitted={() => {
                if (forensic.activeTraceId) {
                  forensic.loadTrace(forensic.activeTraceId);
                  refreshTraces();
                }
              }}
              personFilter={selectedNode}
              edgeFilter={selectedEdge}
              defaultTab={persona === "compliance_officer" ? "audit" : undefined}
            />
          )}

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
              persona={persona}
              activeTraceId={forensic.activeTraceId}
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

          {rightPanel === "notifications" && (
            <SlackNotificationLog wsNotifications={slackNotifications} />
          )}

          {rightPanel === "compliance" && (
            <ComplianceScorecard
              records={forensic.records}
              verification={forensic.verification}
              traceId={forensic.activeTraceId}
              onViewTrace={loadTraceById}
            />
          )}

          {rightPanel === "reasoning" && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
                <Brain style={{ width: 16, height: 16, color: "var(--accent-cyan)" }} />
                Agent Reasoning
              </h2>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                How each AI agent contributed to the threat assessment — evidence, tool calls, and reasoning chains.
              </p>
              <AgentReasoning records={forensic.records} />
            </div>
          )}

          {rightPanel === "analytics" && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
                <BarChart3 style={{ width: 16, height: 16, color: "var(--accent-amber)" }} />
                Communication Patterns
              </h2>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Cross-department communication frequencies, behavioral deviations, and volume analysis.
              </p>
              <PatternAnalytics nodes={displayNodes} edges={displayEdges} />
            </div>
          )}

          {rightPanel === "empty" && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", flexDirection: "column", gap: 12, padding: 32,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: "var(--bg-card)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Network style={{ width: 22, height: 22, color: "var(--text-muted)", opacity: 0.4 }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
                Click a node or edge to inspect,<br />
                or run a threat analysis to generate<br />
                forensic traces
              </p>
            </div>
          )}
        </div>

        {/* ── Icon Sidebar ── */}
        <div className="icon-sidebar">
          {sidebarItems.map(({ key, icon, label }) => (
            <button
              key={key}
              className={`icon-sidebar-btn ${rightPanel === key ? "active" : ""}`}
              onClick={() => setRightPanel(rightPanel === key ? "empty" : key)}
              title={label}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
          <div style={{ width: 36, height: 1, background: "var(--border)", margin: "2px 0" }} />
          {forensic.activeTraceId && (
            <button
              className={`icon-sidebar-btn ${rightPanel === "reasoning" ? "active" : ""}`}
              onClick={() => setRightPanel(rightPanel === "reasoning" ? "empty" : "reasoning")}
              title="Reasoning"
            >
              <Brain style={{ width: 18, height: 18 }} />
              <span>Reasoning</span>
            </button>
          )}
          {hasRunAnalysis && (
            <>
              <button
                className={`icon-sidebar-btn ${rightPanel === "analytics" ? "active" : ""}`}
                onClick={() => setRightPanel(rightPanel === "analytics" ? "empty" : "analytics")}
                title="Analytics"
              >
                <BarChart3 style={{ width: 18, height: 18 }} />
                <span>Analytics</span>
              </button>
              <div style={{ width: 36, height: 1, background: "var(--border)", margin: "2px 0" }} />
            </>
          )}
          {selectedNode && (
            <button
              className={`icon-sidebar-btn ${rightPanel === "person" ? "active" : ""}`}
              onClick={() => setRightPanel("person")}
              title="Person"
            >
              <User style={{ width: 18, height: 18 }} />
              <span>Person</span>
            </button>
          )}
          {selectedEdge && (
            <button
              className={`icon-sidebar-btn ${rightPanel === "edge" ? "active" : ""}`}
              onClick={() => setRightPanel("edge")}
              title="Edge"
            >
              <Mail style={{ width: 18, height: 18 }} />
              <span>Edge</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Data Chip (header) ──
function DataChip({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: number;
  valueColor?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "2px 10px", borderRadius: 4,
      background: "var(--bg-card)", border: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: valueColor || "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

// ── Resize Handle ──
function ResizeHandle({
  side,
  onResize,
  currentWidth,
  min,
  max,
}: {
  side: "left" | "right";
  onResize: (width: number) => void;
  currentWidth: number;
  min: number;
  max: number;
}) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
    const onMove = (me: MouseEvent) => {
      const delta = me.clientX - startXRef.current;
      const newWidth = side === "left"
        ? startWidthRef.current + delta
        : startWidthRef.current - delta;
      onResize(Math.max(min, Math.min(max, newWidth)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: 5, flexShrink: 0, cursor: "col-resize",
        background: "transparent", transition: "background 0.15s",
        position: "relative", zIndex: 10,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-blue)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    />
  );
}

// ── Person Detail Panel (Tabbed) ──
type PersonTab = "overview" | "emails" | "ask";

function PersonDetail({
  node, edges, nodes, traces, onSelectTrace, onViewEdge, persona, activeTraceId,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  nodes: GraphNode[];
  traces: TraceSummary[];
  onSelectTrace: (traceId: string) => void;
  onViewEdge: (source: string, target: string) => void;
  persona?: Persona;
  activeTraceId?: string | null;
}) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [activeTab, setActiveTab] = useState<PersonTab>("overview");

  // Emails tab state
  const [personEmails, setPersonEmails] = useState<any[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [emailsFetched, setEmailsFetched] = useState(false);
  const [emailSearch, setEmailSearch] = useState("");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  // Ask AI tab state
  const [queryInput, setQueryInput] = useState("");
  const [queryHistory, setQueryHistory] = useState<{ q: string; a: string }[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);

  // Reset state when node changes
  useEffect(() => {
    setActiveTab("overview");
    setPersonEmails([]);
    setEmailsFetched(false);
    setEmailSearch("");
    setExpandedEmail(null);
    setQueryHistory([]);
    setQueryInput("");
  }, [node.id]);

  // Fetch explanation when persona or node changes
  useEffect(() => {
    if (!activeTraceId || !node.id) return;
    setLoadingExplanation(true);
    getPersonExplanation(activeTraceId, node.id, persona || "soc_analyst")
      .then((res) => setExplanation(res.explanation))
      .catch(() => setExplanation(null))
      .finally(() => setLoadingExplanation(false));
  }, [activeTraceId, node.id, persona]);

  // Fetch emails when Emails tab first opened
  useEffect(() => {
    if (activeTab !== "emails" || emailsFetched) return;
    setEmailsLoading(true);
    setEmailsFetched(true);
    getPersonEmails(node.id)
      .then(setPersonEmails)
      .catch(() => setPersonEmails([]))
      .finally(() => setEmailsLoading(false));
  }, [activeTab, node.id, emailsFetched]);

  const name = node.name || node.id.split("@")[0].replace(/\./g, " ");
  const displayName = name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const deptColor = DEPARTMENT_COLORS[node.department] || DEPARTMENT_COLORS.Unknown;

  const connectedEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id
  ).sort((a, b) => (b.anomaly_score || 0) - (a.anomaly_score || 0));

  const totalEmails = connectedEdges.reduce((sum, e) => sum + (e.volume || 0), 0);
  const anomalousEdges = connectedEdges.filter(e => (e.anomaly_score || 0) > 2);

  const relatedTraces = traces.filter(t =>
    t.people.some(p => p.toLowerCase().includes(node.id.split("@")[0].replace(".", " ")))
  );

  // Auto-load related trace if available and no active trace
  useEffect(() => {
    if (!activeTraceId && relatedTraces.length > 0) {
      onSelectTrace(relatedTraces[0].trace_id);
    }
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter emails by search
  const filteredEmails = emailSearch
    ? personEmails.filter(e =>
        (e.subject || "").toLowerCase().includes(emailSearch.toLowerCase()) ||
        (e.from_addr || "").toLowerCase().includes(emailSearch.toLowerCase()) ||
        (e.to_addr || "").toLowerCase().includes(emailSearch.toLowerCase())
      )
    : personEmails;

  const handleAskQuery = async (question: string) => {
    if (!question.trim() || !activeTraceId) return;
    setQueryLoading(true);
    setQueryInput("");
    try {
      const res = await queryPerson(activeTraceId, node.id, question, persona || "soc_analyst");
      setQueryHistory(prev => [...prev, { q: question, a: res.answer }]);
    } catch {
      setQueryHistory(prev => [...prev, { q: question, a: "Failed to get a response. Please try again." }]);
    } finally {
      setQueryLoading(false);
    }
  };

  const TABS: { key: PersonTab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "emails", label: "Emails", badge: emailsFetched ? personEmails.length : undefined },
    { key: "ask", label: "Ask AI" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", overflowX: "hidden" }}>
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
        <StatBox label="Anomalous" value={anomalousEdges.length} color={anomalousEdges.length > 0 ? "var(--accent-red)" : undefined} icon={<AlertTriangle style={{ width: 12, height: 12 }} />} />
      </div>

      {/* Tab Bar */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--border)", padding: "0 12px",
      }}>
        {TABS.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: "8px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              background: "none", border: "none", borderBottom: `2px solid ${activeTab === key ? "var(--accent-blue)" : "transparent"}`,
              color: activeTab === key ? "var(--accent-blue)" : "var(--text-muted)",
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {label}
            {badge !== undefined && (
              <span style={{
                fontSize: 9, padding: "0 4px", borderRadius: 3, minWidth: 16, textAlign: "center",
                background: activeTab === key ? "rgba(59,130,246,0.15)" : "var(--bg-card)",
                color: activeTab === key ? "var(--accent-blue)" : "var(--text-muted)",
              }}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Behavioral Indicators */}
          {anomalousEdges.length > 0 && (
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.04em" }}>
                Behavioral Indicators
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6,
                  background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
                }}>
                  <AlertTriangle style={{ width: 12, height: 12, color: "var(--accent-red)", flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    <b>{anomalousEdges.length}</b> anomalous communication {anomalousEdges.length === 1 ? "link" : "links"} detected
                    {anomalousEdges[0] && (
                      <> (highest score: {(anomalousEdges[0].anomaly_score || 0).toFixed(1)})</>
                    )}
                  </span>
                </div>
                {totalEmails > 50 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6,
                    background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)",
                  }}>
                    <BarChart3 style={{ width: 12, height: 12, color: "var(--accent-amber, #f59e0b)", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                      High email volume: <b>{totalEmails}</b> total emails across {connectedEdges.length} connections
                    </span>
                  </div>
                )}
                {connectedEdges.length > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6,
                    background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
                  }}>
                    <Activity style={{ width: 12, height: 12, color: "var(--accent-blue)", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                      Top contact: <b>
                        {(() => {
                          const topEdge = connectedEdges[0];
                          const otherId = topEdge.source === node.id ? topEdge.target : topEdge.source;
                          return otherId.split("@")[0].replace(/\./g, " ").split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                        })()}
                      </b> ({connectedEdges[0].volume || 0} emails)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Explanation */}
          {(explanation || loadingExplanation) && (
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-blue)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6 }}>
                <Brain style={{ width: 12, height: 12 }} />
                AI Explanation
                {persona && persona !== "soc_analyst" && (
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--text-muted)", textTransform: "capitalize", letterSpacing: 0 }}>
                    ({persona.replace(/_/g, " ")})
                  </span>
                )}
              </h3>
              {loadingExplanation ? (
                <div className="skeleton" style={{ height: 60, borderRadius: 6 }} />
              ) : explanation ? (
                <div style={{
                  padding: 10, borderRadius: 6,
                  background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
                }}>
                  <p style={{
                    fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0,
                    whiteSpace: "pre-wrap",
                  }}>
                    {explanation.replace(/\*\*/g, "")}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {/* No trace message */}
          {!activeTraceId && relatedTraces.length === 0 && (
            <div style={{ padding: "12px 16px" }}>
              <div style={{
                padding: 12, borderRadius: 6, textAlign: "center",
                background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
              }}>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                  Run analysis with this employee selected to generate a reasoning trace.
                </p>
              </div>
            </div>
          )}

          {/* View Reasoning Trace button */}
          {!activeTraceId && relatedTraces.length > 0 && (
            <div style={{ padding: "8px 16px" }}>
              <button
                onClick={() => onSelectTrace(relatedTraces[0].trace_id)}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", background: "rgba(59,130,246,0.08)", color: "var(--accent-blue)",
                  border: "1px solid rgba(59,130,246,0.2)", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 6,
                }}
              >
                <Brain style={{ width: 12, height: 12 }} />
                View Reasoning Trace
              </button>
            </div>
          )}

          {/* Communications */}
          <div style={{ padding: 12 }}>
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
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: otherColor, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{otherDisplay}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{otherDept}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{edge.volume || 0} emails</span>
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
      )}

      {/* ── Emails Tab ── */}
      {activeTab === "emails" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Search */}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 8px", borderRadius: 6,
              background: "var(--bg-card)", border: "1px solid var(--border)",
            }}>
              <Search style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} />
              <input
                type="text"
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                placeholder="Filter by subject or contact..."
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  fontSize: 11, color: "var(--text-primary)", padding: 0,
                }}
              />
            </div>
          </div>

          {/* Email list */}
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {emailsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
                {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 6 }} />)}
              </div>
            ) : filteredEmails.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: 11 }}>
                {emailSearch ? "No emails match your search" : "No emails found for this person"}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {filteredEmails.map((email, i) => {
                  const isExpanded = expandedEmail === email.message_id;
                  const vaderScore = email.vader_compound ?? 0;
                  const sentimentColor = vaderScore > 0.3 ? "var(--accent-green)" : vaderScore < -0.3 ? "var(--accent-red)" : "var(--accent-amber)";
                  return (
                    <div key={email.message_id || i}>
                      <button
                        onClick={() => setExpandedEmail(isExpanded ? null : email.message_id)}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 8, width: "100%",
                          padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                          background: "var(--bg-card)",
                          border: `1px solid ${email.threat_category ? "rgba(239,68,68,0.2)" : "var(--border)"}`,
                          transition: "all 0.15s", textAlign: "left", color: "var(--text-primary)",
                        }}
                      >
                        {isExpanded
                          ? <ChevronDown style={{ width: 12, height: 12, marginTop: 2, flexShrink: 0, color: "var(--text-muted)" }} />
                          : <ChevronRight style={{ width: 12, height: 12, marginTop: 2, flexShrink: 0, color: "var(--text-muted)" }} />
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {email.subject || "(no subject)"}
                          </div>
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{email.from_addr?.split("@")[0]} → {email.to_addr?.split("@")[0]}</span>
                            <span>{email.date?.slice(0, 10)}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <div style={{
                            width: 32, height: 4, borderRadius: 2, background: "var(--bg-hover)",
                            overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${Math.abs(vaderScore) * 100}%`, height: "100%",
                              background: sentimentColor, borderRadius: 2,
                            }} />
                          </div>
                          {email.threat_category && (
                            <span style={{
                              fontSize: 8, padding: "1px 4px", borderRadius: 3,
                              background: "rgba(239,68,68,0.12)", color: "var(--accent-red)", fontWeight: 600,
                            }}>
                              {email.threat_category.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </button>
                      {isExpanded && email.body && (
                        <div style={{
                          margin: "0 0 4px 20px", padding: 10, borderRadius: "0 0 6px 6px",
                          background: "var(--bg-secondary)", border: "1px solid var(--border)", borderTop: "none",
                          fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.6,
                          maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap",
                        }}>
                          {email.body.slice(0, 1000)}{email.body.length > 1000 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Ask AI Tab ── */}
      {activeTab === "ask" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!activeTraceId ? (
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 8, padding: 24,
            }}>
              <Brain style={{ width: 28, height: 28, color: "var(--text-muted)", opacity: 0.3 }} />
              <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
                Run analysis first to enable AI queries about this person.
              </p>
            </div>
          ) : (
            <>
              {/* Suggested questions */}
              {queryHistory.length === 0 && (
                <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {[
                    "Why was this person flagged?",
                    "What keywords triggered alerts?",
                    "Summarize communication patterns",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => handleAskQuery(q)}
                      disabled={queryLoading}
                      style={{
                        padding: "4px 10px", borderRadius: 12, fontSize: 10,
                        background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
                        color: "var(--accent-blue)", cursor: "pointer", fontWeight: 500,
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Chat history */}
              <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {queryHistory.map((entry, i) => (
                  <div key={i}>
                    <div style={{
                      padding: "6px 10px", borderRadius: 8, marginBottom: 6,
                      background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)",
                      fontSize: 11, color: "var(--text-primary)", fontWeight: 500,
                    }}>
                      {entry.q}
                    </div>
                    <div style={{
                      padding: 10, borderRadius: 8,
                      background: "var(--bg-card)", border: "1px solid var(--border)",
                      fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                    }}>
                      {entry.a.replace(/\*\*/g, "")}
                    </div>
                  </div>
                ))}
                {queryLoading && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: 10,
                    color: "var(--text-muted)", fontSize: 11,
                  }}>
                    <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                    Analyzing...
                  </div>
                )}
              </div>

              {/* Input */}
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 8px", borderRadius: 8,
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                }}>
                  <input
                    type="text"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAskQuery(queryInput); } }}
                    placeholder="Ask about this person..."
                    disabled={queryLoading}
                    style={{
                      flex: 1, background: "none", border: "none", outline: "none",
                      fontSize: 11, color: "var(--text-primary)", padding: 0,
                    }}
                  />
                  <button
                    onClick={() => handleAskQuery(queryInput)}
                    disabled={!queryInput.trim() || queryLoading}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 24, height: 24, borderRadius: 6, cursor: "pointer",
                      background: queryInput.trim() ? "var(--accent-blue)" : "var(--bg-hover)",
                      border: "none", color: queryInput.trim() ? "white" : "var(--text-muted)",
                      transition: "all 0.15s",
                    }}
                  >
                    <Send style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", overflowX: "hidden" }}>
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
