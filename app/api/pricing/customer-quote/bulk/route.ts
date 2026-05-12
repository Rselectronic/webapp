import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertCustomerQuote } from "../route";

// ---------------------------------------------------------------------------
// POST /api/pricing/customer-quote/bulk
//
// Bulk import of distributor quotes — for when a vendor responds to an RFQ
// with a sheet of prices for many parts. Body shape:
//
//   {
//     "bom_id": "<uuid>",           // optional; if present, filters matches
//     "rows": [
//       { "mpn": "C0805...", "supplier_name": "WMD", "unit_price": 0.42,
//         "currency": "CAD", "qty_break": 100, "valid_until": "2026-06-01",
//         "quote_ref": "WMD-Q-2604-12" },
//       ...
//     ]
//   }
//
// Returns per-row status so the UI can show "23 matched, 2 not found in this
// BOM, 1 invalid." Rows missing required fields are reported as `invalid`;
// rows whose MPN doesn't appear in the BOM (when bom_id is supplied) are
// reported as `not_in_bom` and NOT written — keeps the cache clean of
// random pastes.
// ---------------------------------------------------------------------------

interface BulkRow {
  mpn?: string;
  supplier_name?: string;
  unit_price?: number | string;
  currency?: string;
  qty_break?: number | string;
  quote_ref?: string;
  valid_until?: string;
  supplier_part_number?: string;
}

interface BulkBody {
  bom_id?: string;
  rows: BulkRow[];
}

interface RowResult {
  index: number;
  mpn: string;
  status: "saved" | "invalid" | "not_in_bom" | "error";
  reason?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0)
    return NextResponse.json(
      { error: "rows must be a non-empty array" },
      { status: 400 }
    );
  if (body.rows.length > 1000)
    return NextResponse.json(
      { error: "rows capped at 1000 per request" },
      { status: 400 }
    );

  // Build a set of MPNs / CPCs present in the BOM so we can filter rows
  // that don't match anything. Done in one query up front to avoid 1000
  // per-row lookups.
  let bomMpns: Set<string> | null = null;
  if (body.bom_id) {
    const { data: lines } = await supabase
      .from("bom_lines")
      .select("mpn, cpc")
      .eq("bom_id", body.bom_id);
    bomMpns = new Set();
    for (const l of (lines ?? []) as Array<{
      mpn: string | null;
      cpc: string | null;
    }>) {
      if (l.mpn?.trim()) bomMpns.add(l.mpn.trim().toUpperCase());
      if (l.cpc?.trim()) bomMpns.add(l.cpc.trim().toUpperCase());
    }
  }

  const results: RowResult[] = [];
  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i];
    const mpn = row.mpn?.trim() ?? "";

    if (!mpn) {
      results.push({ index: i, mpn: "", status: "invalid", reason: "missing mpn" });
      continue;
    }
    if (bomMpns && !bomMpns.has(mpn.toUpperCase())) {
      results.push({
        index: i,
        mpn,
        status: "not_in_bom",
        reason: "MPN/CPC not found in this BOM",
      });
      continue;
    }

    const unit_price =
      typeof row.unit_price === "string"
        ? parseFloat(row.unit_price)
        : row.unit_price;
    const qty_break =
      typeof row.qty_break === "string"
        ? parseInt(row.qty_break, 10)
        : row.qty_break;

    const result = await upsertCustomerQuote(supabase, user.id, {
      mpn,
      supplier_name: row.supplier_name ?? "",
      unit_price: unit_price as number,
      currency: row.currency,
      qty_break:
        typeof qty_break === "number" && Number.isFinite(qty_break)
          ? qty_break
          : undefined,
      quote_ref: row.quote_ref,
      valid_until: row.valid_until,
      supplier_part_number: row.supplier_part_number,
    });

    if (result.ok) {
      results.push({ index: i, mpn, status: "saved" });
    } else if (result.status === 400) {
      results.push({ index: i, mpn, status: "invalid", reason: result.error });
    } else {
      results.push({ index: i, mpn, status: "error", reason: result.error });
    }
  }

  const summary = {
    saved: results.filter((r) => r.status === "saved").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    not_in_bom: results.filter((r) => r.status === "not_in_bom").length,
    error: results.filter((r) => r.status === "error").length,
  };

  return NextResponse.json({ ok: true, summary, results });
}
