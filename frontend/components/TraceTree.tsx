"use client";
import { useState, useEffect, useMemo } from "react";
import type { ForensicRecord, ChainVerification } from "@/lib/types";
import { AGENT_LABELS } from "@/lib/constants";
import {
  ChevronRight, ChevronDown, Bot, Wrench, Brain,
  Users, UserCheck, CheckCircle, XCircle, AlertTriangle,
  Shield, Clock, Hash,
} from "lucide-react";

interface TraceTreeProps {
  records: ForensicRecord[];
  verification: ChainVerification | null;
}

/* ── Human-readable event labels ── */
const EVENT_LABELS: Record<string, string> = {
  agent_start: "Started Analysis",
  agent_end: "Completed Analysis",
  tool_call: "Tool Executed",
  llm_call: "LLM Reasoning",
  inter_agent_deliberation: "Agents Deliberated",
  escalation_alert: "Threat Alert Raised",
  human_override: "Analyst Override",
};

const EVENT_DESCRIPTIONS: Record<string, string> = {
  agent_start: "Agent began processing its assigned task",
  agent_end: "Agent finished and produced results",
  tool_call: "Queried database or ran analysis tool",
  llm_call: "Used language model to reason about evidence",
  inter_agent_deliberation: "Agents compared findings and resolved disagreements",
  escalation_alert: "Confidence exceeded threshold — alert generated",
  human_override: "Human analyst reviewed and made a decision",
};

const EVENT_ICONS: Record<string, typeof Bot> = {
  agent_start: Bot, agent_end: Bot, tool_call: Wrench, llm_call: Brain,
  inter_agent_deliberation: Users, escalation_alert: AlertTriangle, human_override: UserCheck,
};

const EVENT_COLORS: Record<string, string> = {
  agent_start: "var(--accent-blue)", agent_end: "var(--accent-blue)",
  tool_call: "var(--accent-cyan)", llm_call: "var(--accent-purple)",
  inter_agent_deliberation: "var(--accent-amber)", escalation_alert: "var(--accent-red)",
  human_override: "var(--accent-green)",
};

/* Events auto-expanded on load */
const AUTO_EXPAND_EVENTS = new Set([
  "agent_end", "inter_agent_deliberation", "escalation_alert", "human_override",
]);

/* Events considered low-priority noise (collapsed by default, dimmed) */
const NOISE_EVENTS = new Set(["agent_start"]);

/* ── Helpers ── */
function confidenceBadge(score: number | null | undefined) {
  if (score === null || score === undefined) return null;
  const pct = Math.round(score * 100);
  const isHigh = score >= 0.7;
  const isMed = score >= 0.4;
  return (
    <span style={{
      fontSize: 10, padding: "2px 7px", borderRadius: 4, flexShrink: 0, fontWeight: 600,
      background: isHigh ? "rgba(239,68,68,0.15)" : isMed ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.1)",
      color: isHigh ? "var(--accent-red)" : isMed ? "var(--accent-amber)" : "var(--text-muted)",
    }}>
      {pct}% confidence
    </span>
  );
}

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return ts; }
}

/** Extract a short summary from tool_input JSON */
function toolInputSummary(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input);
    // For neo4j queries, show the query type
    if (parsed.query) return `Cypher: ${parsed.query.slice(0, 80)}…`;
    if (parsed.source && parsed.target) return `${parsed.source} → ${parsed.target}`;
    if (parsed.text_a) return `Comparing text similarity`;
    return null;
  } catch {
    return input.length > 100 ? input.slice(0, 100) + "…" : input;
  }
}

