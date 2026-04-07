import Link from "next/link";
import { DollarSign, FileSpreadsheet, Cpu, ScrollText, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const settingsLinks = [
  {
    title: "Pricing Settings",
    description:
      "Adjust markup rates, assembly costs, labour rates, and NRE defaults.",
    href: "/settings/pricing",
    icon: DollarSign,
  },
  {
    title: "Customer BOM Configs",
    description:
      "View and edit per-customer BOM parsing configurations (column mappings, encoding, header rows).",
    href: "/settings/customers",
    icon: FileSpreadsheet,
  },
  {
    title: "M-Code Rules",
    description:
      "View the 47 PAR classification rules used by the M-Code engine.",
    href: "/settings/m-codes",
    icon: Cpu,
  },
  {
    title: "Email Templates",
    description:
      "Create and manage reusable email templates for quotes, invoices, shipping, and procurement.",
    href: "/settings/email-templates",
    icon: Mail,
  },
  {
    title: "Audit Log",
    description:
      "View a chronological log of all data changes across the system. CEO only.",
    href: "/settings/audit",
    icon: ScrollText,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500">
          Manage pricing, customer configurations, and classification rules.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settingsLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:border-gray-400">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <div className="rounded-md bg-gray-100 p-2">
                  <item.icon className="h-5 w-5 text-gray-700" />
                </div>
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">{item.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
