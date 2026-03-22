"use client";
import { useState, useMemo } from "react";
import type { GraphNode, GraphEdge } from "@/lib/types";
import { DEPARTMENT_COLORS } from "@/lib/constants";
import { BarChart3, Grid3X3, TrendingUp } from "lucide-react";

interface PatternAnalyticsProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type Tab = "matrix" | "deviations" | "volume";

/** Build an NxN department communication matrix from edges */
function buildDeptMatrix(nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const depts = Array.from(new Set(nodes.map(n => n.department || "Unknown"))).sort();

  // Initialize matrix
  const matrix: Record<string, Record<string, { volume: number; anomaly_sum: number; count: number }>> = {};
  for (const d1 of depts) {
    matrix[d1] = {};
    for (const d2 of depts) {
      matrix[d1][d2] = { volume: 0, anomaly_sum: 0, count: 0 };
    }
  }

  for (const e of edges) {
    const srcNode = nodeMap.get(e.source);
    const tgtNode = nodeMap.get(e.target);
    if (!srcNode || !tgtNode) continue;
    const srcDept = srcNode.department || "Unknown";
    const tgtDept = tgtNode.department || "Unknown";
    matrix[srcDept][tgtDept].volume += e.volume;
    matrix[srcDept][tgtDept].anomaly_sum += e.anomaly_score;
    matrix[srcDept][tgtDept].count += 1;
  }

  return { depts, matrix };
}

/** Compute per-person behavioral stats from edges */
function computeDeviations(nodes: GraphNode[], edges: GraphEdge[]) {
  const stats = new Map<string, { name: string; dept: string; volume: number; anomaly_sum: number; edge_count: number; anomalous_edges: number }>();

  for (const e of edges) {
    for (const pid of [e.source, e.target]) {
      if (!stats.has(pid)) {
        const node = nodes.find(n => n.id === pid);
        const name = node?.name || pid.split("@")[0].replace(/\./g, " ");
        stats.set(pid, { name, dept: node?.department || "Unknown", volume: 0, anomaly_sum: 0, edge_count: 0, anomalous_edges: 0 });
      }
      const s = stats.get(pid)!;
      s.volume += e.volume;
      s.anomaly_sum += e.anomaly_score;
      s.edge_count += 1;
      if (e.anomaly_score > 2) s.anomalous_edges += 1;
    }
  }

  // Compute deviation score: weighted combo
  return Array.from(stats.values()).map(s => ({
    ...s,
    deviation: (s.anomaly_sum * 2) + (s.anomalous_edges * 10) + (s.volume * 0.1),
    displayName: s.name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
  })).sort((a, b) => b.deviation - a.deviation);
}

/** Volume by department */
function computeVolumeByDept(nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const deptStats = new Map<string, { sent: number; received: number; anomalous: number }>();

  for (const e of edges) {
    const srcDept = nodeMap.get(e.source)?.department || "Unknown";
    const tgtDept = nodeMap.get(e.target)?.department || "Unknown";

    if (!deptStats.has(srcDept)) deptStats.set(srcDept, { sent: 0, received: 0, anomalous: 0 });
    if (!deptStats.has(tgtDept)) deptStats.set(tgtDept, { sent: 0, received: 0, anomalous: 0 });

    deptStats.get(srcDept)!.sent += e.volume;
    deptStats.get(tgtDept)!.received += e.volume;
    if (e.anomaly_score > 2) {
      deptStats.get(srcDept)!.anomalous += 1;
      deptStats.get(tgtDept)!.anomalous += 1;
    }
  }

  return Array.from(deptStats.entries())
    .map(([dept, s]) => ({ dept, ...s, total: s.sent + s.received }))
    .sort((a, b) => b.total - a.total);
}

