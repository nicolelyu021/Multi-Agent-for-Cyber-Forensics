"use client";
import { useState, useEffect, useCallback } from "react";
import { startStream, stopStream, getStreamStatus } from "@/lib/api";
import { Play, Pause, Square, Zap } from "lucide-react";

interface StreamControlProps {
  onStreamStateChange?: (active: boolean) => void;
}

export function StreamControl({ onStreamStateChange }: StreamControlProps) {
  const [active, setActive] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [status, setStatus] = useState({
    position: 0, total_weeks: 0, emails_processed: 0,
    total_emails: 0, alerts_generated: 0, current_week_label: "",
  });

  // Poll status while active
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      getStreamStatus().then((s) => {
        setStatus(s);
        if (!s.active) {
          setActive(false);
          onStreamStateChange?.(false);
        }
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [active, onStreamStateChange]);

  const handleStart = useCallback(async () => {
    try {
      await startStream(speed);
      setActive(true);
      onStreamStateChange?.(true);
    } catch {}
  }, [speed, onStreamStateChange]);

  const handleStop = useCallback(async () => {
    try {
      await stopStream();
      setActive(false);
      onStreamStateChange?.(false);
    } catch {}
  }, [onStreamStateChange]);

  const progress = status.total_weeks > 0
    ? Math.round((status.position / status.total_weeks) * 100)
    : 0;

  return (
    <div style={{
      padding: 12, borderRadius: 8,
      background: "var(--bg-card)", border: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Zap style={{ width: 14, height: 14, color: active ? "var(--accent-amber, #f59e0b)" : "var(--text-muted)" }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
          Email Stream Simulator
        </span>
        {active && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
            background: "rgba(34,197,94,0.15)", color: "var(--accent-green)",
          }}>
            LIVE
          </span>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {!active ? (
          <button
            onClick={handleStart}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              cursor: "pointer", border: "none",
              background: "var(--accent-green)", color: "white",
            }}
          >
            <Play style={{ width: 10, height: 10 }} /> Start
          </button>
        ) : (
          <button
            onClick={handleStop}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              cursor: "pointer", border: "none",
              background: "var(--accent-red)", color: "white",
            }}
          >
            <Square style={{ width: 10, height: 10 }} /> Stop
          </button>
        )}

        {/* Speed selector */}
        <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
          {[1, 5, 10].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              disabled={active}
              style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                cursor: active ? "default" : "pointer",
                border: "1px solid var(--border)",
                background: speed === s ? "var(--accent-blue)" : "transparent",
                color: speed === s ? "white" : "var(--text-muted)",
                opacity: active ? 0.5 : 1,
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Progress */}
      {(active || status.position > 0) && (
        <div>
          <div style={{
            height: 4, borderRadius: 2, background: "var(--bg-tertiary, rgba(125,133,144,0.1))",
            overflow: "hidden", marginBottom: 6,
          }}>
            <div style={{
              height: "100%", borderRadius: 2, transition: "width 0.3s ease",
              width: `${progress}%`,
              background: "linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)" }}>
            <span>Week {status.position} of {status.total_weeks}</span>
            <span>{status.current_week_label}</span>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 9, color: "var(--text-muted)" }}>
            <span>{status.emails_processed.toLocaleString()} emails</span>
            <span>{status.alerts_generated} alerts</span>
          </div>
        </div>
      )}
    </div>
  );
}
