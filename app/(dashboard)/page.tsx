import { KpiCard } from "@/components/kpi-card";
import {
  Briefcase,
  Calculator,
  FileText,
  Users,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500">
          Welcome to the RS PCB Assembly management system.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Active Customers"
          value={11}
          description="Total active accounts"
          icon={Users}
        />
        <KpiCard
          title="Open Quotes"
          value={0}
          description="Pending review"
          icon={Calculator}
        />
        <KpiCard
          title="Active Jobs"
          value={0}
          description="In progress"
          icon={Briefcase}
        />
        <KpiCard
          title="Unpaid Invoices"
          value="$0.00"
          description="Outstanding balance"
          icon={FileText}
        />
      </div>

      <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
        <p className="text-lg font-medium">Recent Activity</p>
        <p className="mt-2 text-sm">
          Activity feed will appear here as quotes, jobs, and invoices are created.
        </p>
      </div>
    </div>
  );
}
