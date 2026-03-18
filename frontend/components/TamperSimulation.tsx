"use client";
import type { TamperSimResult } from "@/lib/types";
import { AlertTriangle, CheckCircle, XCircle, Zap } from "lucide-react";

interface TamperSimulationProps {
  data: TamperSimResult | null;
  onSimulate: () => void;
}

export function TamperSimulation({ data, onSimulate }: TamperSimulationProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 className="section-label">Tamper Simulation</h3>
        <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          Demonstrates hash chain tamper detection by corrupting a random record
        </p>
      </div>

      {/* Simulate Button */}
      <button
        onClick={onSimulate}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: "rgba(239,68,68,0.15)", color: "var(--accent-red)",
          border: "1px solid var(--accent-red)", cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <Zap style={{ width: 16, height: 16 }} />
        Simulate Tampering
      </button>

      {data && (
        <>
          {/* Tamper Detail */}
          <div style={{
            padding: 12, borderRadius: 8,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <AlertTriangle style={{ width: 16, height: 16, color: "var(--accent-red)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-red)" }}>
                Record #{data.tampered_index} Corrupted
              </span>
            </div>
            <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4, color: "var(--text-secondary)" }}>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Field: </span>
                <span style={{ fontFamily: "monospace" }}>{data.tamper_detail.field}</span>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Original: </span>
                <span style={{ textDecoration: "line-through", opacity: 0.5 }}>
                  {String(data.tamper_detail.original_value).slice(0, 60)}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Tampered: </span>
                <span style={{ color: "var(--accent-red)" }}>
                  {String(data.tamper_detail.tampered_value).slice(0, 60)}
                </span>
              </div>
            </div>
          </div>

          {/* Side-by-side Chain Comparison */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Original Chain */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <CheckCircle style={{ width: 14, height: 14, color: "var(--accent-green)" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-green)" }}>Original</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {data.original_chain.records.map((r, i) => (
                  <div key={i} className="chain-check" style={{
                    animationDelay: `${i * 80}ms`,
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 6px", borderRadius: 4, fontSize: 11,
                    background: "rgba(34,197,94,0.08)",
                  }}>
                    <CheckCircle style={{ width: 12, height: 12, flexShrink: 0, color: "var(--accent-green)" }} />
                    <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>#{i}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tampered Chain */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <XCircle style={{ width: 14, height: 14, color: "var(--accent-red)" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-red)" }}>Tampered</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {data.tampered_chain.records.map((r, i) => (
                  <div key={i} className="chain-check" style={{
                    animationDelay: `${i * 80}ms`,
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 6px", borderRadius: 4, fontSize: 11,
                    background: r.valid ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  }}>
                    {r.valid
                      ? <CheckCircle style={{ width: 12, height: 12, flexShrink: 0, color: "var(--accent-green)" }} />
                      : <XCircle style={{ width: 12, height: 12, flexShrink: 0, color: "var(--accent-red)" }} />
                    }
                    <span style={{
                      fontFamily: "monospace",
                      color: r.valid ? "var(--text-muted)" : "var(--accent-red)",
                    }}>
                      #{i}
                    </span>
                    {i === data.tampered_index && (
                      <span style={{ color: "var(--accent-red)", fontWeight: 700 }}>&larr;</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div style={{
            padding: 12, borderRadius: 8, fontSize: 11,
            background: "var(--bg-card)", color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}>
            <strong style={{ color: "var(--text-primary)" }}>What happened:</strong> A single record was modified.
            Because each record&apos;s hash includes the previous record&apos;s hash (append-only chain),
            the corruption propagates &mdash; every record after the tampered one fails verification.
            This is how SHA-256 hash chains provide tamper evidence for forensic audit trails.
          </div>
        </>
      )}
    </div>
  );
}
