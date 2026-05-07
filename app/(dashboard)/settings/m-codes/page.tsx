import { isAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MCodeRule {
  id: string;
  rule_id: string;
  priority: number;
  layer: number;
  field_1: string | null;
  operator_1: string | null;
  value_1: string | null;
  field_2: string | null;
  operator_2: string | null;
  value_2: string | null;
  assigned_m_code: string;
  description: string | null;
  is_active: boolean;
}

export default async function MCodeRulesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) redirect("/");

  const { data: rules, error } = await supabase
    .from("m_code_rules")
    .select("*")
    .order("priority", { ascending: true });

  const typedRules = (rules ?? []) as unknown as MCodeRule[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </Link>
      <div>
        <h2 className="text-2xl font-bold text-gray-900">M-Code Rules</h2>
        <p className="text-sm text-gray-500">
          Classification rules (PAR-01 through PAR-47) used by the M-Code
          engine. Read-only view â€” the active classification logic is in the
          TypeScript rule engine.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load M-Code rules. Check your Supabase connection.
        </div>
      ) : typedRules.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">
              No rules found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-gray-500">
              The m_code_rules table is empty. Seed it with the 47 PAR rules.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Rule ID</TableHead>
                <TableHead className="w-16 text-center">Priority</TableHead>
                <TableHead className="w-16 text-center">Layer</TableHead>
                <TableHead>Condition 1</TableHead>
                <TableHead>Condition 2</TableHead>
                <TableHead className="w-24">M-Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-16 text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typedRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {rule.rule_id}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {rule.priority}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {rule.layer}
                  </TableCell>
                  <TableCell className="text-sm">
                    {rule.field_1 ? (
                      <span className="font-mono text-xs">
                        {rule.field_1} {rule.operator_1} &quot;{rule.value_1}&quot;
                      </span>
                    ) : (
                      <span className="text-gray-400">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {rule.field_2 ? (
                      <span className="font-mono text-xs">
                        {rule.field_2} {rule.operator_2} &quot;{rule.value_2}&quot;
                      </span>
                    ) : (
                      <span className="text-gray-400">--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                      {rule.assigned_m_code}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-gray-600">
                    {rule.description ?? "--"}
                  </TableCell>
                  <TableCell className="text-center">
                    {rule.is_active ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-red-500">No</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
