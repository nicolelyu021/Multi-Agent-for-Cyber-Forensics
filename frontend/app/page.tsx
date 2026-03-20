"use client";
import { Dashboard } from "@/components/Dashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";

export default function Home() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Dashboard />
      </ToastProvider>
    </ErrorBoundary>
  );
}
