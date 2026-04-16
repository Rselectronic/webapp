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
import { AIClassifyButton } from "@/components/bom/ai-classify-button";
import { WorkflowBanner } from "@/components/workflow/workflow-banner";
import { ExportBomButton } from "@/components/bom/export-bom-button";
import { DeleteBomButton } from "@/components/bom/delete-bom-button";
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
  const classSummary = (parseResult?.classification_summary ?? {}) as Record<string, number>;
  const statsSummary = (parseResult?.stats ?? {}) as Record<string, number>;

  const customer = bom.customers as Record<string, string> | null;
  const gmp = bom.gmps as Record<string, string> | null;

  const statusVariant =
    bom.status === "parsed" ? "default" : bom.status === "error" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/bom">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All BOMs
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
            <Link href={`/quotes/new?bom_id=${id}`}>
              <Button size="sm" className="gap-1.5">
                <Calculator className="h-4 w-4" />
                {linkedQuote ? "New Quote" : "Create Quote"}
              </Button>
            </Link>
          )}
          {linkedQuote && (
            <Link href={`/quotes/${linkedQuote.id}`}>
              <Button size="sm" variant="secondary" className="gap-1.5">
                <Calculator className="h-4 w-4" />
                View Quote
              </Button>
            </Link>
          )}
          <ExportBomButton bomId={id} fileName={bom.file_name} gmpNumber={gmp?.gmp_number ?? ""} />
          <DeleteBomButton bomId={id} bomName={gmp?.gmp_number ?? bom.file_name} />
        </div>
      </div>

      {/* Stats — computed LIVE from bom_lines so they stay in sync with the
          database after every classification run (the parse_result.classification_summary
          snapshot only reflects the initial upload state). */}
      {(() => {
        const classifiableLines = (lines ?? []).filter((l) => !l.is_pcb && !l.is_dni);
        const liveClassified = classifiableLines.filter((l) => l.m_code).length;
        const liveUnclassified = classifiableLines.filter((l) => !l.m_code).length;
        return (
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Components", value: bom.component_count, color: "" },
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

      {/* AI Classify Button */}
      {lines && lines.length > 0 && (
        <AIClassifyButton
          bomId={id}
          unclassifiedCount={
            lines.filter(
              (l) => !l.m_code && !l.is_pcb && !l.is_dni
            ).length
          }
        />
      )}

      {/* BOM table */}
      {lines && lines.length > 0 ? (
        <BomTable lines={lines} bomId={id} />
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
