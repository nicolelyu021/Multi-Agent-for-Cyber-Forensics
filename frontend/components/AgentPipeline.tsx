"use client";
import { useState, useMemo } from "react";
import type { ForensicRecord } from "@/lib/types";
import { Network, Brain, Scale, AlertTriangle, UserCheck, ChevronDown, ChevronRight } from "lucide-react";

interface AgentPipelineProps {
  records: ForensicRecord[];
  onSelectAgent?: (agentId: string) => void;
}

interface PipelineNode {
  id: string;
  label: string;
  icon: typeof Network;
  color: string;
  confidence: number | null;
  status: "completed" | "active" | "skipped" | "pending";
  reasoning: string | null;
  proposedAction: string | null;
  timestamp: string | null;
  nistBadge: string;
}

const AGENT_ORDER = ["investigator", "sentiment_analyzer", "deliberation", "escalation", "human_review"];

const AGENT_META: Record<string, { label: string; icon: typeof Network; color: string; nistBadge: string }> = {
  investigator: { label: "Investigator", icon: Network, color: "#3b82f6", nistBadge: "NIST 2.8" },
  sentiment_analyzer: { label: "Sentiment", icon: Brain, color: "#a855f7", nistBadge: "EU Art 13" },
  deliberation: { label: "Deliberation", icon: Scale, color: "#f59e0b", nistBadge: "EU Art 9" },
  escalation: { label: "Escalation", icon: AlertTriangle, color: "#ef4444", nistBadge: "NIST Map 1.6" },
  human_review: { label: "Human Review", icon: UserCheck, color: "#22c55e", nistBadge: "EU Art 14" },
};

