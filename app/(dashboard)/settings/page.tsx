import { isAdminRole } from "@/lib/auth/roles";
import Link from "next/link";
import { DollarSign, FileSpreadsheet, Cpu, ScrollText, Mail, Database, CreditCard, Key, Plug, Clock, Building2, Package, Users, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
const settingsLinks = [
  {
    title: "Pricing Settings",
    description:
      "Adjust markup rates, assembly costs, labour rates, and NRE defaults.",
    href: "/settings/pricing",
    icon: DollarSign,
  },
  {
    title: "Labour Settings",
    description:
      "Monthly overhead + cycle times â†’ burdened shop rate used by the assembly pricing engine.",
    href: "/settings/labour",
    icon: Clock,
  },
  {
    title: "Payment Terms",
    description:
      "Manage the list of payment terms available in customer forms (Net 30, Net 60, etc.).",
    href: "/settings/payment-terms",
    icon: CreditCard,
  },
  {
    title: "Customer BOM Configs",
    description:
      "View and edit per-customer BOM parsing configurations (column mappings, encoding, header rows).",
    href: "/settings/customers",
    icon: FileSpreadsheet,
  },
  {
    title: "Suppliers",
    description:
      "Approved supplier list, contacts, and default currencies. Suppliers must be approved by the CEO before they can be selected on a PO.",
    href: "/settings/suppliers",
    icon: Building2,
  },
  {
    title: "Inventory",
    description:
      "Manage BG (background feeder) and Safety stock parts. Set min-stock thresholds, import lists, retire inactive parts.",
    href: "/settings/inventory",
    icon: Package,
  },
  {
    title: "M-Code Rules",
    description:
      "View the 47 PAR classification rules used by the M-Code engine.",
    href: "/settings/m-codes",
    icon: Cpu,
  },
  {
    title: "Component Database",
    description:
      "View, search, and manage the master component library with M-Code classifications.",
    href: "/settings/components",
    icon: Database,
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
  {
    title: "API Keys",
    description:
      "Manage permanent API keys for AI agents connecting to the MCP server. CEO only.",
    href: "/settings/api-keys",
    icon: Key,
  },
  {
    title: "API Configuration",
    description:
      "Manage distributor API credentials (DigiKey, Mouser, LCSC, Avnet, Arrow, etc.) and preferred currencies. CEO only.",
    href: "/settings/api-config",
    icon: Plug,
  },
  {
    title: "Historic Invoice Import",
    description:
      "Bulk-load pre-web-app invoices (CAD only) so the Revenue Report spans the full RS history. Operational queries hide these rows automatically.",
    href: "/settings/historic-import",
    icon: History,
  },
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = !!profile?.is_active && isAdminRole(profile?.role);
  }

  // The "Users" tile is admin-only â€” the page itself also redirects
  // non-admins, but hiding the tile keeps the index clean for ops users
  // who can land here via other tiles.
  const visibleLinks = isAdmin
    ? [
        {
          title: "Users",
          description:
            "Add team members, change roles, deactivate accounts, and trigger password resets. Admin only.",
          href: "/settings/users",
          icon: Users,
        },
        ...settingsLinks,
      ]
    : settingsLinks;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500">
          Manage pricing, customer configurations, and classification rules.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleLinks.map((item) => (
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
