"use client";
import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

interface AuditReportExportProps {
  onExport: () => void;
}

export function AuditReportExport({ onExport }: AuditReportExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport();
    } finally {
      setTimeout(() => setExporting(false), 1000);
    }
  };

  return (
    <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
      <button
        onClick={handleExport}
        disabled={exporting}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: "var(--bg-card)", color: "var(--text-secondary)",
          border: "1px solid var(--border)", cursor: exporting ? "not-allowed" : "pointer",
          opacity: exporting ? 0.5 : 1, transition: "all 0.15s",
        }}
      >
        {exporting ? (
          <>
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            Generating Report...
          </>
        ) : (
          <>
            <FileDown style={{ width: 16, height: 16 }} />
            Export Audit Report (PDF)
          </>
        )}
      </button>
    </div>
  );
}