export function AgentPipeline({ records, onSelectAgent }: AgentPipelineProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const pipelineNodes = useMemo((): PipelineNode[] => {
    // Find relevant records for each agent
    const agentRecords: Record<string, ForensicRecord | null> = {};

    for (const rec of records) {
      if (rec.event_type === "agent_end" && rec.agent_id === "investigator") {
        agentRecords.investigator = rec;
      }
      if (rec.event_type === "agent_end" && rec.agent_id === "sentiment_analyzer") {
        agentRecords.sentiment_analyzer = rec;
      }
      if (rec.event_type === "inter_agent_deliberation") {
        agentRecords.deliberation = rec;
      }
      if ((rec.event_type === "agent_end" && rec.agent_id === "escalation") || rec.event_type === "escalation_alert") {
        agentRecords.escalation = rec;
      }
      if (rec.event_type === "human_override" || rec.agent_id?.startsWith("human:")) {
        agentRecords.human_review = rec;
      }
    }

    return AGENT_ORDER.map((id) => {
      const meta = AGENT_META[id];
      const rec = agentRecords[id] || null;

      let status: PipelineNode["status"] = "pending";
      if (rec) {
        status = "completed";
      } else if (id === "deliberation" && records.length > 0 && agentRecords.escalation) {
        // Deliberation was skipped (agents agreed)
        status = "skipped";
      } else if (id === "human_review" && agentRecords.escalation) {
        status = "pending"; // Awaiting human
      }

      return {
        id,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        confidence: rec?.confidence_score ?? null,
        status,
        reasoning: rec?.reasoning_summary ?? null,
        proposedAction: rec?.proposed_action ?? null,
        timestamp: rec?.timestamp ?? null,
        nistBadge: meta.nistBadge,
      };
    });
  }, [records]);

  const handleNodeClick = (agentId: string) => {
    setExpandedAgent(expandedAgent === agentId ? null : agentId);
    onSelectAgent?.(agentId);
  };

  const expandedNode = pipelineNodes.find((n) => n.id === expandedAgent);

  return (
    <div style={{ padding: "12px 0" }}>
      {/* Pipeline flow */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", padding: "0 4px" }}>
        {pipelineNodes.map((node, idx) => {
          const Icon = node.icon;
          const isExpanded = expandedAgent === node.id;
          const isSkipped = node.status === "skipped";
          const isCompleted = node.status === "completed";
          const isPending = node.status === "pending";
          const opacity = isSkipped ? 0.4 : isPending ? 0.5 : 1;

          return (
            <div key={node.id} style={{ display: "flex", alignItems: "center" }}>
              {/* Node */}
              <button
                onClick={() => isCompleted || isSkipped ? handleNodeClick(node.id) : undefined}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "8px 6px",
                  borderRadius: 10,
                  border: isExpanded ? `2px solid ${node.color}` : "2px solid transparent",
                  background: isExpanded ? `${node.color}12` : "transparent",
                  cursor: isCompleted || isSkipped ? "pointer" : "default",
                  opacity,
                  transition: "all 0.2s ease",
                  minWidth: 70,
                  position: "relative",
                }}
              >
                {/* Icon circle */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: isCompleted ? `${node.color}20` : "var(--bg-card, #161b22)",
                    border: `1.5px solid ${isCompleted ? node.color : "var(--border, #30363d)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <Icon style={{ width: 16, height: 16, color: isCompleted ? node.color : "var(--text-muted)" }} />

                  {/* Pulse animation for deliberation when triggered */}
                  {node.id === "deliberation" && isCompleted && (
                    <div
                      style={{
                        position: "absolute",
                        inset: -4,
                        borderRadius: 14,
                        border: `2px solid ${node.color}`,
                        animation: "pipelinePulse 2s ease-in-out infinite",
                      }}
                    />
                  )}
                </div>

                {/* Label */}
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: isCompleted ? "var(--text-primary)" : "var(--text-muted)",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}>
                  {node.label}
                </span>

                {/* Confidence badge */}
                {node.confidence != null && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: `${node.confidence >= 0.7 ? "#ef4444" : node.confidence >= 0.4 ? "#f59e0b" : "#22c55e"}18`,
                    color: node.confidence >= 0.7 ? "#ef4444" : node.confidence >= 0.4 ? "#f59e0b" : "#22c55e",
                  }}>
                    {(node.confidence * 100).toFixed(0)}%
                  </span>
                )}

                {/* Skipped badge */}
                {isSkipped && (
                  <span style={{
                    fontSize: 8,
                    fontWeight: 600,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(34,197,94,0.12)",
                    color: "#22c55e",
                  }}>
                    Agreed
                  </span>
                )}

                {/* Pending badge */}
                {isPending && node.id === "human_review" && records.length > 0 && (
                  <span style={{
                    fontSize: 8,
                    fontWeight: 600,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(245,158,11,0.12)",
                    color: "#f59e0b",
                  }}>
                    Awaiting
                  </span>
                )}

                {/* NIST badge */}
                {isCompleted && (
                  <span style={{
                    fontSize: 7,
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: "rgba(59,130,246,0.08)",
                    color: "var(--accent-blue, #3b82f6)",
                    fontWeight: 500,
                  }}>
                    {node.nistBadge}
                  </span>
                )}
              </button>

              {/* Connector arrow */}
              {idx < pipelineNodes.length - 1 && (
                <div style={{ display: "flex", alignItems: "center", width: 20, justifyContent: "center" }}>
                  <div style={{
                    width: 16,
                    height: 2,
                    background: isCompleted && pipelineNodes[idx + 1]?.status !== "pending"
                      ? `linear-gradient(90deg, ${node.color}, ${pipelineNodes[idx + 1]?.color || "#6b7280"})`
                      : "var(--border, #30363d)",
                    borderRadius: 1,
                    position: "relative",
                  }}>
                    {/* Animated dot on active connections */}
                    {isCompleted && pipelineNodes[idx + 1]?.status === "completed" && (
                      <div style={{
                        position: "absolute",
                        top: -2,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: pipelineNodes[idx + 1]?.color,
                        animation: "flowDot 1.5s ease-in-out infinite",
                      }} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded reasoning card */}
      {expandedNode && (expandedNode.reasoning || expandedNode.status === "skipped") && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 8,
            background: "var(--bg-card, #161b22)",
            border: `1px solid ${expandedNode.color}40`,
            animation: "slideDown 0.15s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: expandedNode.color }}>
              {expandedNode.label} — Reasoning
            </span>
            <button
              onClick={() => setExpandedAgent(null)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
            >
              <ChevronDown style={{ width: 12, height: 12, color: "var(--text-muted)" }} />
            </button>
          </div>

          {expandedNode.status === "skipped" ? (
            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
              Deliberation was <strong style={{ color: "#22c55e" }}>not triggered</strong> because
              the Investigator and Sentiment Analyzer reached similar confidence levels
              (divergence &le; 0.3). The agents agreed on the threat assessment.
            </p>
          ) : (
            <p style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 150,
              overflowY: "auto",
            }}>
              {expandedNode.reasoning}
            </p>
          )}

          {expandedNode.proposedAction && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Action: </span>
              <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 600 }}>
                {expandedNode.proposedAction}
              </span>
            </div>
          )}

          {expandedNode.timestamp && (
            <div style={{ marginTop: 4, fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
              {new Date(expandedNode.timestamp).toLocaleString()}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pipelinePulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
        @keyframes flowDot {
          0% { left: 0; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { left: 10px; opacity: 0; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
