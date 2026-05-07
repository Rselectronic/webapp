import { isAdminRole } from "@/lib/auth/roles";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/format";

// PROC Batch list â€” parents of 1+ member jobs (one PO each).

interface ProcRow {
  id: string;
  proc_code: string;
  status: string;
  procurement_mode: string | null;
  is_batch: boolean | null;
  member_count: number | null;
  proc_date: string | null;
  sequence_num: number | null;
  customers: { code: string; company_name: string } | null;
}

const MODE_LETTER: Record<string, string> = {
  turnkey: "T",
  consignment: "C",
  // Legacy values kept for in-flight rows until migration runs.
  consign_parts_supplied: "C",
  consign_pcb_supplied: "C",
  assembly_only: "A",
};

export default async function ProcBatchListPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin-only â€” procurements RLS blocks production-role reads, which would
  // render an empty page. Redirect home so the gate is explicit.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) redirect("/");

  const { data, error } = await supabase
    .from("procurements")
    .select(
      "id, proc_code, status, procurement_mode, is_batch, member_count, proc_date, sequence_num, customers(code, company_name)"
    )
    .order("proc_date", { ascending: false, nullsFirst: false })
    .order("sequence_num", { ascending: false, nullsFirst: false })
    .limit(100);

  // P8: surface RLS / column / FK failures in server logs. The page already
  // shows a red banner from the `error` value below, but without console.error
  // a silent empty list looks identical to a query bug.
  if (error) console.error("[proc list] query failed:", error.message);

  const rows = (data ?? []) as unknown as ProcRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">PROC Batches</h2>
          <p className="text-sm text-gray-500">
            Procurement batches grouping 1+ customer orders. Merged BOM across all
            member boards.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent PROC Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600">
              Failed to load procurements: {error.message}
            </p>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-600">
                No PROC Batches yet. Enter customer POs at{" "}
                <Link href="/jobs/new" className="text-blue-600 hover:underline">
                  /jobs/new
                </Link>
                , then create batches at{" "}
                <Link
                  href="/proc/pending"
                  className="text-blue-600 hover:underline"
                >
                  /proc/pending
                </Link>
                .
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PROC Code</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Batch?</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const modeLetter = r.procurement_mode
                    ? (MODE_LETTER[r.procurement_mode] ?? "?")
                    : "-";
                  const batchLetter = r.is_batch ? "B" : "S";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/proc/${r.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {r.proc_code}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.customers
                          ? `${r.customers.code} â€” ${r.customers.company_name}`
                          : "â€”"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.member_count ?? 0}
                      </TableCell>
                      <TableCell className="text-sm">{modeLetter}</TableCell>
                      <TableCell className="text-sm">{batchLetter}</TableCell>
                      <TableCell className="text-sm">
                        {r.proc_date ? formatDate(r.proc_date) : "â€”"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/proc/${r.id}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
