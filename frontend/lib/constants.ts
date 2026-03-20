export const THREAT_COLORS: Record<string, string> = {
  financial_fraud: "#ef4444",         // red
  data_destruction: "#f59e0b",        // amber
  inappropriate_relations: "#a855f7", // purple
  unknown: "#6b7280",
};

// Department colors are intentionally distinct from threat colors.
// Threats use red/amber/purple, so departments avoid those exact hues.
export const DEPARTMENT_COLORS: Record<string, string> = {
  Executive: "#3b82f6",   // blue
  Finance: "#06b6d4",     // cyan (was red — clashed with Financial Fraud)
  Accounting: "#14b8a6",  // teal (was amber — clashed with Data Destruction)
  Legal: "#22c55e",       // green
  Trading: "#818cf8",     // indigo (was purple — clashed with Inappropriate)
  Research: "#0ea5e9",    // sky blue
  Unknown: "#6b7280",     // gray
};

export const AGENT_LABELS: Record<string, string> = {
  investigator: "Investigator",
  sentiment_analyzer: "Sentiment Analyzer",
  deliberation: "Deliberation",
  escalation: "Escalation",
};

export interface ComplianceRowDef {
  requirement: string;
  framework: string;
  feature: string;
  /** Which forensic event types prove this requirement */
  evidenceEventTypes: string[];
  /** Fallback status when no trace exists */
  defaultStatus: "demonstrated" | "partial" | "pending";
}

export const COMPLIANCE_ROWS: ComplianceRowDef[] = [
  {
    requirement: "Measure 2.8 (Transparency)",
    framework: "NIST AI RMF",
    feature: "Forensic Wrapper + Hash Chain",
    evidenceEventTypes: ["agent_start", "agent_end", "tool_call"],
    defaultStatus: "pending",
  },
  {
    requirement: "Map 1.6 (Human Oversight)",
    framework: "NIST AI RMF",
    feature: "Analyst Override Gate",
    evidenceEventTypes: ["human_override"],
    defaultStatus: "pending",
  },
  {
    requirement: "Govern 1.2 (Accountability)",
    framework: "NIST AI RMF",
    feature: "Append-Only Hash Chain + Tamper Detection",
    evidenceEventTypes: ["agent_end"],
    defaultStatus: "pending",
  },
  {
    requirement: "Article 9 (Risk Management)",
    framework: "EU AI Act",
    feature: "Confidence Thresholds + Deliberation",
    evidenceEventTypes: ["inter_agent_deliberation", "escalation_alert"],
    defaultStatus: "pending",
  },
  {
    requirement: "Article 13 (Transparency)",
    framework: "EU AI Act",
    feature: "Three-Layer Forensic Traces",
    evidenceEventTypes: ["agent_end", "tool_call"],
    defaultStatus: "pending",
  },
  {
    requirement: "Article 14 (Human Oversight)",
    framework: "EU AI Act",
    feature: "Human Review Gate + Override Logging",
    evidenceEventTypes: ["escalation_alert", "human_override"],
    defaultStatus: "pending",
  },
];
