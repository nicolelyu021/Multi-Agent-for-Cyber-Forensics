// ── Graph Types ──
export interface GraphNode {
  id: string;
  name: string;
  department: string;
  degree: number;
  suspicion_score?: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  volume: number;
  anomaly_score: number;
  threat_count?: number;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Forensic Types ──
export interface ForensicRecord {
  id: number;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  agent_id: string;
  timestamp: string;
  event_type: string;
  tool_name: string | null;
  tool_input: string | null;
  tool_output: string | null;
  tool_call_hash: string | null;
  reasoning_summary: string | null;
  confidence_score: number | null;
  proposed_action: string | null;
  datasets_accessed: string | null;
  record_hash: string;
  previous_record_hash: string | null;
}

export interface ChainVerification {
  chain_valid: boolean;
  records: {
    span_id: string;
    index: number;
    hash_match: boolean;
    link_valid: boolean;
    valid: boolean;
    computed_hash: string;
    stored_hash: string;
  }[];
}

export interface CounterfactualResult {
  final_confidence: number;
  attributions: Record<string, number>;
  message?: string;
  counterfactuals: Record<
    string,
    {
      confidence_without: number;
      delta: number;
      was_decisive: boolean;
    }
  >;
}

export interface TamperSimResult {
  tampered_index: number;
  tampered_span_id: string;
  tamper_detail: {
    field: string;
    original_value: string | number;
    tampered_value: string | number;
  };
  original_chain: ChainVerification;
  tampered_chain: ChainVerification;
}

// ── Analysis Types ──
export interface AnalysisRequest {
  start_date: string;
  end_date: string;
  anomaly_threshold?: number;
  confidence_threshold?: number;
}

export interface AnalysisResult {
  trace_id: string;
  final_confidence: number;
  threat_category: string;
  review_status: string;
  anomalies_found: number;
  emails_flagged: number;
  deliberation_triggered: boolean;
  alert_payload: AlertPayload | null;
}

export interface AlertPayload {
  alert_id: string;
  trace_id: string;
  threat_category: string;
  confidence_score: number;
  summary: string;
  anomalous_edges: Record<string, unknown>[];
  behavioral_profiles: Record<string, unknown>[];
  proposed_action: string;
}

// ── Human Review Types ──
export interface PendingReview {
  trace_id: string;
  span_id: string;
  confidence_score: number;
  proposed_action: string;
  reasoning_summary: string;
  timestamp: string;
}

export interface ReviewDecision {
  analyst_id: string;
  decision: "confirm" | "dismiss" | "escalate";
  rationale: string;
}

// ── Compliance Types ──
export interface ComplianceRow {
  requirement: string;
  framework: string;
  feature: string;
  status: "demonstrated" | "partial" | "pending";
  evidence_trace_id?: string;
}

// ── Dashboard State ──
export type RightPanelView =
  | "forensic"
  | "compliance"
  | "person"
  | "empty";

export type ThreatCategory =
  | "financial_fraud"
  | "data_destruction"
  | "inappropriate_relations";

export type Persona = "soc_analyst" | "compliance_officer" | "executive";
