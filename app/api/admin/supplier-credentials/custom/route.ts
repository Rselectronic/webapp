import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  addCustomSupplier,
  type AddCustomSupplierInput,
  type SupplierFieldDef,
} from "@/lib/supplier-credentials";

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
        { error: "CEO or operations_manager role required" },
        { status: 403 }
      ),
    };
  }

  return { user, error: null };
}

/**
 * POST /api/admin/supplier-credentials/custom
 *
 * Add a new user-defined distributor. Body is AddCustomSupplierInput.
 * Validation errors (name collision, invalid schema, etc.) return 400 with
 * the raw error message. Other failures return 500.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireCeoOrOps();
  if (error || !user) return error!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;

  if (typeof raw.name !== "string" || raw.name.length === 0) {
    return NextResponse.json(
      { error: "`name` must be a non-empty string" },
      { status: 400 }
    );
  }
  if (typeof raw.display_name !== "string" || raw.display_name.length === 0) {
    return NextResponse.json(
      { error: "`display_name` must be a non-empty string" },
      { status: 400 }
    );
  }
  if (!Array.isArray(raw.fields)) {
    return NextResponse.json(
      { error: "`fields` must be an array" },
      { status: 400 }
    );
  }
  if (!Array.isArray(raw.supported_currencies)) {
    return NextResponse.json(
      { error: "`supported_currencies` must be an array of strings" },
      { status: 400 }
    );
  }
  if (typeof raw.default_currency !== "string") {
    return NextResponse.json(
      { error: "`default_currency` must be a string" },
      { status: 400 }
    );
  }

  // Shallow-validate fields array shape — deeper validation in addCustomSupplier.
  const fields: SupplierFieldDef[] = [];
  for (const f of raw.fields) {
    if (!f || typeof f !== "object") {
      return NextResponse.json(
        { error: "Each field must be an object" },
        { status: 400 }
      );
    }
    const fd = f as Record<string, unknown>;
    const field: SupplierFieldDef = {
      key: typeof fd.key === "string" ? fd.key : "",
      label: typeof fd.label === "string" ? fd.label : "",
      type:
        fd.type === "text" || fd.type === "password" || fd.type === "select"
          ? fd.type
          : "text",
      required: typeof fd.required === "boolean" ? fd.required : true,
      options: Array.isArray(fd.options)
        ? (fd.options.filter((o) => typeof o === "string") as string[])
        : undefined,
      placeholder:
        typeof fd.placeholder === "string" ? fd.placeholder : undefined,
    };
    fields.push(field);
  }

  const currencies = (raw.supported_currencies as unknown[]).filter(
    (c): c is string => typeof c === "string"
  );
  if (currencies.length !== (raw.supported_currencies as unknown[]).length) {
    return NextResponse.json(
      { error: "`supported_currencies` must contain only strings" },
      { status: 400 }
    );
  }

  const input: AddCustomSupplierInput = {
    name: raw.name,
    display_name: raw.display_name,
    fields,
    supported_currencies: currencies,
    default_currency: raw.default_currency,
    docs_url: typeof raw.docs_url === "string" ? raw.docs_url : undefined,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
  };

  try {
    await addCustomSupplier(input, user.id);
    return NextResponse.json({ ok: true, name: input.name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
