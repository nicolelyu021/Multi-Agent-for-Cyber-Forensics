"use client";
import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { DEPARTMENT_COLORS } from "@/lib/constants";
import type { GraphNode, GraphEdge } from "@/lib/types";
import { Network } from "lucide-react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  loading: boolean;
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (source: string, target: string, traceId?: string) => void;
}

export function GraphView({ nodes, edges, loading, onNodeClick, onEdgeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Configure forces after the graph mounts — spread nodes apart
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      fg.d3Force("charge")?.strength(-150).distanceMax(350);
      fg.d3Force("link")?.distance(70);
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

  // Memoize to prevent react-force-graph from restarting the simulation
  const graphData = useMemo(() => ({
    nodes: nodes.map((n) => ({ ...n, id: n.id })),
    links: edges.map((e) => ({
      source: e.source,
      target: e.target,
      volume: e.volume,
      anomaly_score: e.anomaly_score,
    })),
  }), [nodes, edges]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    if (node.x == null || node.y == null || !isFinite(node.x) || !isFinite(node.y)) return;

    const deg = node.degree || 0.5;
    // Smaller nodes: range 4–12px instead of 6–20px
    const size = Math.max(4, Math.min(12, 4 + deg * 8));
    const color = DEPARTMENT_COLORS[node.department] || DEPARTMENT_COLORS.Unknown;

    // Subtle outer glow only for high-degree nodes
    if ((node.degree || 0) > 0.6) {
      try {
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI);
        const grad = ctx.createRadialGradient(node.x, node.y, size, node.x, node.y, size + 4);
        grad.addColorStop(0, `${color}30`);
        grad.addColorStop(1, `${color}00`);
        ctx.fillStyle = grad;
        ctx.fill();
      } catch (_) { /* skip glow if coords invalid */ }
    }

    // Node body — solid circle with slight opacity
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Thin border
    ctx.strokeStyle = `${color}`;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Label — larger font, offset below node
    const label = node.name || node.id.split("@")[0];
    const fontSize = Math.max(3.5, Math.min(5, 3 + deg * 3));
    ctx.font = `600 ${fontSize}px -apple-system, "Inter", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(232,236,244,0.85)";
    ctx.fillText(label, node.x, node.y + size + 2);
  }, []);

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
    // Edge width scales with volume — visible but not overpowering
    const width = Math.max(0.4, Math.min(2.5, volume / 12));

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);

    if (isAnomalous) {
      const alpha = Math.min(0.85, 0.3 + anomaly / 6);
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.lineWidth = width * 1.8;
      ctx.setLineDash([]);
      // Glow effect
      ctx.shadowColor = "rgba(239, 68, 68, 0.4)";
      ctx.shadowBlur = 6;
    } else {
      // Normal edges — visible light blue/white lines
      const alpha = Math.min(0.5, 0.1 + volume / 30);
      ctx.strokeStyle = `rgba(139, 157, 195, ${alpha})`;
      ctx.lineWidth = width;
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Animated particle on anomalous edges
    if (isAnomalous) {
      const t = (Date.now() % 2000) / 2000;
      const px = src.x + (tgt.x - src.x) * t;
      const py = src.y + (tgt.y - src.y) * t;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, 2 * Math.PI);
      ctx.fillStyle = "#ef4444";
      ctx.shadowColor = "rgba(239,68,68,0.5)";
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Small arrow to show direction
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
      ctx.strokeStyle = isAnomalous ? "rgba(239,68,68,0.5)" : "rgba(139,157,195,0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg-primary)",
        backgroundImage: "radial-gradient(circle at 50% 50%, rgba(59,130,246,0.03) 0%, transparent 70%)",
      }}
    >
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10, background: "rgba(6,10,19,0.8)", backdropFilter: "blur(4px)",
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
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>No graph data</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.6 }}>
              Ensure Neo4j is running and seeded
            </p>
          </div>
        </div>
      )}

      {nodes.length > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={nodeCanvasObject}
          linkCanvasObject={linkCanvasObject}
          onNodeClick={(node: any) => onNodeClick(node.id)}
          onLinkClick={(link: any) =>
            onEdgeClick(link.source.id || link.source, link.target.id || link.target)
          }
          backgroundColor="transparent"
          cooldownTicks={120}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          nodeRelSize={4}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          warmupTicks={50}
          linkDirectionalParticles={0}
        />
      )}

      {/* Stats overlay */}
      {nodes.length > 0 && (
        <div style={{
          position: "absolute", top: 12, left: 12, display: "flex", gap: 8,
        }}>
          <div className="badge" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            {nodes.length} nodes
          </div>
          <div className="badge" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            {edges.length} edges
          </div>
          {edges.filter(e => e.anomaly_score > 2).length > 0 && (
            <div className="badge" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--accent-red)" }}>
              {edges.filter(e => e.anomaly_score > 2).length} anomalous
            </div>
          )}
        </div>
      )}
    </div>
  );
}
