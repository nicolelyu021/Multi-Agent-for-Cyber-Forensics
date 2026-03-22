"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { AlertPayload } from "@/lib/types";

export interface GraphUpdate {
  type: "graph_update";
  week: string;
  position: number;
  total_weeks: number;
  emails_in_batch: number;
  nodes: { id: string; name: string; department: string }[];
  edges: { source: string; target: string; volume: number; anomaly_score: number }[];
}

export interface SlackNotificationWS {
  type: "slack_notification";
  id: string;
  channel: string;
  severity: string;
  message: string;
  created_at: string;
}

function getWsUrl() {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/alerts`;
}

export function useWebSocket(url?: string) {
  const [alerts, setAlerts] = useState<AlertPayload[]>([]);
  const [graphUpdates, setGraphUpdates] = useState<GraphUpdate[]>([]);
  const [slackNotifications, setSlackNotifications] = useState<SlackNotificationWS[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const wsUrl = url || getWsUrl();
    if (!wsUrl) return;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Send heartbeat every 30s
        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 30000);
        ws.addEventListener("close", () => clearInterval(heartbeat));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "graph_update") {
            setGraphUpdates((prev) => [data as GraphUpdate, ...prev.slice(0, 49)]);
          } else if (data.type === "slack_notification") {
            setSlackNotifications((prev) => [data as SlackNotificationWS, ...prev.slice(0, 49)]);
          } else if (data.type === "stream_alert") {
            // Stream alerts show as both alerts and slack notifications
            const alert: AlertPayload = {
              alert_id: data.alert_id,
              trace_id: data.trace_id,
              threat_category: data.threat_category,
              confidence_score: data.confidence_score,
              summary: data.summary,
              anomalous_edges: data.anomalous_edges || [],
              behavioral_profiles: [],
              proposed_action: data.proposed_action || "review_required",
            };
            setAlerts((prev) => [alert, ...prev]);
          } else {
            // Regular alert
            const alert: AlertPayload = data;
            setAlerts((prev) => [alert, ...prev]);
          }
        } catch {
          // Ignore non-JSON messages (heartbeat responses etc.)
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    } catch {
      reconnectRef.current = setTimeout(connect, 3000);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.alert_id !== alertId));
  }, []);

  return { alerts, graphUpdates, slackNotifications, connected, dismissAlert };
}
