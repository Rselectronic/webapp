"use client";

/**
 * M-Code Distribution Donut Chart — pure CSS/SVG, no chart library.
 * Shows breakdown of component M-Code classifications on a parsed BOM.
 */

interface MCodeChartProps {
  /** Map of m_code -> count, e.g. { CP: 42, IP: 11, TH: 8 } */
  distribution: Record<string, number>;
}

/** Consistent M-Code color palette used across the entire app. */
export const MCODE_COLORS: Record<string, string> = {
  "0201": "#6366f1", // indigo
  "0402": "#8b5cf6", // violet
  CP: "#3b82f6", // blue
  CPEXP: "#0ea5e9", // sky
  IP: "#14b8a6", // teal
  TH: "#f97316", // orange
  MANSMT: "#ec4899", // pink
  MEC: "#78716c", // stone
  Accs: "#a3a3a3", // neutral
  CABLE: "#eab308", // yellow
  "DEV B": "#84cc16", // lime
  APCB: "#d946ef", // fuchsia
  Unclassified: "#ef4444", // red — stands out so you notice what still needs review
};

const MCODE_LABELS: Record<string, string> = {
  "0201": "Ultra-tiny passives",
  "0402": "Small passives",
  CP: "Chip Package (SMT)",
  CPEXP: "Expanded SMT",
  IP: "IC Package (large SMT)",
  TH: "Through-Hole",
  MANSMT: "Manual SMT",
  MEC: "Mechanical",
  Accs: "Accessories",
  CABLE: "Cables/Wiring",
  "DEV B": "Dev boards",
  APCB: "Auto-PCB",
  Unclassified: "Needs review",
};

function getColor(mcode: string): string {
  return MCODE_COLORS[mcode] ?? "#9ca3af";
}

export function MCodeChart({ distribution }: MCodeChartProps) {
  const entries = Object.entries(distribution)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return null;

  // Build SVG donut segments using stroke-dasharray on circles
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const segments = entries.map(([mcode, count]) => {
    const pct = count / total;
    const dashLength = pct * circumference;
    const dashGap = circumference - dashLength;
    const offset = -cumulativeOffset;
    cumulativeOffset += dashLength;

    return {
      mcode,
      count,
      pct,
      dashArray: `${dashLength} ${dashGap}`,
      dashOffset: offset,
      color: getColor(mcode),
    };
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      {/* Donut Chart */}
      <div className="relative flex-shrink-0">
        <svg
          width="160"
          height="160"
          viewBox="0 0 100 100"
          className="block"
        >
          {segments.map((seg) => (
            <circle
              key={seg.mcode}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              transform="rotate(-90 50 50)"
              className="transition-all duration-500"
            />
          ))}
          {/* Center text */}
          <text
            x="50"
            y="47"
            textAnchor="middle"
            className="fill-foreground text-[10px] font-bold"
          >
            {total}
          </text>
          <text
            x="50"
            y="57"
            textAnchor="middle"
            className="fill-muted-foreground text-[6px]"
          >
            components
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="grid gap-1.5 text-sm sm:gap-2">
        {segments.map((seg) => (
          <div key={seg.mcode} className="flex items-center gap-2.5">
            <span
              className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: seg.color }}
            />
            <span className="font-mono text-xs font-semibold min-w-fit whitespace-nowrap">
              {seg.mcode}
            </span>
            <span className="text-muted-foreground text-xs">
              {seg.count} ({Math.round(seg.pct * 100)}%)
            </span>
            <span className="hidden text-xs text-muted-foreground md:inline">
              {MCODE_LABELS[seg.mcode] ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
