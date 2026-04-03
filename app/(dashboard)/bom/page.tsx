import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";
import { formatDateTime } from "@/lib/utils/format";

export default async function BomListPage() {
  const supabase = await createClient();

  const { data: boms } = await supabase
    .from("boms")
    .select("id, file_name, revision, status, component_count, created_at, customers(code, company_name), gmps(gmp_number, board_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const total = boms?.length ?? 0;
  const parsed = boms?.filter((b) => b.status === "parsed").length ?? 0;
  const pending = boms?.filter((b) => b.status === "pending" || b.status === "parsing").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bills of Materials</h2>
          <p className="text-sm text-gray-500 mt-1">{total} BOMs · {parsed} parsed · {pending} pending</p>
        </div>
        <Link href="/bom/upload">
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload BOM
          </Button>
        </Link>
      </div>

      {(!boms || boms.length === 0) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-gray-500 mb-4">No BOMs uploaded yet.</p>
            <Link href="/bom/upload">
              <Button variant="outline">Upload your first BOM</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent BOMs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>GMP</TableHead>
                    <TableHead className="w-16">Rev</TableHead>
                    <TableHead className="w-24">Components</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-40">Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boms.map((bom) => {
                    const customer = bom.customers as unknown as Record<string, string> | null;
                    const gmp = bom.gmps as unknown as Record<string, string> | null;
                    const statusVariant =
                      bom.status === "parsed"
                        ? "default"
                        : bom.status === "error"
                          ? "destructive"
                          : "secondary";
                    return (
                      <TableRow key={bom.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          <Link href={`/bom/${bom.id}`} className="text-blue-600 hover:underline">
                            {bom.file_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-mono text-xs text-gray-500">{customer?.code}</span>
                          {" "}
                          <span className="text-gray-700">{customer?.company_name}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {gmp?.gmp_number}
                          {gmp?.board_name && (
                            <span className="text-gray-400 ml-1 font-sans">— {gmp.board_name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-center">{bom.revision}</TableCell>
                        <TableCell className="text-sm text-center">{bom.component_count ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant} className="text-xs">{bom.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {formatDateTime(bom.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
