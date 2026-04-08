"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
  Menu,
  Truck,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, enabled: true },
  { name: "Customers", href: "/customers", icon: Users, enabled: true },
  { name: "BOMs", href: "/bom", icon: FileSpreadsheet, enabled: true },
  { name: "Quotes", href: "/quotes", icon: Calculator, enabled: true },
  { name: "Jobs", href: "/jobs", icon: Briefcase, enabled: true },
  { name: "Procurement", href: "/procurement", icon: ShoppingCart, enabled: true },
  { name: "Production", href: "/production", icon: Factory, enabled: true },
  { name: "Shipping", href: "/shipping", icon: Truck, enabled: true },
  { name: "Invoices", href: "/invoices", icon: FileText, enabled: true },
  { name: "Reports", href: "/reports", icon: BarChart3, enabled: true },
  { name: "Settings", href: "/settings", icon: Settings, enabled: true },
];

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu" />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>RS PCB Assembly</SheetTitle>
        </SheetHeader>
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
                onClick={(e) => {
                  if (!item.enabled) {
                    e.preventDefault();
                  } else {
                    setOpen(false);
                  }
                }}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                    : item.enabled
                      ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
                      : "cursor-not-allowed text-gray-300 dark:text-gray-600"
                )}
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
      </SheetContent>
    </Sheet>
  );
}
