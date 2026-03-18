"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { AlertPayload } from "@/lib/types";

export function useWebSocket(url = "ws://localhost:8000/ws/alerts") {
  const [alerts, setAlerts] = useState<AlertPayload[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
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
          const alert: AlertPayload = JSON.parse(event.data);
          setAlerts((prev) => [alert, ...prev]);
        } catch {
          // Ignore non-JSON messages (heartbeat responses etc.)
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 3s
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

  return { alerts, connected, dismissAlert };
}
