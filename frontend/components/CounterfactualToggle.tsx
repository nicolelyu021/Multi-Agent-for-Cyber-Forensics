"use client";
import { useState } from "react";
import { AGENT_LABELS } from "@/lib/constants";
import type { CounterfactualResult } from "@/lib/types";
import { ToggleLeft, ToggleRight, TrendingDown } from "lucide-react";

interface CounterfactualToggleProps {
  data: CounterfactualResult | null;
}

export function CounterfactualToggle({ data }: CounterfactualToggleProps) {
  const [disabledAgents, setDisabledAgents] = useState<Set<string>>(new Set());

  if (!data) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
        <p style={{ fontSize: 13 }}>Loading counterfactual analysis...</p>
      </div>
    );
  }

  if (data.message) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
        <p style={{ fontSize: 13 }}>{data.message}</p>
      </div>
    );
  }

  const toggleAgent = (agentId: string) => {
    setDisabledAgents((prev) => {
      const next = new Set(prev);
      next.has(agentId) ? next.delete(agentId) : next.add(agentId);
      return next;
    });
  };

  const enabledAttributions = Object.entries(data.attributions)
    .filter(([id]) => !disabledAgents.has(id));
  const adjustedConfidence = enabledAttributions.reduce((sum, [, v]) => sum + v, 0);
  const wouldAlert = adjustedConfidence >= 0.7;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 className="section-label">Counterfactual Analysis</h3>
        <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          Toggle agents off to see how confidence changes
        </p>
      </div>

      {/* Original vs Adjusted */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, padding: 12, borderRadius: 8, background: "var(--bg-card)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Original</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent-red)" }}>
            {(data.final_confidence * 100).toFixed(0)}%
          </div>
        </div>
        <div style={{
          flex: 1, padding: 12, borderRadius: 8,
          background: wouldAlert ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
          border: `1px solid ${wouldAlert ? "var(--accent-red)" : "var(--accent-green)"}`,
        }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Adjusted</div>
          <div style={{
            fontSize: 24, fontWeight: 700,
            color: wouldAlert ? "var(--accent-red)" : "var(--accent-green)",
          }}>
            {(adjustedConfidence * 100).toFixed(0)}%
          </div>
          <div style={{
            fontSize: 11, marginTop: 2,
            color: wouldAlert ? "var(--accent-red)" : "var(--accent-green)",
          }}>
            {wouldAlert ? "Would still alert" : "Would NOT alert"}
          </div>
        </div>
      </div>

      {/* Agent Toggles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(data.attributions).map(([agentId, contribution]) => {
          const cf = data.counterfactuals[agentId];
          const isDisabled = disabledAgents.has(agentId);

          return (
            <div key={agentId} style={{
              padding: 12, borderRadius: 8,
              background: isDisabled ? "var(--bg-primary)" : "var(--bg-card)",
              border: `1px solid ${isDisabled ? "var(--border)" : "transparent"}`,
              opacity: isDisabled ? 0.5 : 1, transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                  {AGENT_LABELS[agentId] || agentId}
                </span>
                <button
                  onClick={() => toggleAgent(agentId)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {isDisabled
                    ? <ToggleLeft style={{ width: 24, height: 24, color: "var(--text-muted)" }} />
                    : <ToggleRight style={{ width: 24, height: 24, color: "var(--accent-cyan)" }} />
                  }
                </button>
              </div>

              {/* Attribution bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--bg-primary)" }}>
                  <div style={{
                    height: "100%", borderRadius: 3, transition: "width 0.3s",
                    width: `${(contribution / data.final_confidence) * 100}%`,
                    background: "var(--accent-cyan)",
                  }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--accent-cyan)", flexShrink: 0 }}>
                  +{(contribution * 100).toFixed(1)}%
                </span>
              </div>

              {cf?.was_decisive && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, color: "var(--accent-amber)", marginTop: 4,
                }}>
                  <TrendingDown style={{ width: 12, height: 12 }} />
                  Decisive — removing this agent changes the alert outcome
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
