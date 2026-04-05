import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  users: { full_name: string } | null;
};

const actionColors: Record<string, string> = {
  insert: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
};

function ChangesPreview({
  action,
  oldValues,
  newValues,
}: {
  action: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}) {
  if (action === "insert" && newValues) {
    const keys = Object.keys(newValues).slice(0, 3);
    return (
      <span className="text-xs text-gray-500">
        {keys.map((k) => `${k}: ${String(newValues[k])}`).join(", ")}
        {Object.keys(newValues).length > 3 ? " ..." : ""}
      </span>
    );
  }

  if (action === "delete" && oldValues) {
    const keys = Object.keys(oldValues).slice(0, 3);
    return (
      <span className="text-xs text-gray-500">
        {keys.map((k) => `${k}: ${String(oldValues[k])}`).join(", ")}
        {Object.keys(oldValues).length > 3 ? " ..." : ""}
      </span>
    );
  }

  if (action === "update" && oldValues && newValues) {
    const changedKeys = Object.keys(newValues).filter(
      (k) => JSON.stringify(oldValues[k]) !== JSON.stringify(newValues[k])
    );
    const preview = changedKeys.slice(0, 3);
    return (
      <span className="text-xs text-gray-500">
        {preview
          .map(
            (k) =>
              `${k}: ${String(oldValues[k] ?? "null")} -> ${String(newValues[k] ?? "null")}`
          )
          .join(", ")}
        {changedKeys.length > 3 ? " ..." : ""}
      </span>
    );
  }

  return <span className="text-xs text-gray-400">--</span>;
}

export default async function AuditLogPage() {
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

  if (profile?.role !== "ceo") redirect("/");

  const { data: logs } = await supabase
    .from("audit_log")
    .select(
      "id, table_name, record_id, action, old_values, new_values, created_at, users(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (logs ?? []) as unknown as AuditRow[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
        <p className="text-sm text-gray-500">
          Recent changes across the system. CEO access only.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-gray-500">
          No audit log entries yet.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Time</TableHead>
                <TableHead className="w-36">User</TableHead>
                <TableHead className="w-36">Table</TableHead>
                <TableHead className="w-24">Action</TableHead>
                <TableHead className="w-64">Record ID</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-gray-600">
                    {formatDateTime(log.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.users?.full_name ?? "System"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-600">
                    {log.table_name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={actionColors[log.action] ?? ""}
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-64 truncate font-mono text-xs text-gray-500">
                    {log.record_id}
                  </TableCell>
                  <TableCell>
                    <ChangesPreview
                      action={log.action}
                      oldValues={log.old_values}
                      newValues={log.new_values}
                    />
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
