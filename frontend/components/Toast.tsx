"use client";
import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from "react";
import { X, AlertTriangle, CheckCircle, Info } from "lucide-react";

type ToastType = "error" | "success" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_CONFIG: Record<ToastType, { icon: typeof Info; color: string; bg: string; border: string }> = {
  error: {
    icon: AlertTriangle,
    color: "var(--accent-red, #ef4444)",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.3)",
  },
  success: {
    icon: CheckCircle,
    color: "var(--accent-green, #22c55e)",
    bg: "rgba(34, 197, 94, 0.08)",
    border: "rgba(34, 197, 94, 0.3)",
  },
  info: {
    icon: Info,
    color: "var(--accent-blue, #3b82f6)",
    bg: "rgba(59, 130, 246, 0.08)",
    border: "rgba(59, 130, 246, 0.3)",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: ToastType, message: string, duration = 5000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 16px",
        borderRadius: 10,
        background: config.bg,
        border: `1px solid ${config.border}`,
        backdropFilter: "blur(12px)",
        maxWidth: 380,
        animation: "slideIn 0.2s ease-out",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      <Icon style={{ width: 16, height: 16, color: config.color, flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: 12, color: "var(--text-primary, #e6edf3)", lineHeight: 1.5, margin: 0, flex: 1 }}>
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "transparent",
          border: "none",
          padding: 2,
          cursor: "pointer",
          color: "var(--text-muted, #7d8590)",
          flexShrink: 0,
        }}
      >
        <X style={{ width: 12, height: 12 }} />
      </button>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
