import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  open: { label: "Open", variant: "destructive" },
  investigating: { label: "Investigating", variant: "default" },
  corrective_action: { label: "Corrective Action", variant: "default" },
  closed: { label: "Closed", variant: "secondary" },
};

export function NCRStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    variant: "secondary" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
