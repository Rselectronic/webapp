import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCredential,
  listCredentialStatus,
  type SupplierName,
} from "@/lib/supplier-credentials";
import { testSupplierConnection, type TestResult } from "@/lib/supplier-tests";

/**
 * Auth gate for the bulk-test route.
 *
 * The sibling routes (GET /api/admin/supplier-credentials,
 * POST /api/admin/supplier-credentials/[supplier]/test) are currently
 * ceo-only, but the CEO explicitly asked for the bulk runner to be
 * available to ops_manager as well — Piyush needs it to verify his
 * endpoint fixes against live creds without having to flag Anas every
 * time. Financial data is never touched here, only connection health.
 */
async function requireCeoOrOps() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    return {
      user: null,
      error: NextResponse.json(
        { error: "CEO or operations manager role required" },
        { status: 403 }
      ),
    };
  }

  return { user, error: null };
}

interface BulkTestRow {
  supplier: SupplierName;
  display_name: string;
  ok: boolean;
  message: string;
  status_code?: number;
  request_url?: string;
  duration_ms: number;
}

interface BulkTestSummary {
  total: number;
  succeeded: number;
  failed: number;
  not_configured: number;
  duration_ms: number;
}

interface BulkTestResponse {
  mpn: string | null;
  results: BulkTestRow[];
  summary: BulkTestSummary;
}

/**
 * POST /api/admin/supplier-credentials/test-all
 *
 * Body: { mpn?: string }
 *
 * Fires testSupplierConnection() in parallel against every supplier that
 * has stored credentials (configured === true). Uses Promise.allSettled
 * so one hanging/failing test does not poison the others.
 *
 * The aggregated response intentionally DOES NOT include raw_response —
 * 12 distributors x ~20KB of JSON = payload bloat in the browser. Users
 * who want to inspect the raw body can click the per-row Test button in
 * the existing UI, which still returns full raw_response.
 *
 * Per-test timeout is inherited from testSupplierConnection's internal
 * 15s AbortController — no outer wrapper needed.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireCeoOrOps();
  if (error || !user) return error!;

  const body = (await req.json().catch(() => ({}))) as { mpn?: unknown };
  const mpnOverride =
    typeof body.mpn === "string" && body.mpn.trim() ? body.mpn.trim() : null;

  const statuses = await listCredentialStatus();
  const configured = statuses.filter((s) => s.configured);
  const notConfigured = statuses.length - configured.length;

  const startedAt = Date.now();

  // Pull credentials in parallel first (each is an async DB+decrypt),
  // then fire the actual HTTP tests in parallel via Promise.allSettled.
  const runs = configured.map(async (s): Promise<BulkTestRow> => {
    const runStart = Date.now();
    try {
      const creds = await getCredential<Record<string, string>>(s.supplier);
      if (!creds) {
        return {
          supplier: s.supplier,
          display_name: s.display_name,
          ok: false,
          message: "No credentials stored (configured flag out of sync)",
          duration_ms: Date.now() - runStart,
        };
      }
      const result: TestResult = await testSupplierConnection(
        s.supplier,
        creds,
        mpnOverride ?? undefined
      );
      return {
        supplier: s.supplier,
        display_name: s.display_name,
        ok: result.ok,
        message: result.message,
        status_code: result.status_code,
        request_url: result.request_url,
        duration_ms: Date.now() - runStart,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return {
        supplier: s.supplier,
        display_name: s.display_name,
        ok: false,
        message: `Test error: ${msg}`,
        duration_ms: Date.now() - runStart,
      };
    }
  });

  const settled = await Promise.allSettled(runs);
  const rows: BulkTestRow[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // Should be unreachable — the inner function already catches — but
    // belt-and-braces so one rejection can't nuke the whole response.
    const s = configured[i];
    const msg =
      r.reason instanceof Error ? r.reason.message : String(r.reason);
    return {
      supplier: s.supplier,
      display_name: s.display_name,
      ok: false,
      message: `Test error: ${msg}`,
      duration_ms: 0,
    };
  });

  // Sort: failures first (surface the problems), then successes. Within
  // each group, alphabetical by display name for stability across runs.
  rows.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? 1 : -1;
    return a.display_name.localeCompare(b.display_name);
  });

  const succeeded = rows.filter((r) => r.ok).length;
  const failed = rows.length - succeeded;

  const response: BulkTestResponse = {
    mpn: mpnOverride,
    results: rows,
    summary: {
      total: rows.length,
      succeeded,
      failed,
      not_configured: notConfigured,
      duration_ms: Date.now() - startedAt,
    },
  };

  return NextResponse.json(response, { status: 200 });
}
