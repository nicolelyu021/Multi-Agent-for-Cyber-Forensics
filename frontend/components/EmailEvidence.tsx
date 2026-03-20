"use client";
import { useState, useEffect, useMemo } from "react";
import { getFlaggedEmails } from "@/lib/api";
import type { FlaggedEmail } from "@/lib/api";
import { Mail, ChevronDown, ChevronRight, AlertTriangle, Search } from "lucide-react";

const THREAT_KEYWORDS = [
  "ljm", "raptor", "off-balance-sheet", "spe", "mark-to-market", "hide",
  "conceal", "manipulate", "inflate", "partnership", "chewco", "condor",
  "whitewing", "shred", "destroy", "delete", "clean up", "wipe", "purge",
  "harassment", "complaint", "hostile", "threatening", "retaliation",
];

function highlightKeywords(text: string): string {
  if (!text) return "";
  let safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const kw of THREAT_KEYWORDS) {
    const pattern = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    safe = safe.replace(pattern, '<span style="color:#ef4444;font-weight:600">$1</span>');
  }
  return safe;
}

function riskLabel(email: FlaggedEmail): { text: string; color: string } {
  const hasKeywords = Object.keys(email.keywords || {}).length > 0;
  const hasNegativeTone = email.vader_compound !== null && email.vader_compound < -0.3;
  if (hasKeywords && hasNegativeTone) return { text: "HIGH RISK", color: "var(--accent-red)" };
  if (hasKeywords) {
    const cats = Object.keys(email.keywords).map(c => c.replace(/_/g, " ")).join(", ");
    return { text: cats, color: "var(--accent-red)" };
  }
  if (hasNegativeTone) return { text: "Negative tone", color: "var(--accent-amber, #b45309)" };
  return { text: "Flagged", color: "var(--text-muted)" };
}

interface EmailEvidenceProps {
  traceId: string | null;
  personFilter?: string | null;
  edgeFilter?: { source: string; target: string } | null;
}

