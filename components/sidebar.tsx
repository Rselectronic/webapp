"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Calculator,
  Briefcase,
  ShoppingCart,
  Factory,
  FileText,
  ShieldCheck,
  Package,
  Settings,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "BOMs", href: "/bom", icon: FileSpreadsheet },
  { name: "Quotes", href: "/quotes", icon: Calculator },
  { name: "Jobs", href: "/jobs", icon: Briefcase },
  { name: "Procurement", href: "/procurement", icon: ShoppingCart },
  { name: "Production", href: "/production", icon: Factory },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Quality", href: "/quality", icon: ShieldCheck },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-white transition-all duration-200 dark:border-gray-800 dark:bg-gray-950",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center border-b px-3 dark:border-gray-800">
        {!collapsed && (
          <h1 className="flex-1 truncate px-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            RS PCB Assembly
          </h1>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
            collapsed && "mx-auto"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center" : "gap-3",
                isActive
                  ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