export function TraceTree({ records, verification }: TraceTreeProps) {
  /* Auto-expand important events on mount */
  const autoExpandIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of records) {
      if (AUTO_EXPAND_EVENTS.has(r.event_type)) ids.add(r.span_id);
    }
    return ids;
  }, [records]);

  const [expanded, setExpanded] = useState<Set<string>>(autoExpandIds);

  // Re-sync when records change
  useEffect(() => { setExpanded(autoExpandIds); }, [autoExpandIds]);

  const toggle = (spanId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(spanId) ? next.delete(spanId) : next.add(spanId);
      return next;
    });
  };

  const getVerificationStatus = (spanId: string) => {
    if (!verification) return null;
    return verification.records.find((r) => r.span_id === spanId);
  };

  /* Group records: important ones first, noise at bottom */
  const sorted = useMemo(() => {
    const important = records.filter((r) => !NOISE_EVENTS.has(r.event_type));
    const noise = records.filter((r) => NOISE_EVENTS.has(r.event_type));
    return [...important, ...noise];
  }, [records]);

  if (!records.length) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
        No forensic records available. Run an analysis first.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Summary bar */}
      <div style={{
        display: "flex", gap: 12, padding: "8px 10px", marginBottom: 4, borderRadius: 6,
        background: "var(--bg-card)", border: "1px solid var(--border)", fontSize: 11,
        color: "var(--text-muted)", flexWrap: "wrap",
      }}>
        <span>{records.length} events</span>
        <span>·</span>
        <span>{new Set(records.map(r => r.agent_id)).size} agents</span>
        <span>·</span>
        <span>{records.filter(r => r.event_type === "tool_call").length} tool calls</span>
        {verification && (
          <>
            <span>·</span>
            <span style={{ color: verification.chain_valid ? "var(--accent-green)" : "var(--accent-red)" }}>
              {verification.chain_valid ? "✓ Chain intact" : "✗ Chain broken"}
            </span>
          </>
        )}
      </div>

      {sorted.map((record, idx) => {
        const Icon = EVENT_ICONS[record.event_type] || Bot;
        const color = EVENT_COLORS[record.event_type] || "var(--text-muted)";
        const isExpanded = expanded.has(record.span_id);
        const vStatus = getVerificationStatus(record.span_id);
        const isNoise = NOISE_EVENTS.has(record.event_type);
        const label = EVENT_LABELS[record.event_type] || record.event_type;
        const agentName = AGENT_LABELS[record.agent_id] || record.agent_id;
        const indent = record.parent_span_id
          ? records.findIndex((r) => r.span_id === record.parent_span_id) >= 0 ? 1 : 0 : 0;

        return (
          <div key={record.span_id} className="chain-check"
            style={{
              animationDelay: `${idx * 40}ms`, marginLeft: indent * 16,
              opacity: isNoise && !isExpanded ? 0.55 : 1,
              transition: "opacity 0.2s",
            }}>
            {/* ── Row header ── */}
            <button
              onClick={() => toggle(record.span_id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 6, textAlign: "left",
                background: isExpanded ? "var(--bg-hover)" : "transparent",
                border: "none", cursor: "pointer",
                transition: "background 0.15s", color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = isExpanded ? "var(--bg-hover)" : "transparent")}
            >
              {isExpanded
                ? <ChevronDown style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} />
                : <ChevronRight style={{ width: 12, height: 12, color: "var(--text-muted)", flexShrink: 0 }} />
              }

              <Icon style={{ width: 15, height: 15, flexShrink: 0, color }} />

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ color, fontWeight: 600 }}>{label}</span>
                  <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 3,
                    background: "rgba(100,116,139,0.1)", color: "var(--text-secondary)", fontWeight: 500,
                  }}>
                    {agentName}
                  </span>
                </div>
                {/* One-line preview when collapsed */}
                {!isExpanded && record.reasoning_summary && (
                  <span style={{
                    fontSize: 10, color: "var(--text-muted)", lineHeight: 1.3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {record.reasoning_summary.slice(0, 120)}
                  </span>
                )}
                {!isExpanded && record.tool_name && !record.reasoning_summary && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    Tool: {record.tool_name}
                    {record.tool_input ? ` — ${toolInputSummary(record.tool_input) || ""}` : ""}
                  </span>
                )}
              </div>

              {confidenceBadge(record.confidence_score)}

              {vStatus && (
                <span className="chain-check" style={{ animationDelay: `${idx * 80}ms`, flexShrink: 0 }}>
                  {vStatus.valid
                    ? <CheckCircle style={{ width: 14, height: 14, color: "var(--accent-green)" }} />
                    : <XCircle style={{ width: 14, height: 14, color: "var(--accent-red)" }} />}
                </span>
              )}
            </button>

            {/* ── Expanded detail panel ── */}
            {isExpanded && (
              <div style={{
                marginLeft: 28, marginTop: 2, marginBottom: 8, padding: 12, borderRadius: 8,
                fontSize: 12, background: "var(--bg-card)", border: "1px solid var(--border)",
                display: "flex", flexDirection: "column", gap: 10,
                lineHeight: 1.5,
              }}>
                {/* What happened */}
                <div style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
                  {EVENT_DESCRIPTIONS[record.event_type] || ""}
                </div>

                {/* Full reasoning — the main content */}
                {record.reasoning_summary && (
                  <div style={{
                    padding: 10, borderRadius: 6,
                    background: "rgba(100,116,139,0.06)", border: "1px solid var(--border)",
                  }}>
                    <div style={{
                      fontSize: 10, fontWeight: 600, marginBottom: 6,
                      color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px",
                    }}>
                      Agent Reasoning
                    </div>
                    <div style={{
                      color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {record.reasoning_summary}
                    </div>
                  </div>
                )}

                {/* Tool details */}
                {record.tool_name && (
                  <div style={{
                    padding: 8, borderRadius: 6,
                    background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Wrench style={{ width: 12, height: 12, color: "var(--accent-cyan)" }} />
                      <span style={{ fontFamily: "monospace", color: "var(--accent-cyan)", fontWeight: 600, fontSize: 12 }}>
                        {record.tool_name}
                      </span>
                    </div>
                    {record.tool_input && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        <span style={{ fontWeight: 500 }}>Input: </span>
                        <span style={{ fontFamily: "monospace", fontSize: 10, wordBreak: "break-all" }}>
                          {toolInputSummary(record.tool_input) || record.tool_input?.slice(0, 200)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Proposed action */}
                {record.proposed_action && (
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Action: </span>
                    <span style={{ color: "var(--text-secondary)" }}>{record.proposed_action}</span>
                  </div>
                )}

                {/* Datasets accessed */}
                {record.datasets_accessed && (
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Data Sources: </span>
                    <span style={{ color: "var(--text-secondary)" }}>{record.datasets_accessed}</span>
                  </div>
                )}

                {/* Metadata row — compact, de-emphasized */}
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 6,
                  borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--text-muted)",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock style={{ width: 10, height: 10 }} />
                    {formatTime(record.timestamp)}
                  </span>
                  {record.tool_call_hash && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Hash style={{ width: 10, height: 10 }} />
                      <span style={{ fontFamily: "monospace" }}>{record.tool_call_hash.slice(0, 12)}…</span>
                    </span>
                  )}
                  {vStatus && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: vStatus.valid ? "var(--accent-green)" : "var(--accent-red)" }}>
                      <Shield style={{ width: 10, height: 10 }} />
                      {vStatus.valid ? "Verified" : "Integrity broken"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
