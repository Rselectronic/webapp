import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSupplierMetadata,
  getCredential,
  type SupplierName,
} from "@/lib/supplier-credentials";
import { testSupplierConnection } from "@/lib/supplier-tests";

async function requireCeo() {
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
  if (profile?.role !== "ceo") {
    return {
      user: null,
      error: NextResponse.json({ error: "CEO role required" }, { status: 403 }),
    };
  }

  return { user, error: null };
}

async function validateSupplier(
  supplier: string
): Promise<{ ok: true; name: SupplierName } | { ok: false; response: NextResponse }> {
  const meta = await getSupplierMetadata(supplier);
  if (!meta) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Unknown supplier: ${supplier}` },
        { status: 400 }
      ),
    };
  }
  return { ok: true, name: supplier as SupplierName };
}

/**
 * POST /api/admin/supplier-credentials/[supplier]/test
 *
 * Runs a live connection test against the supplier's API using the stored
 * (encrypted) credentials. Returns { ok, message, details? }.
 *
 * - HTTP 200 for a completed test (even if auth was rejected — that's a
 *   valid result, not an HTTP error).
 * - HTTP 400 if no credentials are configured.
 * - HTTP 401/403 for auth on the admin route itself.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ supplier: string }> }
) {
  const { user, error } = await requireCeo();
  if (error || !user) return error!;

  const { supplier } = await params;
  const validation = await validateSupplier(supplier);
  if (!validation.ok) return validation.response;

  const credentials = await getCredential<Record<string, string>>(
    validation.name
  );
  if (!credentials) {
    return NextResponse.json(
      {
        ok: false,
        message: "No credentials configured for this distributor",
      },
      { status: 400 }
    );
  }

  // Optional body: { mpn?: string }. Empty/missing → undefined → test
  // function uses its per-distributor default.
  const body = (await req.json().catch(() => ({}))) as { mpn?: unknown };
  const mpn =
    typeof body.mpn === "string" && body.mpn.trim()
      ? body.mpn.trim()
      : undefined;

  try {
    const result = await testSupplierConnection(
      validation.name,
      credentials,
      mpn
    );
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, message },
      { status: 200 }
    );
  }
}
