"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Settings,
  BarChart3,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, enabled: true },
  { name: "Customers", href: "/customers", icon: Users, enabled: true },
  { name: "BOMs", href: "/bom", icon: FileSpreadsheet, enabled: false },
  { name: "Quotes", href: "/quotes", icon: Calculator, enabled: false },
  { name: "Jobs", href: "/jobs", icon: Briefcase, enabled: false },
  { name: "Procurement", href: "/procurement", icon: ShoppingCart, enabled: false },
  { name: "Production", href: "/production", icon: Factory, enabled: false },
  { name: "Invoices", href: "/invoices", icon: FileText, enabled: false },
  { name: "Reports", href: "/reports", icon: BarChart3, enabled: false },
  { name: "Settings", href: "/settings", icon: Settings, enabled: false },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-lg font-bold text-gray-900">RS PCB Assembly</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.enabled ? item.href : "#"}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : item.enabled
                    ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    : "cursor-not-allowed text-gray-300"
              )}
              onClick={(e) => {
                if (!item.enabled) e.preventDefault();
              }}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
              {!item.enabled && (
                <span className="ml-auto text-xs text-gray-300">Soon</span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
