"use client";
import { useMemo } from "react";
import { Play, Pause, FastForward, Target } from "lucide-react";

interface TimeSliderProps {
  currentDate: string;
  startDate: string;
  endDate: string;
  isPlaying: boolean;
  speed: number;
  onDateChange: (date: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
  suspiciousOnly?: boolean;
  onSuspiciousOnlyChange?: (val: boolean) => void;
}

export function TimeSlider({
  currentDate, startDate, endDate, isPlaying, speed,
  onDateChange, onPlay, onPause, onSpeedChange,
  suspiciousOnly, onSuspiciousOnlyChange,
}: TimeSliderProps) {
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const currentMs = new Date(currentDate).getTime();
  const progress = endMs > startMs ? ((currentMs - startMs) / (endMs - startMs)) * 100 : 0;

  const markers = useMemo(() => [
    { date: "2000-10-01", label: "SPE Activity Spikes", color: "var(--accent-amber)" },
    { date: "2001-08-14", label: "Skilling Resigns", color: "var(--accent-red)" },
    { date: "2001-10-16", label: "$618M Loss", color: "var(--accent-red)" },
    { date: "2001-10-22", label: "SEC Investigation", color: "var(--accent-purple)" },
    { date: "2001-12-02", label: "Bankruptcy", color: "var(--accent-red)" },
  ], []);

  const formatShort = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
    } catch {
      return d;
    }
  };
  const formatFull = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } catch {
      return d;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Play button */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          style={{
            width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "var(--accent-blue)", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 0.15s",
          }}
        >
          {isPlaying
            ? <Pause style={{ width: 14, height: 14 }} />
            : <Play style={{ width: 14, height: 14, marginLeft: 2 }} />
          }
        </button>

        {/* Speed toggle */}
        <button
          onClick={() => onSpeedChange(speed === 1 ? 2 : speed === 2 ? 4 : 1)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: "var(--bg-card)", color: "var(--text-secondary)",
            border: "1px solid var(--border)", cursor: "pointer", flexShrink: 0,
          }}
        >
          <FastForward style={{ width: 10, height: 10 }} />
          {speed}x
        </button>

        {/* Suspicious-only toggle */}
        {onSuspiciousOnlyChange && (
          <button
            onClick={() => onSuspiciousOnlyChange(!suspiciousOnly)}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: suspiciousOnly ? "rgba(239,68,68,0.12)" : "var(--bg-card)",
              color: suspiciousOnly ? "var(--accent-red)" : "var(--text-secondary)",
              border: `1px solid ${suspiciousOnly ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
              cursor: "pointer", flexShrink: 0, transition: "all 0.15s",
            }}
            title="Show only suspicious employees"
          >
            <Target style={{ width: 10, height: 10 }} />
            Suspects
          </button>
        )}

        {/* Start label */}
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, minWidth: 60 }}>
          {formatShort(startDate)}
        </span>

        {/* Track container */}
        <div style={{ flex: 1, position: "relative", height: 28, minWidth: 100 }}>
          {/* Background track */}
          <div style={{
            position: "absolute", top: 12, left: 0, right: 0, height: 4,
            background: "var(--bg-card)", borderRadius: 2,
          }} />

          {/* Progress fill */}
          <div style={{
            position: "absolute", top: 12, left: 0, height: 4, borderRadius: 2,
            width: `${Math.max(0, Math.min(100, progress))}%`,
            background: "linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))",
            transition: isPlaying ? "width 0.8s linear" : "width 0.1s ease",
            pointerEvents: "none",
          }} />

          {/* Event markers */}
          {markers.map((m) => {
            const mMs = new Date(m.date).getTime();
            const pos = ((mMs - startMs) / (endMs - startMs)) * 100;
            if (pos < 0 || pos > 100) return null;
            return (
              <div
                key={m.date}
                title={m.label}
                style={{
                  position: "absolute", top: 6, left: `${pos}%`, transform: "translateX(-50%)",
                  width: 3, height: 16, borderRadius: 1,
                  background: m.color, opacity: 0.5,
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Thumb indicator (visual only) */}
          <div style={{
            position: "absolute", top: 8,
            left: `${Math.max(0, Math.min(100, progress))}%`,
            transform: "translateX(-50%)",
            width: 12, height: 12, borderRadius: "50%",
            background: "var(--accent-blue)", border: "2px solid var(--bg-primary)",
            boxShadow: "0 0 0 3px rgba(59,130,246,0.25)",
            pointerEvents: "none",
            transition: isPlaying ? "left 0.8s linear" : "left 0.1s ease",
          }} />

          {/* Invisible range input — ON TOP of everything for interaction */}
          <input
            type="range"
            min={startMs}
            max={endMs}
            value={currentMs}
            onChange={(e) => {
              const d = new Date(Number(e.target.value));
              onDateChange(d.toISOString().split("T")[0]);
            }}
            style={{
              position: "absolute", top: 0, left: 0, width: "100%", height: 28,
              opacity: 0, cursor: "pointer", margin: 0, zIndex: 10,
            }}
          />
        </div>

        {/* End label */}
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, minWidth: 60, textAlign: "right" }}>
          {formatShort(endDate)}
        </span>
      </div>

      {/* Current date display */}
      <div style={{ textAlign: "center" }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "var(--accent-cyan)",
          letterSpacing: "0.02em",
        }}>
          {formatFull(currentDate)}
        </span>
      </div>
    </div>
  );
}
