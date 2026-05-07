"use client";

import { useState, type ReactNode } from "react";
import { LayoutDashboard, type LucideIcon } from "lucide-react";

// Icon registry — keyed by string so server components can pick an icon
// without passing a non-serializable component reference across the
// server/client boundary. Add entries here as new tab icons are needed.
const ICONS: Record<string, LucideIcon> = {
  layout: LayoutDashboard,
};

export type DashboardTabIcon = keyof typeof ICONS;

export interface DashboardTab {
  id: string;
  label: string;
  icon: DashboardTabIcon;
  /** Optional badge count (shown next to label when > 0). */
  count?: number;
  content: ReactNode;
}

interface DashboardTabsProps {
  tabs: DashboardTab[];
  /** Defaults to the first tab's id. */
  defaultTabId?: string;
}

// Generic tab shell. Currently the dashboard ships with just one tab
// (Overview) — the row stays in place so adding a second tab later is
// a one-line change.
export function DashboardTabs({ tabs, defaultTabId }: DashboardTabsProps) {
  const [active, setActive] = useState(defaultTabId ?? tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  // Hide the tab row entirely when there's only one tab — no point in
  // showing a single-item nav. Re-appears automatically when a second
  // tab is added.
  const showTabBar = tabs.length > 1;

  return (
    <div>
      {showTabBar && (
        <div className="flex gap-1 border-b dark:border-gray-800 mb-6">
          {tabs.map((tab) => {
            const Icon = ICONS[tab.icon] ?? LayoutDashboard;
            const isActive = tab.id === current?.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {current?.content}
    </div>
  );
}
