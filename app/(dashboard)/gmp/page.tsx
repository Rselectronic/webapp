import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, CircuitBoard } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { GmpListTable, type GmpRow } from "@/components/gmp/gmp-list-table";
import { calcMcodeSummary, type McodeSummary } from "@/lib/bom/mcode-summary";

// GMP list page. Each row represents one physical board (one GMP) and
// surfaces the most-recently-uploaded BOM under it. The board-level
// details (boards_per_panel, board_side, ipc_class, solder_type) live on
// the GMP itself — see migration 074. Click a GMP to drill into every
// uploaded BOM revision.
export default async function GmpListPage() {
  const supabase = await createClient();

  // Fetch every GMP joined with its customer. We don't paginate yet —
  // active GMP count stays small (< a few hundred) and the operator wants
  // the whole list searchable in one view.
  const { data: gmpRows } = await supabase
    .from("gmps")
    .select(
      "id, gmp_number, board_name, boards_per_panel, board_side, ipc_class, solder_type, created_at, customers(code, company_name)"
    )
    .order("created_at", { ascending: false });

  // Fetch every BOM, newest first, so we can pick out the latest per GMP
  // and count revisions client-side. One round trip beats N+1 lookups.
  const { data: bomRows } = await supabase
    .from("boms")
    .select(
      "id, gmp_id, file_name, bom_name, revision, gerber_name, gerber_revision, status, created_at"
    )
    .order("created_at", { ascending: false });

  const latestByGmp = new Map<string, NonNullable<GmpRow["latest_bom"]>>();
  const countByGmp = new Map<string, number>();
  for (const bom of bomRows ?? []) {
    if (!bom.gmp_id) continue;
    if (!latestByGmp.has(bom.gmp_id)) {
      latestByGmp.set(bom.gmp_id, {
        id: bom.id,
        file_name: bom.file_name,
        bom_name: bom.bom_name,
        revision: bom.revision,
        gerber_name: bom.gerber_name,
        gerber_revision: bom.gerber_revision,
        status: bom.status,
        created_at: bom.created_at,
      });
    }
    countByGmp.set(bom.gmp_id, (countByGmp.get(bom.gmp_id) ?? 0) + 1);
  }

  // Pull bom_lines for the latest BOM under every GMP in one round trip,
  // then compute the M-Code summary per BOM. Fetching only the latest-BOM
  // ids keeps this bounded — even with hundreds of GMPs we only see one
  // BOM's worth of lines per GMP.
  const latestBomIds = Array.from(latestByGmp.values()).map((b) => b.id);
  const summaryByBomId = new Map<string, McodeSummary>();
  if (latestBomIds.length > 0) {
    const { data: lineRows } = await supabase
      .from("bom_lines")
      .select("bom_id, quantity, m_code, is_pcb, is_dni, pin_count")
      .in("bom_id", latestBomIds);

    const linesByBom = new Map<
      string,
      Array<{
        quantity: number | null;
        m_code: string | null;
        is_pcb: boolean | null;
        is_dni: boolean | null;
        pin_count: number | null;
      }>
    >();
    for (const row of lineRows ?? []) {
      if (!row.bom_id) continue;
      const arr = linesByBom.get(row.bom_id) ?? [];
      arr.push(row);
      linesByBom.set(row.bom_id, arr);
    }
    for (const [bomId, lines] of linesByBom.entries()) {
      summaryByBomId.set(bomId, calcMcodeSummary(lines));
    }
  }

  const gmps: GmpRow[] = (gmpRows ?? []).map((g) => {
    const customerRaw = g.customers as
      | { code: string; company_name: string }
      | { code: string; company_name: string }[]
      | null;
    const customer = Array.isArray(customerRaw) ? customerRaw[0] ?? null : customerRaw;
    const latest = latestByGmp.get(g.id) ?? null;
    return {
      id: g.id,
      gmp_number: g.gmp_number,
      board_name: g.board_name,
      boards_per_panel: g.boards_per_panel,
      board_side: g.board_side,
      ipc_class: g.ipc_class,
      solder_type: g.solder_type,
      customer,
      bom_count: countByGmp.get(g.id) ?? 0,
      latest_bom: latest,
      mcode_summary: latest ? summaryByBomId.get(latest.id) ?? null : null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">GMPs</h2>
        </div>
        <Link href="/bom/upload">
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload BOM
          </Button>
        </Link>
      </div>

      {gmps.length === 0 ? (
        <EmptyState
          icon={CircuitBoard}
          title="No GMPs yet"
          description="Upload a Bill of Materials to create the first GMP. The GMP holds the physical board details and every BOM revision uploaded under it."
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
            <CardTitle className="text-base">All GMPs</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-2 px-4 pb-4 space-y-3">
            <GmpListTable gmps={gmps} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
