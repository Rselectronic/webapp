"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";

const M_CODES = [
  { value: "0201", desc: "Ultra-tiny passives" },
  { value: "0402", desc: "Small passives" },
  { value: "CP", desc: "Chip Package (standard SMT)" },
  { value: "CPEXP", desc: "Expanded SMT" },
  { value: "IP", desc: "IC Package (large SMT)" },
  { value: "TH", desc: "Through-Hole" },
  { value: "MANSMT", desc: "Manual SMT" },
  { value: "MEC", desc: "Mechanical" },
  { value: "Accs", desc: "Accessories" },
  { value: "CABLE", desc: "Wiring/Cables" },
  { value: "DEV B", desc: "Development boards" },
] as const;

interface McodeSelectProps {
  value: string | null;
  confidence?: number | null;
  source?: string | null;
  onSelect: (mcode: string) => void;
}

export function McodeSelect({ value, source, onSelect }: McodeSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "justify-between min-w-[90px] text-xs font-mono",
            !value && "text-orange-600 border-orange-300 bg-orange-50",
            value && source === "manual" && "border-blue-300 bg-blue-50",
            value && source === "database" && "border-green-300 bg-green-50",
            value && source === "rules" && "border-gray-200"
          )}
        >
          {value ?? "Assign"}
          <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-1" align="start">
        <div className="space-y-0.5">
          {M_CODES.map((m) => (
            <button
              key={m.value}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-gray-100 text-left",
                value === m.value && "bg-gray-100"
              )}
              onClick={() => { onSelect(m.value); setOpen(false); }}
            >
              <Check className={cn("h-3 w-3 shrink-0", value === m.value ? "opacity-100" : "opacity-0")} />
              <span className="font-mono font-semibold w-14 shrink-0">{m.value}</span>
              <span className="text-gray-500 truncate">{m.desc}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
