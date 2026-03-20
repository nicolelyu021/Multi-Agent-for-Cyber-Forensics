"use client";
import { useMemo } from "react";
import type { ForensicRecord } from "@/lib/types";
import { Network, Brain, Scale, ArrowRight } from "lucide-react";

interface DeliberationViewProps {
  records: ForensicRecord[];
}

interface AgentSide {
  label: string;
  icon: typeof Network;
  color: string;
  confidence: number | null;
  reasoning: string;
  proposedAction: string | null;
}

export function DeliberationView({ records }: DeliberationViewProps) {
  const data = useMemo(() => {
    const invRecord = records.find(
      (r) => r.agent_id === "investigator" && r.event_type === "agent_end"
    );
    const sentRecord = records.find(
      (r) => r.agent_id === "sentiment_analyzer" && r.event_type === "agent_end"
    );
    const delibRecord = records.find(
      (r) => r.event_type === "inter_agent_deliberation"
    );

    if (!delibRecord) return null;

    const investigator: AgentSide = {
      label: "Investigator",
      icon: Network,
      color: "#3b82f6",
      confidence: invRecord?.confidence_score ?? null,
      reasoning: invRecord?.reasoning_summary || "No reasoning recorded",
      proposedAction: invRecord?.proposed_action ?? null,
    };

    const sentiment: AgentSide = {
      label: "Sentiment Analyzer",
      icon: Brain,
      color: "#a855f7",
      confidence: sentRecord?.confidence_score ?? null,
      reasoning: sentRecord?.reasoning_summary || "No reasoning recorded",
      proposedAction: sentRecord?.proposed_action ?? null,
    };

    // Parse deliberation result
    let resolutionMethod = "consensus";
    let agreedConfidence = delibRecord.confidence_score;
    const delibReasoning = delibRecord.reasoning_summary || "";

    if (delibReasoning.toLowerCase().includes("majority")) resolutionMethod = "majority";
    else if (delibReasoning.toLowerCase().includes("defer")) resolutionMethod = "deferred";

    return {
      investigator,
      sentiment,
      resolution: {
        method: resolutionMethod,
        confidence: agreedConfidence,
        reasoning: delibReasoning,
        proposedAction: delibRecord.proposed_action,
      },
      divergence: investigator.confidence != null && sentiment.confidence != null
        ? Math.abs(investigator.confidence - sentiment.confidence)
        : null,
    };
  }, [records]);

  if (!data) {
    return (
      <div style={{
        padding: 16,
        borderRadius: 8,
        background: "rgba(34,197,94,0.06)",
        border: "1px solid rgba(34,197,94,0.2)",
        textAlign: "center",
      }}>
        <Scale style={{ width: 24, height: 24, color: "#22c55e", margin: "0 auto 8px", opacity: 0.5 }} />
        <p style={{ fontSize: 12, fontWeight: 600, color: "#22c55e", marginBottom: 4 }}>
          No Deliberation Required
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
          The Investigator and Sentiment Analyzer reached similar conclusions.
          No mediation was needed.
        </p>
      </div>
    );
  }

  const { investigator, sentiment, resolution, divergence } = data;

  const RESOLUTION_COLORS: Record<string, string> = {
    consensus: "#22c55e",
    majority: "#f59e0b",
    deferred: "#ef4444",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Divergence alert */}
      {divergence != null && (
        <div style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.2)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <Scale style={{ width: 14, height: 14, color: "#f59e0b" }} />
          <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
            Agent Divergence: {(divergence * 100).toFixed(0)}% difference
          </span>
          <span style={{
            marginLeft: "auto",
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 3,
            background: `${RESOLUTION_COLORS[resolution.method]}18`,
            color: RESOLUTION_COLORS[resolution.method],
            fontWeight: 700,
            textTransform: "uppercase",
          }}>
            {resolution.method}
          </span>
        </div>
      )}

      {/* Side-by-side comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8 }}>
        {/* Left: Investigator */}
        <AgentCard agent={investigator} />

        {/* Center arrow */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "0 4px",
        }}>
          <div style={{
            width: 2,
            height: 20,
            background: "var(--border)",
          }} />
          <div style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "rgba(245,158,11,0.15)",
            border: "1.5px solid rgba(245,158,11,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Scale style={{ width: 12, height: 12, color: "#f59e0b" }} />
          </div>
          <div style={{
            width: 2,
            height: 20,
            background: "var(--border)",
          }} />
        </div>

        {/* Right: Sentiment */}
        <AgentCard agent={sentiment} />
      </div>

      {/* Resolution card */}
      <div style={{
        padding: 12,
        borderRadius: 8,
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Scale style={{ width: 14, height: 14, color: "#f59e0b" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b" }}>
            Mediator Resolution
          </span>
          {resolution.confidence != null && (
            <span style={{
              marginLeft: "auto",
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 3,
              background: `${resolution.confidence >= 0.7 ? "#ef4444" : "#f59e0b"}18`,
              color: resolution.confidence >= 0.7 ? "#ef4444" : "#f59e0b",
            }}>
              Agreed: {(resolution.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <p style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 120,
          overflowY: "auto",
        }}>
          {resolution.reasoning}
        </p>
        {resolution.proposedAction && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(245,158,11,0.15)" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>
              Action:{" "}
            </span>
            <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 600 }}>
              {resolution.proposedAction}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentSide }) {
  const Icon = agent.icon;
  return (
    <div style={{
      padding: 10,
      borderRadius: 8,
      background: "var(--bg-card, #161b22)",
      border: `1px solid ${agent.color}30`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Icon style={{ width: 12, height: 12, color: agent.color }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: agent.color }}>
          {agent.label}
        </span>
      </div>
      {agent.confidence != null && (
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: agent.confidence >= 0.7 ? "#ef4444" : agent.confidence >= 0.4 ? "#f59e0b" : "#22c55e",
          marginBottom: 6,
        }}>
          {(agent.confidence * 100).toFixed(0)}%
        </div>
      )}
      <p style={{
        fontSize: 10,
        color: "var(--text-secondary)",
        lineHeight: 1.5,
        margin: 0,
        maxHeight: 100,
        overflowY: "auto",
        wordBreak: "break-word",
      }}>
        {agent.reasoning.length > 200
          ? agent.reasoning.slice(0, 200) + "..."
          : agent.reasoning}
      </p>
    </div>
  );
}
