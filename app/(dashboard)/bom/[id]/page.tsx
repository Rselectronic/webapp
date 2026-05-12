import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Calculator } from "lucide-react";
import { BomTable } from "@/components/bom/bom-table";
import { AddPcbLineButton } from "@/components/bom/add-pcb-line-button";
import { AIClassifyButton } from "@/components/bom/ai-classify-button";
import { WorkflowBanner } from "@/components/workflow/workflow-banner";
import { ExportBomButton } from "@/components/bom/export-bom-button";
import { DeleteBomButton } from "@/components/bom/delete-bom-button";
import { EditBomMetaButton } from "@/components/bom/edit-bom-meta-button";
import { MergeLogPanel } from "@/components/bom/merge-log-panel";
import { StartQuoteButton } from "@/components/quote-wizard/start-quote-button";
import { formatDateTime } from "@/lib/utils/format";

export default async function BomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: bom } = await supabase
    .from("boms")
    .select("*, customers(code, company_name), gmps(gmp_number, board_name)")
    .eq("id", id)
    .single();

  if (!bom) notFound();

  const { data: lines } = await supabase
    .from("bom_lines")
    .select("*")
    .eq("bom_id", id)
    .order("line_number", { ascending: true });

  // Load customer-supplied (+ RS/operator) alternates for every line in one
  // shot. rank=0 is the primary MPN mirror, so filter it out — we only want
  // true alternates (rank >= 1). Grouped below into a map keyed by
  // bom_line_id for O(1) lookup in the table.
  const { data: alternates } =
    lines && lines.length > 0
      ? await supabase
          .from("bom_line_alternates")
          .select("bom_line_id, mpn, manufacturer, rank, source")
          .in(
            "bom_line_id",
            lines.map((l) => l.id)
          )
          .gt("rank", 0)
          .order("rank", { ascending: true })
      : { data: [] as Array<{ bom_line_id: string; mpn: string; manufacturer: string | null; rank: number; source: string }> };

  const alternatesByLineId: Record<
    string,
    Array<{ mpn: string; manufacturer: string | null; source: string }>
  > = {};
  for (const alt of alternates ?? []) {
    if (!alternatesByLineId[alt.bom_line_id]) alternatesByLineId[alt.bom_line_id] = [];
    alternatesByLineId[alt.bom_line_id].push({
      mpn: alt.mpn,
      manufacturer: alt.manufacturer,
      source: alt.source,
    });
  }

  // Revision history + linked quote for workflow banner — both in parallel
  const [{ data: revisions }, { data: linkedQuote }] = await Promise.all([
    supabase
      .from("boms")
      .select("id, file_name, revision, status, created_at")
      .eq("gmp_id", bom.gmp_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotes")
      .select("id, status")
      .eq("bom_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const parseResult = bom.parse_result as Record<string, unknown> | null;
  const statsSummary = (parseResult?.stats ?? {}) as Record<string, number>;

  const customer = bom.customers as Record<string, string> | null;
  const gmp = bom.gmps as Record<string, string> | null;

  const statusVariant =
    bom.status === "parsed" ? "default" : bom.status === "error" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {/* The standalone /bom list page was retired in favour of the GMP
            view — every BOM is now reached via its parent GMP, so this
            back-button mirrors the way the user arrived. */}
        <Link href={bom.gmp_id ? `/gmp/${bom.gmp_id}` : "/gmp"}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to GMP
          </Button>
        </Link>
        <Link href="/bom/upload">
          <Button variant="outline" size="sm">Upload New</Button>
        </Link>
      </div>

      {/* Workflow Banner */}
      <WorkflowBanner
        currentPageStep={bom.status === "parsed" ? "classify" : "bom_upload"}
        entities={{
          bomId: id,
          bomStatus: bom.status,
          quoteId: linkedQuote?.id ?? undefined,
          quoteStatus: linkedQuote?.status ?? undefined,
        }}
      />

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {gmp?.gmp_number ?? bom.file_name}
              {gmp?.board_name && (
                <span className="ml-2 text-lg font-normal text-gray-500">{gmp.board_name}</span>
              )}
            </h2>
            <Badge variant={statusVariant}>{bom.status}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <span className="font-mono">{customer?.code}</span>
            <span>—</span>
            <span>{customer?.company_name}</span>
            <span>·</span>
            <span>{bom.file_name}</span>
            <span>·</span>
            <span>Rev {bom.revision}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bom.status === "parsed" && (
            <StartQuoteButton
              bomId={id}
              pendingAiCount={
                (lines ?? []).filter(
                  (l) => l.m_code_source === "ai" && l.quantity > 0
                ).length
              }
            />
          )}
          {linkedQuote && (
            <Link href={`/quotes/${linkedQuote.id}`}>
              <Button size="sm" variant="secondary" className="gap-1.5">
                <Calculator className="h-4 w-4" />
                View Quote
              </Button>
            </Link>
          )}
          <EditBomMetaButton
            bomId={id}
            fileName={bom.file_name}
            initial={{
              bom_name: bom.bom_name ?? null,
              revision: bom.revision ?? null,
              gerber_name: bom.gerber_name ?? null,
              gerber_revision: bom.gerber_revision ?? null,
              bom_section: (bom.bom_section ?? "full") as
                | "full"
                | "smt"
                | "th"
                | "other",
            }}
          />
          <ExportBomButton bomId={id} fileName={bom.file_name} gmpNumber={gmp?.gmp_number ?? ""} />
          <DeleteBomButton
            bomId={id}
            bomName={gmp?.gmp_number ?? bom.file_name}
            redirectTo={bom.gmp_id ? `/gmp/${bom.gmp_id}` : "/gmp"}
          />
        </div>
      </div>

      {/* Stats — computed LIVE from bom_lines so they stay in sync with the
          database after every classification run (the parse_result.classification_summary
          snapshot only reflects the initial upload state). Qty=0 lines are
          excluded: they're not-installed placeholders kept only so the
          production print-out shows their designators, and they deliberately
          don't get M-coded. */}
      {(() => {
        // Count every installed (qty > 0) line, INCLUDING the PCB row —
        // it's a real billable line on the board. is_dni placeholders are
        // still excluded because they explicitly don't get installed.
        const classifiableLines = (lines ?? []).filter(
          (l) => !l.is_dni && (l.quantity ?? 0) > 0
        );
        const liveComponents = classifiableLines.length;
        const liveClassified = classifiableLines.filter((l) => l.m_code).length;
        const liveUnclassified = classifiableLines.filter((l) => !l.m_code).length;
        return (
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Components", value: liveComponents, color: "" },
          { label: "Classified", value: liveClassified, color: "text-green-600" },
          { label: "Need Review", value: liveUnclassified, color: "text-orange-600" },
          { label: "Merged Lines", value: statsSummary.merged ?? 0, color: "" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
        );
      })()}

      {/* M-Code Distribution chart is rendered inside BomTable below
          so it recomputes live after manual M-Code assignments. */}

      {/* Merge log — collapsed by default. Surfaces every source row that
          the parser folded into another row via MPN dedup, with the
          surviving line number, so operators can audit what got combined. */}
      {(() => {
        const parseResult = (bom.parse_result ?? {}) as {
          merge_log?: Array<{
            mpn: string;
            merged_into_line: number;
            file_name?: string | null;
            source?: {
              quantity: number;
              reference_designator: string;
              cpc: string | null;
              description: string;
              mpn: string;
              manufacturer: string;
            };
          }>;
        };
        return parseResult.merge_log && parseResult.merge_log.length > 0 ? (
          <MergeLogPanel entries={parseResult.merge_log} />
        ) : null;
      })()}

      {/* AI Classify Button */}
      {lines && lines.length > 0 && (
        <AIClassifyButton
          bomId={id}
          unclassifiedCount={
            lines.filter(
              (l) => !l.m_code && !l.is_pcb && !l.is_dni && (l.quantity ?? 0) > 0
            ).length
          }
        />
      )}

      {/* Manual add-PCB control — shown only when the BOM has no is_pcb row.
          Auto-hides once a PCB line exists (including after auto-create during
          parse). */}
      {lines && lines.length > 0 && !lines.some((l) => l.is_pcb) && (
        <AddPcbLineButton
          bomId={id}
          defaultMpn={bom.gerber_name ?? null}
          defaultCpc={bom.gerber_name ?? null}
          defaultDescription={
            bom.gerber_name
              ? bom.gerber_revision
                ? `${bom.gerber_name} (PCB, Rev ${bom.gerber_revision})`
                : `${bom.gerber_name} (PCB)`
              : null
          }
        />
      )}

      {/* BOM table */}
      {lines && lines.length > 0 ? (
        <BomTable
          lines={lines}
          bomId={id}
          customerId={bom.customer_id}
          alternatesByLineId={alternatesByLineId}
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No parsed lines found. The BOM may still be processing.
          </CardContent>
        </Card>
      )}

      {/* Revision history */}
      {revisions && revisions.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Revision History</CardTitle>
            <CardDescription>Previous uploads for GMP {gmp?.gmp_number}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {revisions.map((rev) => (
                <div key={rev.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {rev.id === id ? (
                        <span className="text-blue-600">{rev.file_name} (current)</span>
                      ) : (
                        <Link href={`/bom/${rev.id}`} className="text-blue-600 hover:underline">
                          {rev.file_name}
                        </Link>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      Rev {rev.revision} · {formatDateTime(rev.created_at)}
                    </p>
                  </div>
                  <Badge variant={rev.status === "parsed" ? "default" : "secondary"}>
                    {rev.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
