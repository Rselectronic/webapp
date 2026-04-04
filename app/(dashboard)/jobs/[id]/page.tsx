import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface JobCustomer {
  code: string;
  company_name: string;
}

interface JobGmp {
  gmp_number: string;
  board_name: string | null;
}

interface JobQuote {
  quote_number: string;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(code, company_name), gmps(gmp_number, board_name), quotes(quote_number)"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const job = data;
  const customer = job.customers as unknown as JobCustomer | null;
  const gmp = job.gmps as unknown as JobGmp | null;
  const quote = job.quotes as unknown as JobQuote | null;

  return (
    <div className="space-y-6">
      <Link href="/jobs">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Button>
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-2xl font-bold text-gray-900">
              {job.job_number}
            </h2>
            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-700">
              {job.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-1 text-gray-500">
            {customer
              ? `${customer.code} — ${customer.company_name}`
              : "Unknown customer"}
            {gmp ? ` / ${gmp.gmp_number}` : ""}
            {gmp?.board_name ? ` (${gmp.board_name})` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{job.quantity}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Assembly Type</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{job.assembly_type ?? "TB"}</p>
          </CardContent>
        </Card>

        {quote && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Quote</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`/quotes/${job.quote_id}`}
                className="font-mono text-blue-600 hover:underline"
              >
                {quote.quote_number}
              </Link>
            </CardContent>
          </Card>
        )}

        {job.scheduled_start && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Scheduled Start</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{new Date(job.scheduled_start).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        )}

        {job.scheduled_completion && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Scheduled Completion</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{new Date(job.scheduled_completion).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {job.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{job.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
