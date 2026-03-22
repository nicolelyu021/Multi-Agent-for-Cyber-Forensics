"use client";
import { useState, useCallback } from "react";
import { getTraces, verifyChain, getCounterfactual, simulateTampering, exportReport } from "@/lib/api";
import type { ForensicRecord, ChainVerification, CounterfactualResult, TamperSimResult } from "@/lib/types";

export function useForensicTrace() {
  const [records, setRecords] = useState<ForensicRecord[]>([]);
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [counterfactual, setCounterfactual] = useState<CounterfactualResult | null>(null);
  const [tamperSim, setTamperSim] = useState<TamperSimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

  const loadTrace = useCallback(async (traceId: string) => {
    setLoading(true);
    setActiveTraceId(traceId);
    try {
      const data = await getTraces(traceId);
      setRecords(data);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVerification = useCallback(async (traceId: string) => {
    try {
      const data = await verifyChain(traceId);
      setVerification(data);
    } catch {
      setVerification(null);
    }
  }, []);

  const loadCounterfactual = useCallback(async (traceId: string) => {
    try {
      const data = await getCounterfactual(traceId);
      setCounterfactual(data);
    } catch {
      setCounterfactual(null);
    }
  }, []);

  const runTamperSim = useCallback(async (traceId: string) => {
    try {
      const data = await simulateTampering(traceId);
      setTamperSim(data);
    } catch {
      setTamperSim(null);
    }
  }, []);

  const downloadReport = useCallback(async (
    traceId: string,
    meta?: { threat?: string; date?: string },
  ) => {
    try {
      const blob = await exportReport(traceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = meta?.date || new Date().toISOString().slice(0, 10);
      const threat = (meta?.threat || "analysis").replace(/\s+/g, "_");
      const shortId = traceId.slice(0, 8);
      a.download = `enron_forensic_report_${dateStr}_${threat}_${shortId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download report", err);
    }
  }, []);

  return {
    records,
    verification,
    counterfactual,
    tamperSim,
    loading,
    activeTraceId,
    loadTrace,
    loadVerification,
    loadCounterfactual,
    runTamperSim,
    downloadReport,
  };
}
