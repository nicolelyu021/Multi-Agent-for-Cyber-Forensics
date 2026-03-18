"use client";

interface ConfidenceGaugeProps {
  value: number;
  size?: number;
}

export function ConfidenceGauge({ value, size = 64 }: ConfidenceGaugeProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * (1 - value);

  const color =
    value >= 0.7
      ? "var(--accent-red)"
      : value >= 0.4
        ? "var(--accent-amber)"
        : "var(--accent-green)";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--bg-card)" strokeWidth={4}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference} strokeDashoffset={progress}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>
          {(value * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
