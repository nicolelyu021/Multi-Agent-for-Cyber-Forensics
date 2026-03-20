"use client";
import { useState, useEffect } from "react";
import { getSlackNotifications } from "@/lib/api";
import type { SlackNotification } from "@/lib/api";
import type { SlackNotificationWS } from "@/hooks/useWebSocket";
import { Hash, Bell, AlertTriangle, CheckCircle } from "lucide-react";

interface SlackNotificationLogProps {
  wsNotifications?: SlackNotificationWS[];
}

export function SlackNotificationLog({ wsNotifications = [] }: SlackNotificationLogProps) {
  const [dbNotifications, setDbNotifications] = useState<SlackNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSlackNotifications(30)
      .then(setDbNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Refresh when new WS notifications arrive
  useEffect(() => {
    if (wsNotifications.length > 0) {
      getSlackNotifications(30).then(setDbNotifications).catch(() => {});
    }
  }, [wsNotifications.length]);

  // Merge WS + DB, dedup by id
  const allNotifications = (() => {
    const seen = new Set<string>();
    const merged: { id: string; severity: string; message: string; created_at: string; channel: string }[] = [];

    for (const n of wsNotifications) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        merged.push(n);
      }
    }
    for (const n of dbNotifications) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        merged.push(n);
      }
    }
    return merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
  })();

  const severityColor = (s: string) => {
    if (s === "HIGH") return "var(--accent-red)";
    if (s === "MODERATE") return "var(--accent-amber, #f59e0b)";
    return "var(--accent-green)";
  };

  const severityIcon = (s: string) => {
    if (s === "HIGH") return <AlertTriangle style={{ width: 12, height: 12 }} />;
    if (s === "MODERATE") return <Bell style={{ width: 12, height: 12 }} />;
    return <CheckCircle style={{ width: 12, height: 12 }} />;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Channel header (Slack-style) */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <Hash style={{ width: 16, height: 16, color: "var(--text-muted)" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          threat-alerts
        </span>
        <span style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 4, marginLeft: "auto",
          background: "rgba(125,133,144,0.1)", color: "var(--text-muted)", fontWeight: 600,
        }}>
          {allNotifications.length} messages
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {loading && allNotifications.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
            Loading notifications...
          </div>
        )}

        {!loading && allNotifications.length === 0 && (
          <div style={{
            padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 11,
          }}>
            <Bell style={{ width: 24, height: 24, opacity: 0.2, margin: "0 auto 8px" }} />
            <p>No notifications yet.</p>
            <p style={{ fontSize: 10 }}>Alerts will appear here when threats are detected.</p>
          </div>
        )}

        {allNotifications.map((n) => (
          <div
            key={n.id}
            style={{
              padding: "8px 14px", borderBottom: "1px solid rgba(125,133,144,0.08)",
              transition: "background 0.1s",
            }}
          >
            {/* Bot avatar + name */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 4,
                background: "linear-gradient(135deg, #3b82f6, #06b6d4)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Bell style={{ width: 11, height: 11, color: "white" }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
                Threat Detection Bot
              </span>
              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                {formatTime(n.created_at)}
              </span>
            </div>

            {/* Severity bar */}
            <div style={{
              borderLeft: `3px solid ${severityColor(n.severity)}`,
              paddingLeft: 10, marginLeft: 30,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 4, marginBottom: 4,
                color: severityColor(n.severity), fontSize: 10, fontWeight: 700,
              }}>
                {severityIcon(n.severity)}
                {n.severity} RISK
              </div>
              <div style={{
                fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}>
                {n.message.replace(/\*/g, "")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
