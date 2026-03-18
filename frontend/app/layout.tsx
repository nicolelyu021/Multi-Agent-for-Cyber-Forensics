import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enron Threat Analysis — Forensic Traceability Dashboard",
  description: "Multi-Agent Insider Threat Analysis with Forensic Traceability",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
