import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { BomListTable } from "@/components/bom/bom-list-table";

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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bills of Materials</h2>
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
        <EmptyState
          icon={FileSpreadsheet}
          title="No BOMs uploaded yet"
          description="Upload a Bill of Materials to start parsing components and classifying M-Codes."
        >
          <Link href="/bom/upload">
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Upload your first BOM
            </Button>
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent BOMs</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-2 px-4 pb-4 space-y-3">
            <BomListTable boms={boms} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
