"use client";
import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { THREAT_COLORS } from "@/lib/constants";
import { useTheme } from "@/hooks/useTheme";
import type { AlertPayload } from "@/lib/types";

/** Darken a hex color for light-mode readability */
function darkenColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 0.7; // darken by 30%
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

interface AlertBannerProps {
  alerts: AlertPayload[];
  onDismiss: (alertId: string) => void;
  onClick: (alert: AlertPayload) => void;
}

export function AlertBanner({ alerts, onDismiss, onClick }: AlertBannerProps) {
  const { theme } = useTheme();

  if (alerts.length === 0) return null;

  const latest = alerts[0];
  const color = THREAT_COLORS[latest.threat_category] || THREAT_COLORS.unknown;
  // In light mode, use a darker shade for text readability
  const textColor = theme === "light" ? darkenColor(color) : color;

  return (
    <div
      className="alert-enter"
      onClick={() => onClick(latest)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 24px", cursor: "pointer",
        background: theme === "light" ? `${color}12` : `${color}15`,
        borderBottom: `1px solid ${color}40`,
      }}
    >
      <AlertTriangle style={{ width: 20, height: 20, flexShrink: 0, color: textColor }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
            {latest.threat_category.replace("_", " ").toUpperCase()}
          </span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 100,
            background: `${color}30`, color: textColor,
          }}>
            {(latest.confidence_score * 100).toFixed(0)}% confidence
          </span>
        </div>
        <p style={{
          fontSize: 11, color: "var(--text-secondary)", marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {latest.summary?.slice(0, 120)}...
        </p>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onClick(latest); }}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 11, padding: "4px 10px", borderRadius: 4,
          color: textColor, background: `${color}20`, border: "none", cursor: "pointer",
        }}
      >
        View <ArrowRight style={{ width: 12, height: 12 }} />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(latest.alert_id); }}
        style={{
          padding: 4, borderRadius: 4, border: "none", cursor: "pointer",
          background: "transparent", color: "var(--text-muted)",
          transition: "background 0.15s",
        }}
      >
        <X style={{ width: 16, height: 16 }} />
      </button>

      {alerts.length > 1 && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
          +{alerts.length - 1} more
        </span>
      )}
    </div>
  );
}
