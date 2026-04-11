"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface JobInfo {
  id: string;
  job_number: string;
  quantity: number;
  status: string;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null } | null;
  boms: { id: string; file_name: string; component_count: number } | null;
}

export default function CreateProcurementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");

  const [job, setJob] = useState<JobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; proc_code: string; total_lines: number } | null>(null);

  useEffect(() => {
    if (!jobId) {
      setError("No job_id provided");
      setLoading(false);
      return;
    }
    fetch(`/api/jobs/${jobId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Job not found");
        const data = await res.json();
        setJob(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load job"))
      .finally(() => setLoading(false));
  }, [jobId]);

  const handleCreate = async () => {
    if (!jobId) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/procurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create procurement");
      }

      const data = await res.json();
      setResult(data);

      // Redirect to the new procurement after a brief pause
      setTimeout(() => router.push(`/procurement/${data.id}`), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create procurement");
      setCreating(false);
    }
  };

  const customer = job?.customers;
  const gmp = job?.gmps;
  const bom = job?.boms;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={jobId ? `/jobs/${jobId}` : "/jobs"}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Job
        </Button>
      </Link>

      <div>
        <h2 className="text-2xl font-bold">Create Procurement</h2>
        <p className="text-gray-500">Generate procurement lines from the job&apos;s BOM with overage calculation.</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading job...
        </div>
      )}

      {error && !result && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <strong>Procurement created!</strong> {result.proc_code} — {result.total_lines} component lines generated. Redirecting...
          </div>
        </div>
      )}

      {job && !result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5" />
              Job Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Job Number</span>
                <p className="font-mono font-bold">{job.job_number}</p>
              </div>
              <div>
                <span className="text-gray-500">Customer</span>
                <p>{customer ? `${customer.code} — ${customer.company_name}` : "—"}</p>
              </div>
              <div>
                <span className="text-gray-500">GMP</span>
                <p className="font-mono">{gmp?.gmp_number ?? "—"}{gmp?.board_name ? ` (${gmp.board_name})` : ""}</p>
              </div>
              <div>
                <span className="text-gray-500">Board Quantity</span>
                <p className="font-bold">{job.quantity}</p>
              </div>
              <div>
                <span className="text-gray-500">BOM</span>
                <p>{bom?.file_name ?? "No BOM linked"}</p>
              </div>
              <div>
                <span className="text-gray-500">Components</span>
                <p>{bom?.component_count ?? 0} lines</p>
              </div>
            </div>

            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
              <strong>What happens when you create procurement:</strong>
              <ul className="mt-1 list-disc pl-4 space-y-1">
                <li>Component lines are generated from BOM with M-code-based overage</li>
                <li>Best-price suppliers are auto-assigned from DigiKey/Mouser/LCSC cache</li>
                <li>BG stock (feeders) is auto-deducted for components in inventory</li>
                <li>Job status advances to &quot;procurement&quot;</li>
              </ul>
            </div>

            <Button onClick={handleCreate} disabled={creating || !bom} className="w-full">
              {creating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Procurement...</>
              ) : !bom ? (
                "No BOM linked — cannot create procurement"
              ) : (
                <><Package className="mr-2 h-4 w-4" />Create Procurement for {bom.component_count} Components</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