function DeptMatrix({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const { depts, matrix } = useMemo(() => buildDeptMatrix(nodes, edges), [nodes, edges]);

  // Find max volume for color scaling
  let maxVol = 1;
  for (const d1 of depts) for (const d2 of depts) {
    if (matrix[d1][d2].volume > maxVol) maxVol = matrix[d1][d2].volume;
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
        Cross-department communication frequency. Brighter = more emails.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ fontSize: 9, padding: 4, textAlign: "left", color: "var(--text-muted)" }}></th>
              {depts.map(d => (
                <th key={d} style={{
                  fontSize: 8, padding: 4, textAlign: "center",
                  color: DEPARTMENT_COLORS[d] || "var(--text-muted)",
                  fontWeight: 600, writingMode: "vertical-lr",
                  maxWidth: 24, whiteSpace: "nowrap",
                }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {depts.map(row => (
              <tr key={row}>
                <td style={{
                  fontSize: 9, padding: "4px 6px", fontWeight: 600, whiteSpace: "nowrap",
                  color: DEPARTMENT_COLORS[row] || "var(--text-muted)",
                }}>
                  {row}
                </td>
                {depts.map(col => {
                  const cell = matrix[row][col];
                  const intensity = cell.volume / maxVol;
                  const hasAnomaly = cell.anomaly_sum > 2 * cell.count;
                  const bg = hasAnomaly
                    ? `rgba(239, 68, 68, ${0.1 + intensity * 0.6})`
                    : `rgba(6, 182, 212, ${intensity * 0.5})`;
                  return (
                    <td key={col} title={`${row} → ${col}: ${cell.volume} emails, avg anomaly ${cell.count ? (cell.anomaly_sum / cell.count).toFixed(1) : 0}σ`}
                      style={{
                        padding: 0, width: 28, height: 28, textAlign: "center",
                        background: cell.volume > 0 ? bg : "transparent",
                        border: "1px solid var(--border)", cursor: "default",
                        fontSize: 8, color: intensity > 0.3 ? "white" : "var(--text-muted)",
                        fontFamily: "monospace",
                      }}>
                      {cell.volume > 0 ? cell.volume : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeviationList({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const deviations = useMemo(() => computeDeviations(nodes, edges), [nodes, edges]);
  const top = deviations.slice(0, 15);
  const maxDev = top[0]?.deviation || 1;

  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
        People ranked by behavioral deviation. Higher scores indicate more anomalous communication patterns.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {top.map((p, i) => (
          <div key={p.name + i} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 8px", borderRadius: 4,
            background: i < 3 ? "rgba(239,68,68,0.06)" : "var(--bg-card)",
            border: i < 3 ? "1px solid rgba(239,68,68,0.15)" : "1px solid var(--border)",
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: "monospace",
              color: i < 3 ? "var(--accent-red)" : "var(--text-muted)",
              width: 16, textAlign: "right",
            }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.displayName}
              </div>
              <div style={{ fontSize: 9, color: DEPARTMENT_COLORS[p.dept] || "var(--text-muted)" }}>
                {p.dept} · {p.volume} emails · {p.anomalous_edges} anomalous
              </div>
            </div>
            {/* Deviation bar */}
            <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--bg-primary)" }}>
              <div style={{
                height: "100%", borderRadius: 3,
                width: `${(p.deviation / maxDev) * 100}%`,
                background: i < 3 ? "var(--accent-red)" : "var(--accent-cyan)",
              }} />
            </div>
            <span style={{
              fontSize: 10, fontFamily: "monospace", fontWeight: 600,
              color: i < 3 ? "var(--accent-red)" : "var(--text-secondary)",
              width: 36, textAlign: "right",
            }}>
              {p.deviation.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VolumeByDept({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const deptVol = useMemo(() => computeVolumeByDept(nodes, edges), [nodes, edges]);
  const maxTotal = deptVol[0]?.total || 1;

  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
        Email volume by department. Red markers indicate anomalous edge count.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {deptVol.map(d => (
          <div key={d.dept}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: DEPARTMENT_COLORS[d.dept] || "var(--text-muted)" }}>
                {d.dept}
              </span>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>
                {d.total} emails
                {d.anomalous > 0 && (
                  <span style={{ color: "var(--accent-red)", marginLeft: 6 }}>
                    {d.anomalous} anomalous
                  </span>
                )}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--bg-primary)", overflow: "hidden", display: "flex" }}>
              <div style={{
                height: "100%",
                width: `${((d.total - d.anomalous * 5) / maxTotal) * 100}%`,
                background: DEPARTMENT_COLORS[d.dept] || "var(--accent-cyan)",
                opacity: 0.6,
              }} />
              {d.anomalous > 0 && (
                <div style={{
                  height: "100%",
                  width: `${(d.anomalous * 5 / maxTotal) * 100}%`,
                  background: "var(--accent-red)",
                  opacity: 0.8,
                }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PatternAnalytics({ nodes, edges }: PatternAnalyticsProps) {
  const [tab, setTab] = useState<Tab>("matrix");

  if (!nodes.length || !edges.length) {
    return (
      <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)" }}>
        <BarChart3 style={{ width: 32, height: 32, opacity: 0.3, margin: "0 auto 12px" }} />
        <p style={{ fontSize: 12 }}>No graph data available.</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>Run a threat analysis to see communication patterns.</p>
      </div>
    );
  }

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: "matrix", icon: <Grid3X3 style={{ width: 12, height: 12 }} />, label: "Dept Matrix" },
    { key: "deviations", icon: <TrendingUp style={{ width: 12, height: 12 }} />, label: "Deviations" },
    { key: "volume", icon: <BarChart3 style={{ width: 12, height: 12 }} />, label: "Volume" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, padding: "2px", borderRadius: 6, background: "var(--bg-primary)" }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              padding: "6px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
              cursor: "pointer", border: "none",
              background: tab === t.key ? "var(--bg-card)" : "transparent",
              color: tab === t.key ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "matrix" && <DeptMatrix nodes={nodes} edges={edges} />}
      {tab === "deviations" && <DeviationList nodes={nodes} edges={edges} />}
      {tab === "volume" && <VolumeByDept nodes={nodes} edges={edges} />}
    </div>
  );
}
