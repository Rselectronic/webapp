import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  created: { label: "Created", variant: "secondary" },
  procurement: { label: "Procurement", variant: "secondary" },
  parts_ordered: { label: "Parts Ordered", variant: "secondary" },
  parts_received: { label: "Parts Received", variant: "default" },
  production: { label: "Production", variant: "default" },
  inspection: { label: "Inspection", variant: "default" },
  shipping: { label: "Shipping", variant: "default" },
  delivered: { label: "Delivered", variant: "default" },
  invoiced: { label: "Invoiced", variant: "default" },
  archived: { label: "Archived", variant: "destructive" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    variant: "secondary" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
