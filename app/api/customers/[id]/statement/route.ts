/**
 * GET /api/customers/[id]/statement
 *
 * Per-customer ledger: every charge (invoice) and every credit (payment)
 * within an optional date window, plus opening / closing balances and an
 * aging snapshot. Admin-only — financial data.
 *
 * Query params:
 *   from   YYYY-MM-DD (inclusive). Default = unbounded.
 *   to     YYYY-MM-DD (inclusive). Default = today.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRole } from "@/lib/auth/roles";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  getCustomerLedger,
  getCustomerAging,
} from "@/lib/payments/totals";
import { todayMontreal } from "@/lib/utils/format";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can view customer statements." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");

  if (fromRaw && !ISO_DATE_RE.test(fromRaw)) {
    return NextResponse.json(
      { error: "from must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  if (toRaw && !ISO_DATE_RE.test(toRaw)) {
    return NextResponse.json(
      { error: "to must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const from = fromRaw ?? null;
  const to = toRaw ?? todayMontreal();

  // Verify customer + grab the bits we need for the statement header.
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select(
      "id, code, company_name, contact_name, billing_address, payment_terms"
    )
    .eq("id", id)
    .maybeSingle();

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const [ledger, aging] = await Promise.all([
    getCustomerLedger(supabase, id, {
      from: from ?? undefined,
      to,
    }),
    getCustomerAging(supabase, id),
  ]);

  return NextResponse.json({
    customer,
    period: { from, to },
    opening_balance: ledger.openingBalance,
    closing_balance: ledger.closingBalance,
    entries: ledger.entries,
    aging,
  });
}
