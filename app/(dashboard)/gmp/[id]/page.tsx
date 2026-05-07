import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload } from "lucide-react";
import { BomListTable } from "@/components/bom/bom-list-table";
import { calcMcodeSummary, formatMcodeSummary } from "@/lib/bom/mcode-summary";

// GMP detail page. Shows the GMP's metadata (board details + customer) at
// the top, then every BOM revision uploaded under it. Each BOM row is the
// same as the global BOM list — clicking a row opens that BOM's parsed
// view at /bom/[id].
export default async function GmpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: gmp } = await supabase
    .from("gmps")
    .select(
      "id, gmp_number, board_name, boards_per_panel, board_side, ipc_class, solder_type, customer_id, customers(code, company_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!gmp) notFound();

  const customer = (Array.isArray(gmp.customers) ? gmp.customers[0] : gmp.customers) as
    | { code: string; company_name: string }
    | null;

  const { data: bomRows } = await supabase
    .from("boms")
    .select(
      "id, file_name, bom_name, revision, gerber_name, gerber_revision, status, component_count, created_at, customers(code, company_name)"
    )
    .eq("gmp_id", id)
    .order("created_at", { ascending: false });

  // Hydrate the BomListTable shape — board details now come from the GMP
  // (a single source of truth), but the existing table component still
  // expects them per-row, so we paint the GMP's values onto every BOM.
  const boms = (bomRows ?? []).map((b) => ({
    id: b.id,
    file_name: b.file_name,
    bom_name: b.bom_name,
    revision: b.revision,
    gerber_name: b.gerber_name,
    gerber_revision: b.gerber_revision,
    boards_per_panel: gmp.boards_per_panel,
    board_side: gmp.board_side,
    ipc_class: gmp.ipc_class,
    solder_type: gmp.solder_type,
    status: b.status,
    component_count: b.component_count,
    created_at: b.created_at,
    customers: b.customers,
    gmps: { gmp_number: gmp.gmp_number, board_name: gmp.board_name },
  }));

  // M-Code summary for the latest BOM under this GMP. Mirrors what RS used
  // to read off the old DM file's summary line. Computed only for the most
  // recent BOM — older revisions are still reachable via the table below.
  const latestBom = bomRows?.[0] ?? null;
  let latestBomSummary: ReturnType<typeof calcMcodeSummary> | null = null;
  if (latestBom) {
    const { data: latestLines } = await supabase
      .from("bom_lines")
      .select("quantity, m_code, is_pcb, is_dni, pin_count")
      .eq("bom_id", latestBom.id);
    if (latestLines && latestLines.length > 0) {
      latestBomSummary = calcMcodeSummary(latestLines);
    }
  }

  const formatBoardSide = (side: string | null) => {
    if (side === "single") return "Single";
    if (side === "double") return "Double";
    return "—";
  };
  const formatSolder = (solder: string | null) => {
    if (solder === "leaded") return "Leaded";
    if (solder === "lead-free") return "Lead-free";
    return "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/gmp">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to GMPs
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-mono">
            {gmp.gmp_number}
          </h2>
          {gmp.board_name && (
            <p className="text-base text-gray-700 dark:text-gray-300 mt-0.5">
              {gmp.board_name}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-mono">{customer?.code}</span>
            {" — "}
            <span>{customer?.company_name}</span>
            {" · "}
            <span>{boms.length} BOM revision{boms.length === 1 ? "" : "s"}</span>
          </p>
        </div>
        <Link href={`/bom/upload?gmp_id=${gmp.id}`}>
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload BOM
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Board Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
            <div>
              <dt className="text-xs uppercase text-gray-500">Boards/Panel</dt>
              <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
                {gmp.boards_per_panel ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500">Board Side</dt>
              <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
                {formatBoardSide(gmp.board_side)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500">IPC Class</dt>
              <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
                {gmp.ipc_class ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500">Solder Type</dt>
              <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
                {formatSolder(gmp.solder_type)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            These values are tied to the GMP. Edit them from the quote
            wizard&apos;s &ldquo;Board Details &amp; Pricing&rdquo; step on any
            quote under this GMP.
          </p>
        </CardContent>
      </Card>

      {latestBomSummary && latestBomSummary.lines > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              M-Code Summary
              <span className="ml-2 text-xs font-normal text-gray-500">
                latest BOM
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-6 text-sm">
              <div>
                <dt className="text-xs uppercase text-gray-500">#Lines</dt>
                <dd className="mt-0.5 font-medium">{latestBomSummary.lines}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Total Parts</dt>
                <dd className="mt-0.5 font-medium">{latestBomSummary.total_parts}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">CP Feeders</dt>
                <dd className="mt-0.5 font-medium">{latestBomSummary.cp_feeders}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">IP Feeders</dt>
                <dd className="mt-0.5 font-medium">{latestBomSummary.ip_feeders}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">TH Parts</dt>
                <dd className="mt-0.5 font-medium">{latestBomSummary.th_parts}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">TH Pins</dt>
                <dd className="mt-0.5 font-medium">{latestBomSummary.th_pins}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-gray-500 font-mono">
              {formatMcodeSummary(latestBomSummary)}
            </p>
          </CardContent>
        </Card>
      )}

      {boms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-gray-500">
              No BOMs uploaded under this GMP yet.
            </p>
            <Link href={`/bom/upload?gmp_id=${gmp.id}`} className="inline-block mt-3">
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload BOM
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">BOM Revisions</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-2 px-4 pb-4 space-y-3">
            <BomListTable boms={boms} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
