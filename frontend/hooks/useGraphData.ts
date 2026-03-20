"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getGraphSnapshot } from "@/lib/api";
import type { GraphNode, GraphEdge } from "@/lib/types";

export function useGraphData(filters: {
  start_date?: string;
  end_date?: string;
  department?: string;
  threat_category?: string;
  include_scores?: boolean;
}) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use refs to avoid recreating the callback on every render
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGraphSnapshot(filtersRef.current);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce refetch when filters change (especially during slider drag)
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchData();
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [filters.start_date, filters.end_date, filters.department, filters.threat_category, filters.include_scores, fetchData]);

  return { nodes, edges, loading, error, refetch: fetchData };
}
