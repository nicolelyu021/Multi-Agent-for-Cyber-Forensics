"use client";
import { useState } from "react";
import { AGENT_LABELS } from "@/lib/constants";
import type { ForensicRecord } from "@/lib/types";
import { Brain, ChevronDown, ChevronRight, Wrench, MessageSquare, AlertTriangle } from "lucide-react";

interface AgentReasoningProps {
  records: ForensicRecord[];
}

interface AgentGroup {
  agentId: string;
  label: string;
  records: ForensicRecord[];
  confidence: number | null;
  reasoning: string | null;
  toolCalls: ForensicRecord[];
  eventTypes: Set<string>;
}

function groupByAgent(records: ForensicRecord[]): AgentGroup[] {
  const map = new Map<string, ForensicRecord[]>();
  for (const r of records) {
    const aid = r.agent_id || "unknown";
    if (!map.has(aid)) map.set(aid, []);
    map.get(aid)!.push(r);
  }

  return Array.from(map.entries()).map(([agentId, recs]) => {
    // Find the highest-confidence record or the agent_end record for summary
    const endRecord = recs.find(r => r.event_type === "agent_end");
    const bestConfidence = recs.reduce((max, r) =>
      r.confidence_score !== null && r.confidence_score > (max ?? -1) ? r.confidence_score : max, null as number | null);

    // Collect reasoning summaries
    const reasonings = recs.filter(r => r.reasoning_summary).map(r => r.reasoning_summary!);
    const mainReasoning = endRecord?.reasoning_summary || reasonings[0] || null;

    // Tool calls
    const toolCalls = recs.filter(r => r.event_type === "tool_call" && r.tool_name);

    // Event types
    const eventTypes = new Set(recs.map(r => r.event_type));

    return {
      agentId,
      label: AGENT_LABELS[agentId] || agentId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      records: recs,
      confidence: bestConfidence,
      reasoning: mainReasoning,
      toolCalls,
      eventTypes,
    };
  });
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "var(--accent-red)" : pct >= 40 ? "var(--accent-amber)" : "var(--accent-green)";
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, fontFamily: "monospace",
      padding: "2px 8px", borderRadius: 4,
      background: `${color}18`, color,
    }}>
      {pct}%
    </span>
  );
}

function AgentCard({ group }: { group: AgentGroup }) {
  const [expanded, setExpanded] = useState(false);

  const iconColor = group.confidence !== null && group.confidence >= 0.7
    ? "var(--accent-red)" : "var(--accent-cyan)";

  return (
    <div style={{
      borderRadius: 8, background: "var(--bg-card)",
      border: "1px solid var(--border)", overflow: "hidden",
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px", background: "none", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        {expanded
          ? <ChevronDown style={{ width: 14, height: 14, color: "var(--text-muted)", flexShrink: 0 }} />
          : <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)", flexShrink: 0 }} />
        }
        <Brain style={{ width: 14, height: 14, color: iconColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
          {group.label}
        </span>
        <ConfidenceBadge score={group.confidence} />
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
          {group.records.length} events
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Reasoning summary */}
          {group.reasoning && (
            <div style={{
              padding: 10, borderRadius: 6,
              background: "var(--bg-primary)", border: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <MessageSquare style={{ width: 12, height: 12, color: "var(--accent-cyan)" }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Reasoning
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                {group.reasoning}
              </p>
            </div>
          )}

          {/* Proposed action */}
          {group.records.some(r => r.proposed_action) && (
            <div style={{
              padding: 10, borderRadius: 6,
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <AlertTriangle style={{ width: 12, height: 12, color: "var(--accent-red)" }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent-red)", textTransform: "uppercase" }}>
                  Proposed Action
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                {group.records.find(r => r.proposed_action)?.proposed_action}
              </p>
            </div>
          )}

          {/* Tool calls */}
          {group.toolCalls.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Wrench style={{ width: 12, height: 12, color: "var(--text-muted)" }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Tool Calls ({group.toolCalls.length})
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {group.toolCalls.map((tc, i) => (
                  <div key={i} style={{
                    padding: "6px 8px", borderRadius: 4,
                    background: "var(--bg-primary)", fontSize: 11,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--accent-cyan)" }}>
                        {tc.tool_name}
                      </span>
                      {tc.confidence_score !== null && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                          conf: {(tc.confidence_score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {tc.tool_input && (
                      <div style={{
                        marginTop: 4, fontSize: 10, color: "var(--text-muted)",
                        fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all",
                        maxHeight: 60, overflow: "hidden",
                      }}>
                        {tc.tool_input.length > 200 ? tc.tool_input.slice(0, 200) + "…" : tc.tool_input}
                      </div>
                    )}
                    {tc.tool_output && (
                      <div style={{
                        marginTop: 4, fontSize: 10, color: "var(--text-secondary)",
                        fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all",
                        maxHeight: 80, overflow: "hidden",
                      }}>
                        {tc.tool_output.length > 300 ? tc.tool_output.slice(0, 300) + "…" : tc.tool_output}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Datasets accessed */}
          {group.records.some(r => r.datasets_accessed) && (
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              <span style={{ fontWeight: 600 }}>Datasets: </span>
              {Array.from(new Set(group.records.filter(r => r.datasets_accessed).map(r => r.datasets_accessed))).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentReasoning({ records }: AgentReasoningProps) {
  if (!records || records.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)" }}>
        <Brain style={{ width: 32, height: 32, opacity: 0.3, margin: "0 auto 12px" }} />
        <p style={{ fontSize: 12 }}>No forensic records loaded.</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>Run a threat analysis to see agent reasoning.</p>
      </div>
    );
  }

  const groups = groupByAgent(records);

  // Decision flow: show order of agent execution
  const agentOrder = groups.map(g => g.label);

  // Overall stats
  const totalTools = groups.reduce((sum, g) => sum + g.toolCalls.length, 0);
  const highestConf = groups.reduce((max, g) =>
    g.confidence !== null && g.confidence > (max ?? 0) ? g.confidence : max, null as number | null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Decision flow */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap",
        padding: "8px 10px", borderRadius: 6,
        background: "var(--bg-card)", border: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginRight: 4 }}>FLOW:</span>
        {agentOrder.map((name, i) => (
          <span key={name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 6px",
              borderRadius: 3, background: "rgba(6,182,212,0.1)", color: "var(--accent-cyan)",
            }}>
              {name}
            </span>
            {i < agentOrder.length - 1 && (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>→</span>
            )}
          </span>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{
          flex: 1, padding: "8px 10px", borderRadius: 6,
          background: "var(--bg-card)", border: "1px solid var(--border)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{groups.length}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600 }}>AGENTS</div>
        </div>
        <div style={{
          flex: 1, padding: "8px 10px", borderRadius: 6,
          background: "var(--bg-card)", border: "1px solid var(--border)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{totalTools}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600 }}>TOOL CALLS</div>
        </div>
        <div style={{
          flex: 1, padding: "8px 10px", borderRadius: 6,
          background: "var(--bg-card)", border: "1px solid var(--border)",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: 18, fontWeight: 700,
            color: highestConf !== null && highestConf >= 0.7 ? "var(--accent-red)" : "var(--text-primary)",
          }}>
            {highestConf !== null ? `${Math.round(highestConf * 100)}%` : "—"}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600 }}>MAX CONF</div>
        </div>
      </div>

      {/* Agent cards */}
      {groups.map(group => (
        <AgentCard key={group.agentId} group={group} />
      ))}
    </div>
  );
}
