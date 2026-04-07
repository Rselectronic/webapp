import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  ordered: { label: "Ordered", variant: "secondary" },
  in_production: { label: "In Production", variant: "default" },
  shipped: { label: "Shipped", variant: "default" },
  received: { label: "Received", variant: "default" },
};

export function FabricationStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    variant: "secondary" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
