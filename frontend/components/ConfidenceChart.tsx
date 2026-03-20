"use client";
import { useMemo } from "react";
import type { ForensicRecord } from "@/lib/types";

interface ConfidenceChartProps {
  records: ForensicRecord[];
  onStageClick?: (agentId: string) => void;
}

interface ChartPoint {
  agentId: string;
  label: string;
  confidence: number;
  color: string;
}

const AGENT_COLORS: Record<string, string> = {
  investigator: "#3b82f6",
  sentiment_analyzer: "#a855f7",
  deliberation: "#f59e0b",
  escalation: "#ef4444",
};

export function ConfidenceChart({ records, onStageClick }: ConfidenceChartProps) {
  const dataPoints = useMemo((): ChartPoint[] => {
    const points: ChartPoint[] = [];

    const findRecord = (agentId: string, eventType: string) =>
      records.find((r) =>
        r.agent_id === agentId &&
        (r.event_type === eventType || r.event_type === "agent_end")
      );

    const inv = findRecord("investigator", "agent_end");
    if (inv?.confidence_score != null) {
      points.push({
        agentId: "investigator",
        label: "Investigator",
        confidence: inv.confidence_score,
        color: AGENT_COLORS.investigator,
      });
    }

    const sent = findRecord("sentiment_analyzer", "agent_end");
    if (sent?.confidence_score != null) {
      points.push({
        agentId: "sentiment_analyzer",
        label: "Sentiment",
        confidence: sent.confidence_score,
        color: AGENT_COLORS.sentiment_analyzer,
      });
    }

    const delib = records.find((r) => r.event_type === "inter_agent_deliberation");
    if (delib?.confidence_score != null) {
      points.push({
        agentId: "deliberation",
        label: "Deliberation",
        confidence: delib.confidence_score,
        color: AGENT_COLORS.deliberation,
      });
    }

    const esc = records.find(
      (r) =>
        (r.event_type === "agent_end" && r.agent_id === "escalation") ||
        r.event_type === "escalation_alert"
    );
    if (esc?.confidence_score != null) {
      points.push({
        agentId: "escalation",
        label: "Final",
        confidence: esc.confidence_score,
        color: AGENT_COLORS.escalation,
      });
    }

    return points;
  }, [records]);

  if (dataPoints.length < 2) {
    if (records.length === 0) return null; // No records at all — hide completely
    // Records exist but not enough confidence data yet — show skeleton
    return (
      <div style={{ padding: "4px 0" }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.04em" }}>
          Confidence Evolution
        </div>
        <div style={{
          height: 60, borderRadius: 6,
          background: "linear-gradient(90deg, var(--bg-card) 25%, rgba(125,133,144,0.08) 50%, var(--bg-card) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s ease-in-out infinite",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Collecting confidence data...</span>
        </div>
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  // Chart dimensions
  const W = 320;
  const H = 80;
  const PAD_LEFT = 8;
  const PAD_RIGHT = 8;
  const PAD_TOP = 14;
  const PAD_BOT = 18;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOT;

  const maxConf = Math.max(...dataPoints.map((d) => d.confidence), 1);
  const minConf = Math.min(...dataPoints.map((d) => d.confidence), 0);
  const range = Math.max(maxConf - minConf, 0.2);

  const pointCoords = dataPoints.map((d, i) => ({
    x: PAD_LEFT + (i / (dataPoints.length - 1)) * chartW,
    y: PAD_TOP + (1 - (d.confidence - minConf) / range) * chartH,
    ...d,
  }));

  // Build SVG path
  const linePath = pointCoords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Gradient fill path
  const fillPath = `${linePath} L ${pointCoords[pointCoords.length - 1].x} ${PAD_TOP + chartH} L ${pointCoords[0].x} ${PAD_TOP + chartH} Z`;

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.04em" }}>
        Confidence Evolution
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", maxHeight: 80, overflow: "visible" }}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1.0].map((val) => {
          const y = PAD_TOP + (1 - (val - minConf) / range) * chartH;
          if (y < PAD_TOP || y > PAD_TOP + chartH) return null;
          return (
            <line
              key={val}
              x1={PAD_LEFT}
              y1={y}
              x2={PAD_LEFT + chartW}
              y2={y}
              stroke="rgba(125,133,144,0.1)"
              strokeDasharray="2 3"
            />
          );
        })}

        {/* Gradient fill */}
        <defs>
          <linearGradient id="confGradient" x1="0" y1="0" x2="1" y2="0">
            {pointCoords.map((p, i) => (
              <stop
                key={i}
                offset={`${(i / (pointCoords.length - 1)) * 100}%`}
                stopColor={p.color}
                stopOpacity="0.15"
              />
            ))}
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#confGradient)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="url(#confGradient)" strokeWidth="2" opacity="0.8" />
        {/* Actual colored line segments */}
        {pointCoords.slice(0, -1).map((p, i) => {
          const next = pointCoords[i + 1];
          return (
            <line
              key={i}
              x1={p.x}
              y1={p.y}
              x2={next.x}
              y2={next.y}
              stroke={next.color}
              strokeWidth="2"
              opacity="0.7"
            />
          );
        })}

        {/* Data points */}
        {pointCoords.map((p, i) => (
          <g
            key={i}
            style={{ cursor: "pointer" }}
            onClick={() => onStageClick?.(p.agentId)}
          >
            <circle cx={p.x} cy={p.y} r="6" fill={p.color} opacity="0.2" />
            <circle cx={p.x} cy={p.y} r="3.5" fill={p.color} />
            <circle cx={p.x} cy={p.y} r="1.5" fill="#fff" />

            {/* Confidence label */}
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="7"
              fontWeight="700"
              fill={p.color}
              fontFamily="Inter, sans-serif"
            >
              {(p.confidence * 100).toFixed(0)}%
            </text>

            {/* Agent label */}
            <text
              x={p.x}
              y={PAD_TOP + chartH + 12}
              textAnchor="middle"
              fontSize="6.5"
              fontWeight="500"
              fill="rgba(125,133,144,0.7)"
              fontFamily="Inter, sans-serif"
            >
              {p.label}
            </text>
          </g>
        ))}

        {/* Divergence indicator */}
        {dataPoints.length >= 2 && Math.abs(dataPoints[0].confidence - dataPoints[1].confidence) > 0.3 && (
          <text
            x={(pointCoords[0].x + pointCoords[1].x) / 2}
            y={Math.min(pointCoords[0].y, pointCoords[1].y) - 3}
            textAnchor="middle"
            fontSize="6"
            fontWeight="600"
            fill="#f59e0b"
            fontFamily="Inter, sans-serif"
          >
            divergence
          </text>
        )}
      </svg>
    </div>
  );
}
