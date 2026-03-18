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
}) {
  const qs = new URLSearchParams();
  if (params?.start_date) qs.set("start_date", params.start_date);
  if (params?.end_date) qs.set("end_date", params.end_date);
  if (params?.department) qs.set("department", params.department);
  if (params?.threat_category) qs.set("threat_category", params.threat_category);
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