export function EmailEvidence({ traceId, personFilter, edgeFilter }: EmailEvidenceProps) {
  const [emails, setEmails] = useState<FlaggedEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!traceId) {
      setEmails([]);
      return;
    }
    setLoading(true);
    getFlaggedEmails(traceId)
      .then(setEmails)
      .catch(() => setEmails([]))
      .finally(() => setLoading(false));
  }, [traceId]);

  const filteredEmails = useMemo(() => {
    let result = emails;
    if (personFilter) {
      const p = personFilter.toLowerCase();
      result = result.filter(
        (e) => e.from_addr?.toLowerCase().includes(p) || e.to_addr?.toLowerCase().includes(p)
      );
    }
    if (edgeFilter) {
      const s = edgeFilter.source.toLowerCase();
      const t = edgeFilter.target.toLowerCase();
      result = result.filter(
        (e) =>
          (e.from_addr?.toLowerCase().includes(s) && e.to_addr?.toLowerCase().includes(t)) ||
          (e.from_addr?.toLowerCase().includes(t) && e.to_addr?.toLowerCase().includes(s))
      );
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.subject?.toLowerCase().includes(q) ||
          e.body?.toLowerCase().includes(q) ||
          e.from_addr?.toLowerCase().includes(q) ||
          e.to_addr?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [emails, personFilter, edgeFilter, searchQuery]);

  if (loading) {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: 8 }} />
        ))}
      </div>
    );
  }

  if (!traceId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-muted)" }}>
        <div style={{ textAlign: "center" }}>
          <Mail style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 12 }}>Run a threat analysis to view flagged emails</p>
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-muted)" }}>
        <div style={{ textAlign: "center" }}>
          <Mail style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 12 }}>No flagged emails found in this trace</p>
        </div>
      </div>
    );
  }

  // Group emails by keyword category
  const categoryMap: Record<string, number> = {};
  for (const e of emails) {
    for (const cat of Object.keys(e.keywords || {})) {
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Summary */}
      <div style={{
        padding: 10, borderRadius: 8,
        background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-red)", marginBottom: 4 }}>
          {filteredEmails.length} Flagged Email{filteredEmails.length !== 1 ? "s" : ""}
          {personFilter && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> involving {personFilter.split("@")[0]}</span>}
          {edgeFilter && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> between {edgeFilter.source.split("@")[0]} & {edgeFilter.target.split("@")[0]}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(categoryMap).map(([cat, count]) => (
            <span
              key={cat}
              style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 3,
                background: "rgba(239,68,68,0.12)", color: "var(--accent-red)",
                fontWeight: 600, textTransform: "uppercase",
              }}
            >
              {cat.replace(/_/g, " ")} ({count})
            </span>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <Search style={{
          width: 13, height: 13, position: "absolute", left: 10, top: "50%",
          transform: "translateY(-50%)", color: "var(--text-muted)",
        }} />
        <input
          type="text"
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%", padding: "7px 10px 7px 30px", borderRadius: 6,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            color: "var(--text-primary)", fontSize: 11, outline: "none",
          }}
        />
      </div>

      {/* Email list */}
      {filteredEmails.map((email, i) => {
        const isExpanded = expandedId === email.message_id;
        const risk = riskLabel(email);
        const allKeywords = Object.values(email.keywords || {}).flat();
        const fromName = (email.from_addr || "").split("@")[0].replace(/\./g, " ");
        const toName = (email.to_addr || "").split("@")[0].replace(/\./g, " ");
        const capitalize = (s: string) => s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

        return (
          <div
            key={email.message_id || i}
            style={{
              borderRadius: 8,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              overflow: "hidden", transition: "border-color 0.15s",
            }}
          >
            {/* Email header — always visible */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : email.message_id)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10, width: "100%",
                padding: "10px 12px", cursor: "pointer", textAlign: "left",
                background: "transparent", border: "none", color: "var(--text-primary)",
              }}
            >
              <div style={{ marginTop: 2, flexShrink: 0 }}>
                {isExpanded
                  ? <ChevronDown style={{ width: 14, height: 14, color: "var(--accent-cyan)" }} />
                  : <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  {email.subject || "(no subject)"}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                  {capitalize(fromName)} &rarr; {capitalize(toName)}
                  {email.date && <span> &middot; {email.date.slice(0, 10)}</span>}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {allKeywords.slice(0, 5).map((kw, j) => (
                    <span
                      key={j}
                      style={{
                        fontSize: 9, padding: "1px 5px", borderRadius: 3,
                        background: "rgba(239,68,68,0.12)", color: "var(--accent-red)",
                        fontWeight: 500,
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                  <span style={{ fontSize: 9, color: risk.color, fontWeight: 600, textTransform: "uppercase" }}>
                    {risk.text}
                  </span>
                </div>
              </div>
            </button>

            {/* Expanded body */}
            {isExpanded && (
              <div style={{
                padding: "0 12px 12px 36px",
                borderTop: "1px solid var(--border)",
              }}>
                {email.body ? (
                  <div style={{
                    marginTop: 10, padding: 10, borderRadius: 6,
                    background: "var(--bg-secondary)", border: "1px solid var(--border)",
                    fontSize: 11, lineHeight: 1.7, color: "var(--text-secondary)",
                    maxHeight: 200, overflowY: "auto",
                  }}>
                    <div dangerouslySetInnerHTML={{ __html: highlightKeywords(email.body) }} />
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, fontStyle: "italic" }}>
                    Email body not available in forensic records
                  </p>
                )}

                {/* Keyword details */}
                {Object.entries(email.keywords || {}).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>
                      Flagged Keywords
                    </div>
                    {Object.entries(email.keywords).map(([cat, terms]) => (
                      <div key={cat} style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent-red)" }}>
                          {cat.replace(/_/g, " ")}:
                        </span>{" "}
                        <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                          {terms.join(", ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
