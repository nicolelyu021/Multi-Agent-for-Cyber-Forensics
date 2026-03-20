"use client";
import type { Persona } from "@/lib/types";
import { Shield, Scale, BarChart3 } from "lucide-react";

const PERSONAS: { key: Persona; label: string; icon: typeof Shield }[] = [
  { key: "soc_analyst", label: "SOC Analyst", icon: Shield },
  { key: "compliance_officer", label: "Compliance", icon: Scale },
  { key: "executive", label: "Executive", icon: BarChart3 },
];

interface PersonaSwitcherProps {
  persona: Persona;
  onChange: (p: Persona) => void;
}

export function PersonaSwitcher({ persona, onChange }: PersonaSwitcherProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {PERSONAS.map(({ key, label, icon: Icon }) => {
        const active = persona === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              cursor: "pointer", transition: "all 0.15s",
              background: active ? "rgba(59,130,246,0.12)" : "transparent",
              color: active ? "var(--accent-blue)" : "var(--text-muted)",
              border: `1px solid ${active ? "rgba(59,130,246,0.3)" : "transparent"}`,
            }}
          >
            <Icon style={{ width: 12, height: 12 }} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
