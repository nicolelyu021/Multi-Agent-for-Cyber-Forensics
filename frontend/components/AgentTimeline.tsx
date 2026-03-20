"use client";
import { useState, useMemo } from "react";
import type { ForensicRecord } from "@/lib/types";
import { AGENT_LABELS } from "@/lib/constants";
import {
  Network, Brain, Scale, AlertTriangle, UserCheck,
  ChevronDown, ChevronRight, Shield, Clock,
} from "lucide-react";

const AGENT_CONFIG: Record<string, { color: string; icon: typeof Network; nistBadge?: string }> = {
  investigator: { color: "#3b82f6", icon: Network, nistBadge: "NIST 2.8 Transparency" },
  sentiment_analyzer: { color: "#a855f7", icon: Brain, nistBadge: "EU Art 13 Disclosure" },
  deliberation: { color: "#f59e0b", icon: Scale, nistBadge: "EU Art 9 Risk Mgmt" },
  escalation: { color: "#ef4444", icon: AlertTriangle, nistBadge: "NIST Map 1.6 Oversight" },
  human: { color: "#22c55e", icon: UserCheck, nistBadge: "EU Art 14 Human Oversight" },
  demo_analyst: { color: "#22c55e", icon: UserCheck, nistBadge: "EU Art 14 Human Oversight" },
};

interface AgentTimelineProps {
  records: ForensicRecord[];
}

export function AgentTimeline({ records }: AgentTimelineProps) {
  const [expandedSpan, setExpandedSpan] = useState<string | null>(null);

  // Filter to meaningful events only
  const timelineEvents = useMemo(() => {
    return records.filter((r) =>
      r.event_type === "agent_end" ||
      r.event_type === "inter_agent_deliberation" ||
      r.event_type === "escalation_alert" ||
      r.event_type === "human_override"
    ).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [records]);

  if (timelineEvents.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-muted)" }}>
        <div style={{ textAlign: "center" }}>
          <Clock style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 12 }}>No agent activity recorded yet</p>
          <p style={{ fontSize: 10, marginTop: 4 }}>Run a threat analysis to generate the agent timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Pipeline summary */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 16,
        padding: 10, borderRadius: 8,
        background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
      }}>
        <Shield style={{ width: 14, height: 14, color: "var(--accent-blue)" }} />
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          Multi-agent pipeline completed with {timelineEvents.length} decision steps
        </span>
      </div>

      {/* Timeline */}
      {timelineEvents.map((event, idx) => {
        const isHumanOverride = event.agent_id?.startsWith("human:") || event.event_type === "human_override";
        const agentId = isHumanOverride ? "human" : (event.agent_id || "unknown");
        const config = AGENT_CONFIG[agentId] || { color: "#6b7280", icon: Shield };
        const Icon = config.icon;
        const isExpanded = expandedSpan === event.span_id;
        const isLast = idx === timelineEvents.length - 1;

        // Build summary line
        let summary = "";
        if (event.event_type === "agent_end") {
          if (agentId === "investigator") {
            summary = "Scanned network communication patterns for anomalies";
          } else if (agentId === "sentiment_analyzer") {
            summary = "Analyzed email language, sentiment, and threat keywords";
          } else if (agentId === "escalation") {
            summary = "Aggregated findings and determined threat level";
          }
        } else if (event.event_type === "inter_agent_deliberation") {
          summary = "Agents disagreed \u2014 deliberation resolved the conflict";
        } else if (event.event_type === "escalation_alert") {
          summary = "Alert generated and sent for human review";
        } else if (event.event_type === "human_override") {
          summary = `Analyst decision: ${event.proposed_action || "reviewed"}`;
        }

        const confidence = event.confidence_score;
        const confColor = confidence !== null && confidence !== undefined
          ? confidence >= 0.7 ? "var(--accent-red)" : confidence >= 0.4 ? "var(--accent-amber)" : "var(--accent-green)"
          : "var(--text-muted)";

        return (
          <div key={event.span_id} style={{ display: "flex", gap: 12 }}>
            {/* Timeline line + dot */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: `${config.color}18`, border: `1.5px solid ${config.color}50`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon style={{ width: 13, height: 13, color: config.color }} />
              </div>
              {!isLast && (
                <div style={{
                  width: 1.5, flex: 1, minHeight: 20,
                  background: `linear-gradient(to bottom, ${config.color}40, var(--border))`,
                }} />
              )}
            </div>

            {/* Card */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
              <button
                onClick={() => setExpandedSpan(isExpanded ? null : event.span_id)}
                style={{
                  display: "flex", flexDirection: "column", width: "100%",
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  textAlign: "left", color: "var(--text-primary)",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = config.color; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: config.color }}>
                      {event.agent_id?.startsWith("human:") ? "Analyst Review" : AGENT_LABELS[agentId] || agentId}
                    </span>
                    {confidence !== null && confidence !== undefined && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                        background: `${confColor}15`, color: confColor,
                      }}>
                        {(confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {isExpanded
                    ? <ChevronDown style={{ width: 13, height: 13, color: "var(--text-muted)" }} />
                    : <ChevronRight style={{ width: 13, height: 13, color: "var(--text-muted)" }} />
                  }
                </div>

                <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4, margin: 0 }}>
                  {summary}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  {config.nistBadge && (
                    <span style={{
                      fontSize: 8, padding: "1px 5px", borderRadius: 3,
                      background: "rgba(59,130,246,0.08)", color: "var(--accent-blue)",
                      fontWeight: 500, letterSpacing: "0.02em",
                    }}>
                      {config.nistBadge}
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded reasoning */}
              {isExpanded && event.reasoning_summary && (
                <div style={{
                  marginTop: 6, padding: 12, borderRadius: 8,
                  background: "var(--bg-secondary)", border: "1px solid var(--border)",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                    Agent Reasoning
                  </div>
                  <p style={{
                    fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6,
                    margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    maxHeight: 300, overflowY: "auto",
                  }}>
                    {event.reasoning_summary}
                  </p>

                  {event.proposed_action && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Action: </span>
                      <span style={{ fontSize: 10, color: "var(--accent-red)", fontWeight: 600 }}>
                        {event.proposed_action}
                      </span>
                    </div>
                  )}

                  <div style={{ marginTop: 6, fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
                    span: {event.span_id.slice(0, 12)}...
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
