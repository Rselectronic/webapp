"use client";

import { useState, type ReactNode } from "react";
import { LayoutDashboard, GitBranch } from "lucide-react";

interface DashboardTabsProps {
  overviewContent: ReactNode;
  workflowsContent: ReactNode;
  workflowCount: number;
}

export function DashboardTabs({
  overviewContent,
  workflowsContent,
  workflowCount,
}: DashboardTabsProps) {
  const [tab, setTab] = useState<"overview" | "workflows">("overview");

  return (
    <div>
      <div className="flex gap-1 border-b dark:border-gray-800 mb-6">
        <button
          onClick={() => setTab("overview")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "overview"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Overview
        </button>
        <button
          onClick={() => setTab("workflows")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "workflows"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <GitBranch className="h-4 w-4" />
          Workflows
          {workflowCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {workflowCount}
            </span>
          )}
        </button>
      </div>

      {tab === "overview" ? overviewContent : workflowsContent}
    </div>
  );
}
