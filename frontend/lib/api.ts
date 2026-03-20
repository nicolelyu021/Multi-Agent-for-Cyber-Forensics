const API_BASE = "/api";

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── Graph ──
export async function getGraphSnapshot(params?: {
  start_date?: string;
  end_date?: string;
  department?: string;
  threat_category?: string;
  include_scores?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params?.start_date) qs.set("start_date", params.start_date);
  if (params?.end_date) qs.set("end_date", params.end_date);
  if (params?.department) qs.set("department", params.department);
  if (params?.threat_category) qs.set("threat_category", params.threat_category);
  if (params?.include_scores) qs.set("include_scores", "true");
  return fetchJSON<{ nodes: any[]; edges: any[] }>(`/graph/snapshot?${qs}`);
}

// ── Analysis ──
export async function startAnalysis(body: {
  start_date: string;
  end_date: string;
  anomaly_threshold?: number;
  confidence_threshold?: number;
}) {
  return fetchJSON<{ run_id: string; status: string }>("/analysis/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getAnalysisStatus(runId: string) {
  return fetchJSON<{ run_id: string; status: string }>(`/analysis/status/${runId}`);
}

export async function getAnalysisResults(runId: string) {
  return fetchJSON<{ run_id: string; status: string; result: any }>(`/analysis/results/${runId}`);
}

/** Poll analysis status until completed/failed, then return results */
export async function pollAnalysisUntilDone(
  runId: string,
  onStatusChange?: (status: string) => void,
  maxWaitMs = 120000,
  intervalMs = 2000,
): Promise<{ run_id: string; status: string; result: any }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const statusResp = await getAnalysisStatus(runId);
    onStatusChange?.(statusResp.status);
    if (statusResp.status === "completed" || statusResp.status === "failed") {
      return getAnalysisResults(runId);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Analysis timed out");
}

// ── Forensic ──
export interface TraceSummary {
  trace_id: string;
  started_at: string;
  ended_at: string;
  record_count: number;
  confidence: number | null;
  threat_category: string | null;
  people: string[];
  short_summary: string;
}

export async function listTraces(): Promise<TraceSummary[]> {
  return fetchJSON<TraceSummary[]>("/forensic/traces");
}

export async function getTraces(traceId: string) {
  return fetchJSON<any[]>(`/forensic/traces/${traceId}`);
}

export async function verifyChain(traceId: string) {
  return fetchJSON<any>(`/forensic/verify/${traceId}`);
}

export async function getCounterfactual(traceId: string) {
  return fetchJSON<any>(`/forensic/counterfactual/${traceId}`);
}

export async function simulateTampering(traceId: string) {
  return fetchJSON<any>(`/forensic/tamper-sim/${traceId}`);
}

export async function exportReport(traceId: string) {
  const res = await fetch(`${API_BASE}/forensic/export-report/${traceId}`);
  if (!res.ok) throw new Error("Failed to export report");
  return res.blob();
}

// ── Flagged Emails ──
export interface FlaggedEmail {
  message_id: string;
  subject: string;
  body: string;
  from_addr: string;
  to_addr: string;
  date: string;
  vader_compound: number | null;
  keywords: Record<string, string[]>;
  flagged: boolean;
}

export async function getFlaggedEmails(traceId: string): Promise<FlaggedEmail[]> {
  return fetchJSON<FlaggedEmail[]>(`/forensic/emails/${traceId}`);
}

// ── Person Explanation ──
export async function getPersonExplanation(
  traceId: string,
  personEmail: string,
  persona: string = "soc_analyst",
): Promise<{ person: string; persona: string; explanation: string; metrics: any }> {
  return fetchJSON(`/forensic/explain/${traceId}/${encodeURIComponent(personEmail)}?persona=${persona}`);
}

// ── Monitoring ──
export async function getBaselines() {
  return fetchJSON<any[]>("/analysis/monitoring/baselines");
}

export async function getDeviations(traceId: string) {
  return fetchJSON<any[]>(`/analysis/monitoring/deviations/${traceId}`);
}

export async function getSensitivity(traceId: string, thresholds: string = "1.0,1.5,2.0,2.5,3.0") {
  return fetchJSON<{ threshold: number; flagged_edges: number; flagged_people: number }[]>(
    `/analysis/sensitivity/${traceId}?thresholds=${thresholds}`
  );
}

export async function getDrift(traceId: string) {
  return fetchJSON<any>(`/analysis/monitoring/drift/${traceId}`);
}

// ── Human Review ──
export async function getPendingReviews() {
  return fetchJSON<any[]>("/review/pending");
}

export async function submitReview(
  alertId: string,
  decision: { analyst_id: string; decision: string; rationale: string },
) {
  return fetchJSON<any>(`/review/${alertId}`, {
    method: "POST",
    body: JSON.stringify(decision),
  });
}

// ── Streaming Simulation ──
export async function startStream(speed: number = 5) {
  return fetchJSON<{ status: string; speed?: number }>("/analysis/monitoring/simulate-stream", {
    method: "POST",
    body: JSON.stringify({ speed }),
  });
}

export async function getStreamStatus() {
  return fetchJSON<{
    active: boolean;
    position: number;
    total_weeks: number;
    emails_processed: number;
    total_emails: number;
    alerts_generated: number;
    speed: number;
    current_week_label: string;
  }>("/analysis/monitoring/simulate-stream/status");
}

export async function stopStream() {
  return fetchJSON<{ status: string }>("/analysis/monitoring/simulate-stream/stop", {
    method: "POST",
  });
}

// ── Slack Notifications ──
export interface SlackNotification {
  id: string;
  trace_id: string;
  channel: string;
  severity: string;
  message: string;
  payload: string;
  created_at: string;
}

export async function getSlackNotifications(limit: number = 20) {
  return fetchJSON<SlackNotification[]>(`/analysis/notifications?limit=${limit}`);
}
