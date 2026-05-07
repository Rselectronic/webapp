"use client";

import { useRef, useState } from "react";

type TabKey = "components" | "pcb" | "stencil";

interface Props {
  children: {
    components: React.ReactNode;
    pcb: React.ReactNode;
    stencil: React.ReactNode;
  };
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "components", label: "Components" },
  { key: "pcb", label: "PCB Orders" },
  { key: "stencil", label: "Stencil Orders" },
];

export function ProcTabs({ children }: Props) {
  const [active, setActive] = useState<TabKey>("components");
  // Track which tabs have been visited so we only mount a tab's contents the
  // first time it's opened. Once mounted, it stays in the tree (hidden via
  // CSS) so it retains state and doesn't refetch when you tab back to it.
  const mounted = useRef<Set<TabKey>>(new Set(["components"]));
  mounted.current.add(active);

  return (
    <div>
      <div className="mb-4 flex border-b border-gray-200">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={
                "rounded-t-md px-4 py-2 text-sm font-medium transition-colors " +
                (isActive
                  ? "border-b-2 border-blue-500 text-gray-900"
                  : "text-gray-500 hover:text-gray-700")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div>
        {mounted.current.has("components") && (
          <div className={active === "components" ? "" : "hidden"}>
            {children.components}
          </div>
        )}
        {mounted.current.has("pcb") && (
          <div className={active === "pcb" ? "" : "hidden"}>
            {children.pcb}
          </div>
        )}
        {mounted.current.has("stencil") && (
          <div className={active === "stencil" ? "" : "hidden"}>
            {children.stencil}
          </div>
        )}
      </div>
    </div>
  );
}
