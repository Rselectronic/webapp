"use client";

// ----------------------------------------------------------------------------
// RevenueControls
//
// Pure-client toggles for period (month/quarter/semi/annual), FY mode
// (calendar / tax / financial), and FY year. State is owned by the parent
// (<RevenueSection>) — clicks fire callbacks, no URL writes, no server
// round-trip. Toggles are instant.
// ----------------------------------------------------------------------------
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FY_LABELS,
  PERIOD_LABELS,
  type FYMode,
  type Period,
} from "@/lib/reports/revenue";

const PERIODS: Period[] = ["month", "quarter", "semi", "annual"];
const MODES: FYMode[] = ["calendar", "tax", "financial"];

export interface CustomerOption {
  id: string;
  code: string | null;
  company: string | null;
}

export function RevenueControls({
  activePeriod,
  activeMode,
  activeYear,
  yearOptions,
  activeCustomerId,
  customerOptions,
  onPeriodChange,
  onModeChange,
  onYearChange,
  onCustomerChange,
}: {
  activePeriod: Period;
  activeMode: FYMode;
  activeYear: number;
  yearOptions: number[];
  activeCustomerId: string;
  customerOptions: CustomerOption[];
  onPeriodChange: (p: Period) => void;
  onModeChange: (m: FYMode) => void;
  onYearChange: (y: number) => void;
  onCustomerChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {/* Period */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
          Period:
        </span>
        {PERIODS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={p === activePeriod ? "default" : "outline"}
            onClick={() => onPeriodChange(p)}
          >
            {PERIOD_LABELS[p]}
          </Button>
        ))}
      </div>

      {/* FY mode */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
          FY:
        </span>
        {MODES.map((m) => (
          <Button
            key={m}
            size="sm"
            variant={m === activeMode ? "default" : "outline"}
            onClick={() => onModeChange(m)}
            title={FY_LABELS[m]}
          >
            {m === "calendar" ? "Calendar" : m === "tax" ? "Tax" : "Financial"}
          </Button>
        ))}
      </div>

      {/* Year */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
          Year:
        </span>
        <Select
          value={String(activeYear)}
          onValueChange={(v) => onYearChange(Number(v))}
        >
          <SelectTrigger size="sm" className="min-w-[5rem]">
            <SelectValue>{(v: string) => v}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs uppercase tracking-wide text-gray-500">
          Customer:
        </span>
        <Select
          value={activeCustomerId === "" ? "__all__" : activeCustomerId}
          onValueChange={(v) =>
            onCustomerChange(v == null || v === "__all__" ? "" : v)
          }
        >
          <SelectTrigger size="sm" className="min-w-[14rem]">
            <SelectValue>
              {(v: string) => {
                if (v === "__all__") return "All customers";
                const c = customerOptions.find((c) => c.id === v);
                if (!c) return "";
                return c.code
                  ? `${c.code} — ${c.company ?? ""}`
                  : c.company ?? c.id;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All customers</SelectItem>
            {customerOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code ? `${c.code} — ${c.company ?? ""}` : c.company ?? c.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
