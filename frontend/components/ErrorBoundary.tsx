"use client";
import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-primary, #0b0e11)",
            color: "var(--text-primary, #e6edf3)",
            fontFamily: "Inter, -apple-system, sans-serif",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 420, padding: 32 }}>
            <AlertTriangle
              style={{
                width: 48,
                height: 48,
                color: "var(--accent-red, #ef4444)",
                margin: "0 auto 16px",
              }}
            />
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted, #7d8590)",
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              The dashboard encountered an unexpected error. This is usually caused
              by a backend connection issue.
            </p>
            <pre
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                padding: 12,
                borderRadius: 8,
                background: "var(--bg-card, #161b22)",
                border: "1px solid var(--border, #30363d)",
                color: "var(--accent-red, #ef4444)",
                textAlign: "left",
                overflow: "auto",
                maxHeight: 120,
                marginBottom: 20,
              }}
            >
              {this.state.error?.message || "Unknown error"}
            </pre>
            <button
              onClick={this.handleRetry}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: "var(--accent-blue, #3b82f6)",
                color: "#fff",
                border: "none",
                transition: "opacity 0.15s",
              }}
            >
              <RefreshCw style={{ width: 14, height: 14 }} />
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
