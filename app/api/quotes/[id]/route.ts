import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  taxRegionForAddress,
  currencyForAddress,
  normalizeCountry,
} from "@/lib/address/regions";
import type { TaxRegion } from "@/lib/tax/regions";
import { resolveFxRate } from "@/lib/fx/boc";
const VALID_STATUSES = [
  "draft",
  "review",
  "sent",
  "accepted",
  "rejected",
  "expired",
] as const;

type QuoteStatus = (typeof VALID_STATUSES)[number];

// ---------------------------------------------------------------------------
// GET /api/quotes/[id] â€” Fetch a single quote with joins
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "*, customers(code, company_name, contact_name, contact_email), gmps(gmp_number, board_name), boms(file_name, revision)"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Quote not found", details: error?.message },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// PATCH /api/quotes/[id] â€” Update quote status and/or notes
// ---------------------------------------------------------------------------

interface PatchBody {
  status?: QuoteStatus;
  notes?: string;
  /**
   * When true, re-derive currency / fx_rate_to_cad / tax_region / billing
   * snapshot from the customer's current default billing address. Use this
   * to fix a quote whose currency was wrong at creation (e.g. the customer
   * billing address was added or corrected after the quote was started).
   */
  refresh_from_billing_address?: boolean;
  /**
   * Manual override — set the quote's currency directly without going
   * through address derivation. Pairs with `fx_rate_to_cad` (optional;
   * BoC live rate is fetched if absent for USD).
   */
  currency?: "CAD" | "USD";
  fx_rate_to_cad?: number;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin-only: quote status transitions (draft â†’ sent â†’ accepted) are a
  // commercial commitment. Production-role users have no UPDATE policy on
  // quotes, so a user-scoped update would silently no-op â€” gate explicitly
  // here so the 403 is clean.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body = (await req.json()) as PatchBody;

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      {
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status) {
    updates.status = body.status;

    if (body.status === "sent") {
      updates.issued_at = new Date().toISOString();
      // Set expiry based on validity_days
      const { data: existing } = await supabase
        .from("quotes")
        .select("validity_days")
        .eq("id", id)
        .single();
      if (existing?.validity_days) {
        const expires = new Date();
        expires.setDate(expires.getDate() + existing.validity_days);
        updates.expires_at = expires.toISOString();
      }
    }

    if (body.status === "accepted") {
      updates.accepted_at = new Date().toISOString();
    }
  }

  if (body.notes !== undefined) {
    updates.notes = body.notes;
  }

  // Direct currency override — operator picked CAD/USD on the quote screen.
  if (body.currency === "CAD" || body.currency === "USD") {
    updates.currency = body.currency;
    if (body.currency === "CAD") {
      updates.fx_rate_to_cad = 1;
    } else {
      // USD — use the supplied rate or fetch live from BoC.
      const supplied = Number(body.fx_rate_to_cad);
      if (Number.isFinite(supplied) && supplied > 0) {
        updates.fx_rate_to_cad = supplied;
      } else {
        const fx = await resolveFxRate("USD", null);
        updates.fx_rate_to_cad = fx.rate;
      }
    }
  }

  // Refresh-from-billing-address — re-derive currency + region from the
  // customer's current default billing address. Use case: the customer's
  // billing address was added / corrected after the quote was created and
  // the snapshotted currency is now wrong.
  if (body.refresh_from_billing_address) {
    const { data: q } = await supabase
      .from("quotes")
      .select("customer_id")
      .eq("id", id)
      .maybeSingle();
    if (!q?.customer_id) {
      return NextResponse.json(
        { error: "Quote has no customer to read billing address from" },
        { status: 404 }
      );
    }
    const { data: customer } = await supabase
      .from("customers")
      .select("billing_addresses, default_currency, tax_region")
      .eq("id", q.customer_id)
      .maybeSingle();
    type BillingAddr = {
      label?: string;
      street?: string;
      city?: string;
      province?: string;
      postal_code?: string;
      country?: string;
      country_code?: "CA" | "US" | "OTHER";
      currency?: "CAD" | "USD";
      is_default?: boolean;
    };
    const addresses =
      (customer?.billing_addresses as BillingAddr[] | null) ?? [];
    const resolved =
      addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

    let nextCurrency: "CAD" | "USD";
    let nextRegion: TaxRegion;
    let snapshot: BillingAddr | null = null;
    if (resolved) {
      nextCurrency = currencyForAddress({
        country_code: resolved.country_code,
        country: resolved.country,
        currency: resolved.currency,
      });
      nextRegion = taxRegionForAddress({
        country_code: resolved.country_code,
        country: resolved.country,
        province: resolved.province,
      });
      snapshot = {
        ...resolved,
        country_code:
          resolved.country_code ??
          normalizeCountry(resolved.country ?? ""),
      };
    } else {
      // Fall back to the legacy customer-level fields if no billing address.
      nextCurrency =
        (customer?.default_currency as "CAD" | "USD" | undefined) === "USD"
          ? "USD"
          : "CAD";
      nextRegion =
        (customer?.tax_region as TaxRegion | undefined) ?? "QC";
    }
    // Don't override an explicit currency the operator just set above.
    if (updates.currency === undefined) {
      updates.currency = nextCurrency;
      const fx = await resolveFxRate(nextCurrency, null);
      updates.fx_rate_to_cad = fx.rate;
    }
    updates.tax_region = nextRegion;
    updates.billing_address = snapshot;
  }

  const { data, error } = await supabase
    .from("quotes")
    .update(updates)
    .eq("id", id)
    .select(
      "id, quote_number, status, issued_at, accepted_at, expires_at, notes, currency, fx_rate_to_cad, tax_region"
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to update quote", details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// DELETE /api/quotes/[id] â€” Delete a quote (admin only)
// ---------------------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: quoteId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Check if quote exists
  const { data: quote } = await admin.from("quotes").select("id, pdf_path").eq("id", quoteId).single();
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  // Check if any jobs reference this quote
  const { data: blockingJobs } = await admin
    .from("jobs")
    .select("id, job_number")
    .eq("quote_id", quoteId)
    .limit(5);

  if ((blockingJobs?.length ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete â€” ${blockingJobs!.length} job(s) reference this quote. Delete them first.`,
        blocking: {
          jobs: blockingJobs ?? [],
        },
      },
      { status: 409 }
    );
  }

  // Delete the quote PDF from storage if path exists
  if (quote.pdf_path) {
    await admin.storage.from("quotes").remove([quote.pdf_path]).catch(() => {});
  }

  // Delete the quote record
  const { error } = await admin.from("quotes").delete().eq("id", quoteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted: quoteId });
}
