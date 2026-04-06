import { Badge } from "@/components/ui/badge";

const SEVERITY_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  minor: { label: "Minor", variant: "secondary" },
  major: { label: "Major", variant: "default" },
  critical: { label: "Critical", variant: "destructive" },
};

export function NCRSeverityBadge({ severity }: { severity: string }) {
  const config = SEVERITY_CONFIG[severity] ?? {
    label: severity,
    variant: "secondary" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
