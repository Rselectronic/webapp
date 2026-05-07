/**
 * /api/quotes/expire
 *
 * Cron entry-point: sweeps `quotes` and flips any 'sent' quote whose
 * `expires_at` is in the past to status='expired'. No human caller —
 * meant to be hit by an external scheduler (Vercel Cron, GitHub Actions,
 * Supabase pg_cron, etc.) on a daily-ish cadence.
 *
 * AUTH model: shared-secret. The scheduler sends:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * The route refuses to run unless `CRON_SECRET` is set in the env AND
 * the request header matches it (constant-time compare). Fail-closed —
 * if the secret isn't configured the endpoint returns 503 so it can't be
 * invoked by accident.
 *
 * Uses the admin client because the cron has no user context and the
 * UPDATE on quotes would otherwise need an authenticated admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) {
    // Fail-closed when the secret isn't configured. Better to refuse
    // than to leave the endpoint open.
    console.error(
      "[quotes/expire] CRON_SECRET is not set or too short — refusing to run"
    );
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quotes")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "sent")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("[quotes/expire] update failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ expired: data?.length ?? 0 });
}
