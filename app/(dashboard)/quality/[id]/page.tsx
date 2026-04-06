import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Calendar, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NCRStatusBadge } from "@/components/ncr/ncr-status-badge";
import { NCRSeverityBadge } from "@/components/ncr/ncr-severity-badge";
import { NCRActions } from "@/components/ncr/ncr-actions";
import { NCREditForm } from "@/components/ncr/ncr-edit-form";
import { formatDate, formatDateTime } from "@/lib/utils/format";

interface NCRCustomer {
  code: string;
  company_name: string;
  contact_name: string | null;
}

interface NCRJob {
  job_number: string;
  gmp_id: string;
  gmps: { gmp_number: string; board_name: string | null } | null;
}

export default async function NCRDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ncr_reports")
    .select(
      "*, customers(code, company_name, contact_name), jobs(job_number, gmp_id, gmps(gmp_number, board_name))"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const ncr = data;
  const customer = ncr.customers as unknown as NCRCustomer | null;
  const job = ncr.jobs as unknown as NCRJob | null;
  const gmp = job?.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/quality">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Quality
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-2xl font-bold text-gray-900">
              {ncr.ncr_number}
            </h2>
            <NCRStatusBadge status={ncr.status} />
            <NCRSeverityBadge severity={ncr.severity} />
          </div>
          <p className="mt-1 text-gray-500">
            {customer
              ? `${customer.code} — ${customer.company_name}`
              : "Unknown customer"}
            {gmp ? ` / ${gmp.gmp_number}` : ""}
            {gmp?.board_name ? ` (${gmp.board_name})` : ""}
          </p>
        </div>

        <NCRActions ncrId={id} currentStatus={ncr.status} />
      </div>

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Tag className="h-4 w-4" />
              Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{ncr.category}</p>
            {ncr.subcategory && (
              <p className="text-sm text-gray-500">{ncr.subcategory}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Briefcase className="h-4 w-4" />
              Job
            </CardTitle>
          </CardHeader>
          <CardContent>
            {job ? (
              <Link
                href={`/jobs/${ncr.job_id}`}
                className="font-mono font-medium text-blue-600 hover:underline"
              >
                {job.job_number}
              </Link>
            ) : (
              <p className="font-medium text-gray-400">No linked job</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-4 w-4" />
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{formatDate(ncr.created_at)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-4 w-4" />
              Closed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {ncr.closed_at ? formatDate(ncr.closed_at) : "Not yet closed"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {ncr.description}
          </p>
        </CardContent>
      </Card>

      {/* CAAF - Corrective Action and Assessment Form */}
      <NCREditForm
        ncrId={id}
        currentRootCause={ncr.root_cause}
        currentCorrectiveAction={ncr.corrective_action}
        currentPreventiveAction={ncr.preventive_action}
      />

      {/* Timestamps */}
      <div className="flex flex-wrap gap-6 border-t pt-4 text-xs text-gray-400">
        <span>Created: {formatDateTime(ncr.created_at)}</span>
        <span>Updated: {formatDateTime(ncr.updated_at)}</span>
      </div>
    </div>
  );
}
