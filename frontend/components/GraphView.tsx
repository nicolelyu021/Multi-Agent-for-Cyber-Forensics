"use client";
import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { DEPARTMENT_COLORS } from "@/lib/constants";
import type { GraphNode, GraphEdge } from "@/lib/types";
import { Network, Search, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  loading: boolean;
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (source: string, target: string, traceId?: string) => void;
  investigationNodes?: Set<string>;
  simplified?: boolean;
}

export function GraphView({ nodes, edges, loading, onNodeClick, onEdgeClick, investigationNodes, simplified }: GraphViewProps) {
  const [focusMode, setFocusMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Configure forces after the graph mounts
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      fg.d3Force("charge")?.strength(-350).distanceMax(500);
      fg.d3Force("link")?.distance(110);
      fg.d3Force("center")?.strength(0.05);
    } catch (_) { /* ok if forces not ready yet */ }
  }, [nodes, edges]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    update();
    const obs = new ResizeObserver(() => update());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Search functionality
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes.filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        n.name?.toLowerCase().includes(q) ||
        n.department?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [searchQuery, nodes]);

  const handleSearchSelect = useCallback((nodeId: string) => {
    setHighlightedNode(nodeId);
    setSearchQuery("");
    setSearchFocused(false);
    // Zoom to node
    const fg = fgRef.current;
    const node = nodes.find((n) => n.id === nodeId);
    if (fg && node?.x != null && node?.y != null) {
      fg.centerAt(node.x, node.y, 800);
      fg.zoom(5, 800);
    }
    // Clear highlight after 3s
    setTimeout(() => setHighlightedNode(null), 3000);
  }, [nodes]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    const fg = fgRef.current;
    if (fg) {
      const currentZoom = fg.zoom();
      fg.zoom(currentZoom * 1.5, 400);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const fg = fgRef.current;
    if (fg) {
      const currentZoom = fg.zoom();
      fg.zoom(currentZoom / 1.5, 400);
    }
  }, []);

  const handleZoomFit = useCallback(() => {
    fgRef.current?.zoomToFit(400, 40);
  }, []);

  // For simplified (executive) mode, only show anomalous subgraph
  const displayNodes = useMemo(() => {
    if (!simplified) return nodes;
    const anomalousNodeIds = new Set<string>();
    edges.forEach((e) => {
      if (e.anomaly_score > 2) {
        anomalousNodeIds.add(e.source);
        anomalousNodeIds.add(e.target);
      }
    });
    return nodes.filter((n) => anomalousNodeIds.has(n.id));
  }, [nodes, edges, simplified]);

  const displayEdges = useMemo(() => {
    if (!simplified) return edges;
    const nodeIds = new Set(displayNodes.map((n) => n.id));
    return edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [edges, displayNodes, simplified]);

  const graphData = useMemo(() => ({
    nodes: displayNodes.map((n) => ({ ...n, id: n.id })),
    links: displayEdges.map((e) => ({
      source: e.source,
      target: e.target,
      volume: e.volume,
      anomaly_score: e.anomaly_score,
    })),
  }), [displayNodes, displayEdges]);

  const hasFocus = investigationNodes && investigationNodes.size > 0 && focusMode;

  // Get departments actually present in data
  const activeDepartments = useMemo(() => {
    const depts = new Set<string>();
    displayNodes.forEach((n) => { if (n.department) depts.add(n.department); });
    return Array.from(depts).sort();
  }, [displayNodes]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    if (node.x == null || node.y == null || !isFinite(node.x) || !isFinite(node.y)) return;

    const deg = node.degree || 0.5;
    const isInvestigation = !hasFocus || (investigationNodes?.has(node.id) ?? false);
    const sizeMult = hasFocus ? (isInvestigation ? 1.4 : 0.5) : 1;
    const size = Math.max(6, Math.min(16, 6 + deg * 10)) * sizeMult;
    const color = DEPARTMENT_COLORS[node.department] || DEPARTMENT_COLORS.Unknown;
    const isHovered = node.id === hoveredNodeRef.current;
    const isHighlighted = node.id === highlightedNode;
    const dimAlpha = hasFocus && !isInvestigation && !isHovered ? 0.12 : 1.0;

    // Highlight pulse for search result
    if (isHighlighted) {
      ctx.beginPath();
      const pulseSize = size + 12 + Math.sin(Date.now() / 200) * 4;
      ctx.arc(node.x, node.y, pulseSize, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}30`;
      ctx.fill();
    }

    // Outer glow
    if (((node.degree || 0) > 0.6 || isHovered || isHighlighted || (hasFocus && isInvestigation)) && dimAlpha > 0.5) {
      try {
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + (isHovered ? 6 : 4), 0, 2 * Math.PI);
        const grad = ctx.createRadialGradient(node.x, node.y, size, node.x, node.y, size + (isHovered ? 6 : 4));
        grad.addColorStop(0, isHovered ? `${color}50` : `${color}30`);
        grad.addColorStop(1, `${color}00`);
        ctx.fillStyle = grad;
        ctx.globalAlpha = dimAlpha;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      } catch (_) { /* skip glow */ }
    }

    // Node body
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = isHovered || isHighlighted ? 1.0 : 0.85 * dimAlpha;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Border ring
    if (dimAlpha > 0.5 || isHovered || isHighlighted) {
      ctx.strokeStyle = isHovered || isHighlighted ? "#ffffff" : color;
      ctx.lineWidth = isHovered || isHighlighted ? 1.5 : 0.5;
      ctx.stroke();
    }

    // Labels
    if (dimAlpha > 0.5 || isHovered || isHighlighted) {
      const label = node.name || node.id.split("@")[0];
      const fontSize = Math.max(4, Math.min(6, 3.5 + deg * 3)) * (hasFocus && isInvestigation ? 1.3 : 1);
      ctx.font = `600 ${fontSize}px "Inter", -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isHovered || isHighlighted ? "rgba(230,237,243,1)" : "rgba(230,237,243,0.85)";
      ctx.fillText(label, node.x, node.y + size + 2);

      if (node.department && node.department !== "Unknown") {
        ctx.font = `400 3px "Inter", -apple-system, sans-serif`;
        ctx.fillStyle = "rgba(125,133,144,0.6)";
        ctx.fillText(node.department, node.x, node.y + size + 2 + fontSize + 1);
      }

      // Suspicion score badge
      const score = node.suspicion_score;
      if (score != null && score > 0) {
        const badgeX = node.x + size + 2;
        const badgeY = node.y - size - 2;
        const badgeR = 6;
        let badgeColor: string;
        if (score >= 70) badgeColor = "#ef4444";
        else if (score >= 40) badgeColor = "#f59e0b";
        else if (score >= 15) badgeColor = "#22c55e";
        else badgeColor = "rgba(125,133,144,0.5)";

        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, 2 * Math.PI);
        ctx.fillStyle = badgeColor;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.font = `700 4px "Inter", -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(Math.round(score).toString(), badgeX, badgeY);
      }
    }

    // Hover tooltip (draw as canvas text near cursor)
    if (isHovered && node.id === hoveredNodeRef.current) {
      const tooltipX = node.x + size + 12;
      const tooltipY = node.y - 20;
      const lines = [
        node.name || node.id.split("@")[0],
        `Dept: ${node.department || "Unknown"}`,
        `Connections: ${Math.round((node.degree || 0) * 100)}%`,
      ];
      if (node.suspicion_score != null && node.suspicion_score > 0) {
        lines.push(`Suspicion: ${Math.round(node.suspicion_score)}/100`);
      }

      // Background
      const lineH = 10;
      const padding = 6;
      const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padding * 2 + 10;
      const totalH = lines.length * lineH + padding * 2;
      ctx.fillStyle = "rgba(22, 27, 34, 0.95)";
      ctx.beginPath();
      const r = 4;
      ctx.moveTo(tooltipX + r, tooltipY);
      ctx.lineTo(tooltipX + maxW - r, tooltipY);
      ctx.quadraticCurveTo(tooltipX + maxW, tooltipY, tooltipX + maxW, tooltipY + r);
      ctx.lineTo(tooltipX + maxW, tooltipY + totalH - r);
      ctx.quadraticCurveTo(tooltipX + maxW, tooltipY + totalH, tooltipX + maxW - r, tooltipY + totalH);
      ctx.lineTo(tooltipX + r, tooltipY + totalH);
      ctx.quadraticCurveTo(tooltipX, tooltipY + totalH, tooltipX, tooltipY + totalH - r);
      ctx.lineTo(tooltipX, tooltipY + r);
      ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + r, tooltipY);
      ctx.fill();
      ctx.strokeStyle = "rgba(48, 54, 61, 0.8)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Text
      lines.forEach((line, i) => {
        ctx.font = i === 0 ? `600 7px "Inter", sans-serif` : `400 6px "Inter", sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = i === 0 ? "rgba(230,237,243,1)" : "rgba(125,133,144,0.9)";
        ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineH);
      });
    }
  }, [hasFocus, investigationNodes, highlightedNode]);

  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const src = link.source;
    const tgt = link.target;
    if (
      src == null || tgt == null ||
      src.x == null || src.y == null || tgt.x == null || tgt.y == null ||
      !isFinite(src.x) || !isFinite(src.y) || !isFinite(tgt.x) || !isFinite(tgt.y)
    ) return;

    const anomaly = link.anomaly_score || 0;
    const isAnomalous = anomaly > 2;
    const volume = link.volume || 1;
    const width = Math.max(0.4, Math.min(2.5, volume / 12));

    const srcId = typeof src === "object" ? src.id : src;
    const tgtId = typeof tgt === "object" ? tgt.id : tgt;
    const isInvestigationEdge = !hasFocus || (investigationNodes?.has(srcId) && investigationNodes?.has(tgtId));
    if (hasFocus && !isInvestigationEdge) {
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = "rgba(125, 133, 144, 0.04)";
      ctx.lineWidth = 0.3;
      ctx.stroke();
      return;
    }

    const hovered = hoveredNodeRef.current;
    const isHighlighted = hovered != null && (srcId === hovered || tgtId === hovered);

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);

    if (isAnomalous) {
      const alpha = Math.min(0.9, 0.35 + anomaly / 5);
      ctx.strokeStyle = `rgba(239, 68, 68, ${isHighlighted ? Math.min(1, alpha + 0.3) : alpha})`;
      ctx.lineWidth = Math.max(1.5, width * 2.5);
      ctx.setLineDash([]);
      ctx.shadowColor = "rgba(239, 68, 68, 0.6)";
      ctx.shadowBlur = isHighlighted ? 14 : 10;
    } else {
      const alpha = isHighlighted
        ? Math.min(0.8, 0.3 + volume / 20)
        : Math.min(0.5, 0.1 + volume / 30);
      ctx.strokeStyle = isHighlighted
        ? `rgba(59, 130, 246, ${alpha})`
        : `rgba(125, 133, 144, ${alpha})`;
      ctx.lineWidth = isHighlighted ? width * 1.5 : width;
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Edge label for anomalous edges
    if (isAnomalous) {
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;

      // Label background
      const label = `${volume} · ${anomaly.toFixed(1)}σ`;
      ctx.font = `600 4px "Inter", sans-serif`;
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(22, 27, 34, 0.85)";
      ctx.fillRect(midX - textW / 2 - 3, midY - 5, textW + 6, 9);

      // Label text
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
      ctx.fillText(label, midX, midY);
    }

    // Animated particles on anomalous edges
    if (isAnomalous) {
      const t = (Date.now() % 2000) / 2000;
      const px = src.x + (tgt.x - src.x) * t;
      const py = src.y + (tgt.y - src.y) * t;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = "#ff6b6b";
      ctx.shadowColor = "rgba(239,68,68,0.8)";
      ctx.shadowBlur = 8;
      ctx.fill();
      const t2 = ((Date.now() % 2000) / 2000 + 0.85) % 1;
      const px2 = src.x + (tgt.x - src.x) * t2;
      const py2 = src.y + (tgt.y - src.y) * t2;
      ctx.beginPath();
      ctx.arc(px2, py2, 2, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(239,68,68,0.5)";
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Direction arrow
    if (volume > 3) {
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      const arrowLen = 3;
      ctx.beginPath();
      ctx.moveTo(
        midX + arrowLen * Math.cos(angle - Math.PI / 6),
        midY + arrowLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(midX, midY);
      ctx.lineTo(
        midX + arrowLen * Math.cos(angle + Math.PI / 6),
        midY + arrowLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.strokeStyle = isAnomalous ? "rgba(239,68,68,0.5)" : "rgba(125,133,144,0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }, [hasFocus, investigationNodes]);

  const handleNodeHover = useCallback((node: any) => {
    hoveredNodeRef.current = node?.id || null;
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg-primary)",
        backgroundImage:
          "linear-gradient(rgba(59,130,246,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.025) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10, background: "rgba(11,14,17,0.85)", backdropFilter: "blur(4px)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              border: "2px solid var(--accent-blue)", borderTopColor: "transparent",
              animation: "spin 1s linear infinite",
            }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading graph data...</span>
          </div>
        </div>
      )}

      {nodes.length === 0 && !loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ textAlign: "center" }}>
            <Network style={{ width: 40, height: 40, color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>No graph data yet</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.6, lineHeight: 1.6 }}>
              Select a date range and run<br />Threat Analysis to visualize the<br />communication network
            </p>
          </div>
        </div>
      )}

      {displayNodes.length > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={nodeCanvasObject}
          linkCanvasObject={linkCanvasObject}
          onNodeClick={(node: any) => onNodeClick(node.id)}
          onNodeHover={handleNodeHover}
          onLinkClick={(link: any) =>
            onEdgeClick(link.source.id || link.source, link.target.id || link.target)
          }
          backgroundColor="transparent"
          cooldownTicks={200}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.25}
          nodeRelSize={4}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          warmupTicks={80}
          linkDirectionalParticles={0}
        />
      )}

      {/* Stats overlay — top left */}
      {displayNodes.length > 0 && (
        <div style={{
          position: "absolute", top: 12, left: 12, display: "flex", gap: 6,
        }}>
          <div style={{
            padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500,
            background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)",
          }}>
            {displayNodes.length} nodes
          </div>
          <div style={{
            padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500,
            background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)",
          }}>
            {displayEdges.length} edges
          </div>
          {displayEdges.filter(e => e.anomaly_score > 2).length > 0 && (
            <div style={{
              padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500,
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "var(--accent-red)",
            }}>
              {displayEdges.filter(e => e.anomaly_score > 2).length} anomalous
            </div>
          )}
        </div>
      )}

      {/* Search bar — top center */}
      {displayNodes.length > 0 && (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          zIndex: 5,
        }}>
          <div style={{ position: "relative" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 8,
              background: "var(--bg-card)", border: `1px solid ${searchFocused ? "var(--accent-blue)" : "var(--border)"}`,
              transition: "border-color 0.15s",
              minWidth: 200,
            }}>
              <Search style={{ width: 12, height: 12, color: "var(--text-muted)" }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search people... ( / )"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults.length > 0) {
                    handleSearchSelect(searchResults[0].id);
                  }
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    setSearchFocused(false);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                style={{
                  background: "transparent", border: "none", outline: "none",
                  color: "var(--text-primary)", fontSize: 11, fontFamily: "inherit",
                  width: 160,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <X style={{ width: 10, height: 10, color: "var(--text-muted)" }} />
                </button>
              )}
            </div>

            {/* Search dropdown */}
            {searchFocused && searchResults.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}>
                {searchResults.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleSearchSelect(node.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "8px 12px",
                      background: "transparent", border: "none", cursor: "pointer",
                      color: "var(--text-primary)", fontSize: 11, textAlign: "left",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: DEPARTMENT_COLORS[node.department] || DEPARTMENT_COLORS.Unknown,
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{node.name || node.id.split("@")[0]}</div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{node.department}</div>
                    </div>
                    {node.suspicion_score != null && node.suspicion_score > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                        background: `${node.suspicion_score >= 70 ? "#ef4444" : node.suspicion_score >= 40 ? "#f59e0b" : "#22c55e"}18`,
                        color: node.suspicion_score >= 70 ? "#ef4444" : node.suspicion_score >= 40 ? "#f59e0b" : "#22c55e",
                      }}>
                        {Math.round(node.suspicion_score)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Focus mode toggle — top right */}
      {investigationNodes && investigationNodes.size > 0 && (
        <button
          onClick={() => setFocusMode(!focusMode)}
          style={{
            position: "absolute", top: 12, right: 12,
            padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
            cursor: "pointer", transition: "all 0.15s",
            background: focusMode ? "rgba(59,130,246,0.15)" : "var(--bg-card)",
            color: focusMode ? "var(--accent-blue)" : "var(--text-muted)",
            border: `1px solid ${focusMode ? "rgba(59,130,246,0.4)" : "var(--border)"}`,
          }}
        >
          {focusMode ? "Show All" : "Focus Investigation"}
        </button>
      )}

      {/* Zoom controls — bottom right */}
      {displayNodes.length > 0 && (
        <div style={{
          position: "absolute", bottom: 12, right: 12, display: "flex", flexDirection: "column", gap: 4,
        }}>
          {[
            { icon: ZoomIn, action: handleZoomIn, label: "Zoom in" },
            { icon: ZoomOut, action: handleZoomOut, label: "Zoom out" },
            { icon: Maximize2, action: handleZoomFit, label: "Fit" },
          ].map(({ icon: Icon, action, label }) => (
            <button
              key={label}
              onClick={action}
              title={label}
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--bg-card)", border: "1px solid var(--border)",
                cursor: "pointer", color: "var(--text-secondary)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-blue)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              <Icon style={{ width: 14, height: 14 }} />
            </button>
          ))}
        </div>
      )}

      {/* Department legend — bottom left */}
      {displayNodes.length > 0 && showLegend && (
        <div style={{
          position: "absolute", bottom: 12, left: 12,
          padding: "8px 12px", borderRadius: 8,
          background: "rgba(22, 27, 34, 0.9)", border: "1px solid var(--border)",
          backdropFilter: "blur(8px)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Departments
            </span>
            <button
              onClick={() => setShowLegend(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <X style={{ width: 8, height: 8, color: "var(--text-muted)" }} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {activeDepartments.map((dept) => (
              <div key={dept} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: DEPARTMENT_COLORS[dept] || DEPARTMENT_COLORS.Unknown,
                }} />
                <span style={{ fontSize: 9, color: "var(--text-secondary)" }}>{dept}</span>
              </div>
            ))}
            {/* Anomaly legend */}
            <div style={{ marginTop: 3, paddingTop: 3, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 12, height: 2, borderRadius: 1,
                  background: "#ef4444", boxShadow: "0 0 4px rgba(239,68,68,0.6)",
                }} />
                <span style={{ fontSize: 9, color: "var(--accent-red)" }}>Anomalous edge</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend toggle if hidden */}
      {displayNodes.length > 0 && !showLegend && (
        <button
          onClick={() => setShowLegend(true)}
          style={{
            position: "absolute", bottom: 12, left: 12,
            padding: "4px 8px", borderRadius: 4, fontSize: 9,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            color: "var(--text-muted)", cursor: "pointer",
          }}
        >
          Legend
        </button>
      )}
    </div>
  );
}
