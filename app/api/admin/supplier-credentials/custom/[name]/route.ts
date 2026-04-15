import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteCustomSupplier,
  isBuiltInSupplier,
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
 * DELETE /api/admin/supplier-credentials/custom/[name]
 *
 * Remove a custom distributor definition AND its stored credentials.
 * Built-in suppliers are rejected with 400.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { user, error } = await requireCeoOrOps();
  if (error || !user) return error!;

  const { name } = await params;

  if (isBuiltInSupplier(name)) {
    return NextResponse.json(
      {
        error: `Cannot delete built-in supplier '${name}'. Built-ins live in code and can only be cleared via the normal credential delete route.`,
      },
      { status: 400 }
    );
  }

  try {
    await deleteCustomSupplier(name);
    return NextResponse.json({ ok: true, name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
