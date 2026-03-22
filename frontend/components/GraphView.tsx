"use client";
import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { DEPARTMENT_COLORS } from "@/lib/constants";
import type { GraphNode, GraphEdge } from "@/lib/types";
import { Network, Search, ZoomIn, ZoomOut, Maximize2, X, Zap } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { StreamControl } from "./StreamControl";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

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
  const { theme } = useTheme();
  const [focusMode, setFocusMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showStream, setShowStream] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const SpriteTextRef = useRef<any>(null);
  const ThreeRef = useRef<any>(null);

  // Lazy-load Three.js and SpriteText (they need window)
  useEffect(() => {
    import("three").then((mod) => { ThreeRef.current = mod; });
    import("three-spritetext").then((mod) => { SpriteTextRef.current = mod.default; });
  }, []);

  // Configure forces after the graph mounts — adaptive to node count
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const nodeCount = nodes.length;
      const chargeStrength = nodeCount <= 5 ? -300 : nodeCount <= 15 ? -200 : -120;
      const linkDist = nodeCount <= 5 ? 100 : nodeCount <= 15 ? 60 : 30;
      const centerStrength = nodeCount <= 5 ? 0.3 : nodeCount <= 15 ? 0.15 : 0.08;

      fg.d3Force("charge")?.strength(chargeStrength).distanceMax(350);
      fg.d3Force("link")?.distance(linkDist);
      fg.d3Force("center")?.strength(centerStrength);
    } catch (_) { /* ok if forces not ready yet */ }
  }, [nodes, edges]);

  // Auto-zoom-to-fit when data changes
  useEffect(() => {
    if (!fgRef.current || nodes.length === 0) return;
    const timer = setTimeout(() => {
      fgRef.current?.zoomToFit(400, 60);
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes.length]);

  // Fix OrbitControls pointer error — intercept pointercancel to prevent race condition
  useEffect(() => {
    if (!fgRef.current) return;
    const renderer = fgRef.current.renderer?.();
    const canvas = renderer?.domElement;
    if (!canvas) return;
    const handler = (e: PointerEvent) => { e.stopPropagation(); };
    canvas.addEventListener("pointercancel", handler, { capture: true });
    return () => canvas.removeEventListener("pointercancel", handler, { capture: true } as EventListenerOptions);
  }, [nodes.length]);

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
    const fg = fgRef.current;
    const node = nodes.find((n) => n.id === nodeId) as any;
    if (fg && node) {
      const distance = 150;
      const nx = node.x || 0;
      const ny = node.y || 0;
      const nz = node.z || 0;
      const dist = Math.hypot(nx, ny, nz) || 1;
      const ratio = 1 + distance / dist;
      fg.cameraPosition(
        { x: nx * ratio, y: ny * ratio, z: nz * ratio },
        { x: nx, y: ny, z: nz },
        800
      );
    }
    setTimeout(() => setHighlightedNode(null), 3000);
  }, [nodes]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const { x, y, z } = fg.cameraPosition();
    const dist = Math.sqrt(x * x + y * y + z * z);
    if (dist < 10) {
      fg.zoomToFit(400, 40);
      return;
    }
    fg.cameraPosition(
      { x: x * 0.7, y: y * 0.7, z: z * 0.7 },
      { x: 0, y: 0, z: 0 },
      400
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const { x, y, z } = fg.cameraPosition();
    const dist = Math.sqrt(x * x + y * y + z * z);
    if (dist < 10) {
      fg.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 400);
      return;
    }
    fg.cameraPosition(
      { x: x * 1.4, y: y * 1.4, z: z * 1.4 },
      { x: 0, y: 0, z: 0 },
      400
    );
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

  // ── 3D Node rendering ──
  const nodeThreeObject = useCallback((node: any) => {
    const THREE = ThreeRef.current;
    const SpriteText = SpriteTextRef.current;
    if (!THREE || !SpriteText) {
      return new (require("three").Group)();
    }

    const deg = node.degree || 0.5;
    const isInvestigation = !hasFocus || (investigationNodes?.has(node.id) ?? false);
    const sizeMult = hasFocus ? (isInvestigation ? 1.3 : 0.4) : 1;
    const size = Math.max(1.5, Math.min(4, 1.5 + deg * 3)) * sizeMult;
    const color = DEPARTMENT_COLORS[node.department] || DEPARTMENT_COLORS.Unknown;
    const dimAlpha = hasFocus && !isInvestigation ? 0.12 : 1.0;

    const group = new THREE.Group();

    // Sphere — clean, no glow
    const geometry = new THREE.SphereGeometry(size, 12, 8);
    // In light mode, darken the department color for better contrast
    let sphereColor = color;
    if (theme === "light") {
      const c = new THREE.Color(color);
      c.multiplyScalar(0.7); // darken for light background
      sphereColor = `#${c.getHexString()}`;
    }
    const material = new THREE.MeshBasicMaterial({
      color: sphereColor,
      transparent: true,
      opacity: (theme === "light" ? 1.0 : 0.9) * dimAlpha,
    });
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);

    // Name label — clean, no background
    if (dimAlpha > 0.4) {
      const label = node.name || node.id.split("@")[0];
      const nameSprite = new SpriteText(label);
      nameSprite.color = theme === "light"
        ? `rgba(26,29,33,${dimAlpha * 0.85})`
        : `rgba(210,218,226,${dimAlpha * 0.85})`;
      const labelScale = nodes.length <= 5 ? 1.5 : 1.0;
      nameSprite.textHeight = Math.max(1.8, Math.min(3, 1.8 + deg * 1.2)) * labelScale;
      nameSprite.fontWeight = "500";
      nameSprite.backgroundColor = false;
      nameSprite.position.set(0, -(size + 2 + (nodes.length <= 5 ? 2 : 0)), 0);
      group.add(nameSprite);

      // Suspicion badge — smaller
      const score = node.suspicion_score;
      if (score != null && score > 15) {
        let badgeColor: string;
        if (score >= 70) badgeColor = "#ef4444";
        else if (score >= 40) badgeColor = "#f59e0b";
        else badgeColor = "#22c55e";

        const badge = new SpriteText(Math.round(score).toString());
        badge.color = "#ffffff";
        badge.backgroundColor = badgeColor;
        badge.padding = 1;
        badge.borderRadius = 2;
        badge.textHeight = 1.8;
        badge.fontWeight = "700";
        badge.position.set(size + 1.5, size + 1.5, 0);
        group.add(badge);
      }
    }

    return group;
  }, [hasFocus, investigationNodes, theme, nodes.length]);

  // ── 3D Link styling — clean, thin, minimal ──
  const linkWidth = useCallback((link: any) => {
    const anomaly = link.anomaly_score || 0;
    if (anomaly > 4) return 1.5;
    if (anomaly > 2) return 1.0;
    return Math.max(0.3, Math.min(0.6, (link.volume || 1) / 25));
  }, []);

  const linkColor = useCallback((link: any) => {
    const anomaly = link.anomaly_score || 0;
    const srcId = typeof link.source === "object" ? link.source.id : link.source;
    const tgtId = typeof link.target === "object" ? link.target.id : link.target;
    const isInvestigationEdge = !hasFocus || (investigationNodes?.has(srcId) && investigationNodes?.has(tgtId));

    if (hasFocus && !isInvestigationEdge) return theme === "light" ? "rgba(100, 110, 120, 0.06)" : "rgba(100, 110, 120, 0.06)";
    if (anomaly > 4) return "rgba(239, 68, 68, 0.9)";
    if (anomaly > 2) return `rgba(239, 68, 68, ${Math.min(0.8, 0.4 + anomaly / 10)})`;
    return theme === "light" ? "rgba(80, 90, 100, 0.35)" : "rgba(160, 175, 195, 0.55)";
  }, [hasFocus, investigationNodes, theme]);

  // ── Tooltips (HTML) ──
  const nodeLabel = useCallback((node: any) => {
    const score = node.suspicion_score;
    const scoreHtml = score != null && score > 0
      ? `<div style="color:${score >= 70 ? "#ef4444" : score >= 40 ? "#f59e0b" : "#22c55e"}">Suspicion: ${Math.round(score)}/100</div>`
      : "";
    const isLight = theme === "light";
    const ttBg = isLight ? "rgba(255,255,255,0.95)" : "rgba(22,27,34,0.95)";
    const ttBorder = isLight ? "rgba(216,221,228,0.8)" : "rgba(48,54,61,0.8)";
    const ttTitle = isLight ? "#1a1d21" : "#e6edf3";
    const ttSub = isLight ? "#57606a" : "#7d8590";
    return `<div style="background:${ttBg};padding:8px 12px;border-radius:6px;border:1px solid ${ttBorder};font-size:12px;font-family:Inter,-apple-system,sans-serif;line-height:1.5;">
      <div style="font-weight:600;color:${ttTitle};margin-bottom:2px">${node.name || node.id.split("@")[0]}</div>
      <div style="color:${ttSub}">Dept: ${node.department || "Unknown"}</div>
      <div style="color:${ttSub}">Connections: ${Math.round((node.degree || 0) * 100)}%</div>
      ${scoreHtml}
    </div>`;
  }, [theme]);

  const linkLabel = useCallback((link: any) => {
    const anomaly = link.anomaly_score || 0;
    if (anomaly <= 2) return "";
    const bg = theme === "light" ? "rgba(255,255,255,0.95)" : "rgba(22,27,34,0.95)";
    return `<div style="background:${bg};padding:4px 8px;border-radius:4px;font-size:11px;color:#ef4444;font-weight:600;font-family:Inter,-apple-system,sans-serif;border:1px solid ${theme === "light" ? "#d8dde4" : "#30363d"};">
      ${link.volume} emails &middot; ${anomaly.toFixed(1)}&sigma; anomaly
    </div>`;
  }, [theme]);

  // ── Hover effect ──
  const handleNodeHover = useCallback((node: any) => {
    hoveredNodeRef.current = node?.id || null;
    const el = containerRef.current;
    if (el) el.style.cursor = node ? "pointer" : "default";
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg-primary)",
      }}
    >
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10, background: theme === "light" ? "rgba(245,247,250,0.85)" : "rgba(11,14,17,0.85)", backdropFilter: "blur(4px)",
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
        <ForceGraph3D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          nodeLabel={nodeLabel}
          linkLabel={linkLabel}
          linkWidth={linkWidth}
          linkColor={linkColor}
          linkOpacity={0.8}
          onNodeClick={(node: any) => onNodeClick(node.id)}
          onNodeHover={handleNodeHover}
          onLinkClick={(link: any) =>
            onEdgeClick(
              typeof link.source === "object" ? link.source.id : link.source,
              typeof link.target === "object" ? link.target.id : link.target,
            )
          }
          backgroundColor={theme === "light" ? "#f0f2f5" : "#0b0e11"}
          controlType="orbit"
          cooldownTicks={200}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.25}
          warmupTicks={80}
          enableNodeDrag={true}
          enableNavigationControls={true}
          showNavInfo={false}
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

      {/* Stream control — bottom right above zoom */}
      <div style={{
        position: "absolute", bottom: showStream ? 12 : 120, right: 12,
        zIndex: 5,
      }}>
        {showStream ? (
          <div style={{
            width: 220,
            background: theme === "light" ? "rgba(255, 255, 255, 0.95)" : "rgba(22, 27, 34, 0.95)",
            border: "1px solid var(--border)",
            borderRadius: 8, backdropFilter: "blur(8px)", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 10px", borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)" }}>
                Stream Simulator
              </span>
              <button
                onClick={() => setShowStream(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <X style={{ width: 10, height: 10, color: "var(--text-muted)" }} />
              </button>
            </div>
            <StreamControl />
          </div>
        ) : (
          <button
            onClick={() => setShowStream(true)}
            title="Email Stream Simulator"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              cursor: "pointer", color: "var(--text-secondary)",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-blue)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            <Zap style={{ width: 12, height: 12 }} />
            Stream
          </button>
        )}
      </div>

      {/* Department legend — bottom left */}
      {displayNodes.length > 0 && showLegend && (
        <div style={{
          position: "absolute", bottom: 12, left: 12,
          padding: "8px 12px", borderRadius: 8,
          background: theme === "light" ? "rgba(255, 255, 255, 0.92)" : "rgba(22, 27, 34, 0.9)",
          border: "1px solid var(--border)",
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

      {/* 3D Controls hint */}
      {displayNodes.length > 0 && (
        <div style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          padding: "3px 10px", borderRadius: 4, fontSize: 9,
          background: theme === "light" ? "rgba(255,255,255,0.85)" : "rgba(22,27,34,0.8)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)", pointerEvents: "none",
        }}>
          Drag to rotate &middot; Scroll to zoom &middot; Right-drag to pan
        </div>
      )}
    </div>
  );
}
