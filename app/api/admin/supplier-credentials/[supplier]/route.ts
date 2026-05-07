import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSupplierMetadata,
  setCredential,
  deleteCredential,
  setPreferredCurrency,
  type SupplierName,
} from "@/lib/supplier-credentials";

async function requireAdmin() {
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
  if (!isAdminRole(profile?.role)) {
    return {
      user: null,
      error: NextResponse.json({ error: "Admin role required" }, { status: 403 }),
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ supplier: string }> }
) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const { supplier } = await params;
  const validation = await validateSupplier(supplier);
  if (!validation.ok) return validation.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, preferred_currency } = (body ?? {}) as {
    data?: unknown;
    preferred_currency?: unknown;
  };

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json(
      { error: "`data` must be an object of credential fields" },
      { status: 400 }
    );
  }

  const credentialData: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v !== "string") {
      return NextResponse.json(
        { error: `Field \`${k}\` must be a string` },
        { status: 400 }
      );
    }
    credentialData[k] = v;
  }

  if (
    preferred_currency !== undefined &&
    typeof preferred_currency !== "string"
  ) {
    return NextResponse.json(
      { error: "`preferred_currency` must be a string" },
      { status: 400 }
    );
  }

  try {
    await setCredential(validation.name, credentialData, {
      preferred_currency:
        typeof preferred_currency === "string" ? preferred_currency : undefined,
      updated_by: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to save credential", details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ supplier: string }> }
) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const { supplier } = await params;
  const validation = await validateSupplier(supplier);
  if (!validation.ok) return validation.response;

  try {
    await deleteCredential(validation.name);
    return NextResponse.json({ ok: true, supplier: validation.name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to delete credential", details: message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ supplier: string }> }
) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const { supplier } = await params;
  const validation = await validateSupplier(supplier);
  if (!validation.ok) return validation.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { preferred_currency } = (body ?? {}) as { preferred_currency?: unknown };
  if (typeof preferred_currency !== "string" || preferred_currency.length === 0) {
    return NextResponse.json(
      { error: "`preferred_currency` must be a non-empty string" },
      { status: 400 }
    );
  }

  try {
    await setPreferredCurrency(validation.name, preferred_currency);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update currency", details: message },
      { status: 400 }
    );
  }
}
