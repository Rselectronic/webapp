import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayMontreal } from "@/lib/utils/format";

const VALID_TABLES = [
  "quotes",
  "jobs",
  "invoices",
  "customers",
  "payments",
] as const;
type ExportTable = (typeof VALID_TABLES)[number];

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const table = searchParams.get("table") as ExportTable | null;

  if (!table || !VALID_TABLES.includes(table)) {
    return NextResponse.json(
      { error: `Invalid table. Must be one of: ${VALID_TABLES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = todayMontreal();
  let csvContent = "";

  if (table === "customers") {
    // Round-trip-safe customer-level fields only (no nested address/contact
    // arrays — those have their own CSV at table=customer_addresses where
    // each address gets its own readable row). Keys:
    //   - `id` is the primary lookup key (lock; never edit).
    //   - `code` is the fallback lookup key.
    //   - `created_at` / `updated_at` are info-only and ignored on import.
    const { data, error } = await supabase
      .from("customers")
      .select(
        `id, code, company_name, folder_name,
         contact_name, contact_email, contact_phone,
         payment_terms, is_active, notes,
         default_currency, tax_region,
         created_at, updated_at`
      )
      .order("code");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const headers = [
      "id",
      "code",
      "company_name",
      "folder_name",
      "is_active",
      "payment_terms",
      "default_currency",
      "tax_region",
      "contact_name",
      "contact_email",
      "contact_phone",
      "notes",
      "created_at",
      "updated_at",
    ];

    const rows = (data ?? []).map((r) =>
      toCsvRow([
        r.id,
        r.code,
        r.company_name,
        r.folder_name ?? "",
        r.is_active ? "Yes" : "No",
        r.payment_terms,
        r.default_currency ?? "",
        r.tax_region ?? "",
        r.contact_name ?? "",
        r.contact_email ?? "",
        r.contact_phone ?? "",
        r.notes ?? "",
        r.created_at,
        r.updated_at,
      ])
    );
    csvContent = [toCsvRow(headers), ...rows].join("\n");
  }

  if (table === "quotes") {
    const { data, error } = await supabase
      .from("quotes")
      .select("quote_number, status, created_at, customers(code), gmps(gmp_number)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type QuoteRow = {
      quote_number: string;
      status: string;
      created_at: string;
      customers: { code: string } | null;
      gmps: { gmp_number: string } | null;
    };

    const rows_typed = (data ?? []) as unknown as QuoteRow[];
    const headers = ["Quote Number", "Status", "Customer Code", "GMP Number", "Created At"];
    const rows = rows_typed.map((r) =>
      toCsvRow([r.quote_number, r.status, r.customers?.code, r.gmps?.gmp_number, r.created_at])
    );
    csvContent = [toCsvRow(headers), ...rows].join("\n");
  }

  if (table === "jobs") {
    const { data, error } = await supabase
      .from("jobs")
      .select("job_number, status, quantity, created_at, customers(code), gmps(board_side)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type JobRow = {
      job_number: string;
      status: string;
      quantity: number;
      created_at: string;
      customers: { code: string } | null;
      gmps: { board_side: string | null } | null;
    };

    const rows_typed = (data ?? []) as unknown as JobRow[];
    const headers = ["Job Number", "Status", "Quantity", "Board Side", "Customer Code", "Created At"];
    const rows = rows_typed.map((r) =>
      toCsvRow([r.job_number, r.status, r.quantity, r.gmps?.board_side ?? "", r.customers?.code, r.created_at])
    );
    csvContent = [toCsvRow(headers), ...rows].join("\n");
  }

  if (table === "invoices") {
    const { data, error } = await supabase
      .from("invoices")
      .select("invoice_number, status, subtotal, total, issued_date, due_date, paid_date")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const headers = ["Invoice Number", "Status", "Subtotal", "Total", "Issued Date", "Due Date", "Paid Date"];
    const rows = (data ?? []).map((r) =>
      toCsvRow([r.invoice_number, r.status, r.subtotal, r.total, r.issued_date, r.due_date, r.paid_date])
    );
    csvContent = [toCsvRow(headers), ...rows].join("\n");
  }

  if (table === "payments") {
    // `payments` is in VALID_TABLES and the /invoices/payments page links here
    // — without this branch the endpoint returned an empty CSV (no error, no
    // headers) which silently broke the "Export CSV" button on that page.
    // Migration 101 columns: method / reference (not payment_method /
    // reference_number). The header labels keep the longer human names.
    const { data, error } = await supabase
      .from("payments")
      .select(
        "amount, payment_date, method, reference, notes, created_at, invoices(invoice_number, customers(code, company_name))"
      )
      .order("payment_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type PaymentRow = {
      amount: number;
      payment_date: string;
      method: string;
      reference: string | null;
      notes: string | null;
      created_at: string;
      invoices: {
        invoice_number: string;
        customers: { code: string; company_name: string } | null;
      } | null;
    };

    const rows_typed = (data ?? []) as unknown as PaymentRow[];
    const headers = [
      "Invoice Number",
      "Customer Code",
      "Customer Name",
      "Amount",
      "Payment Date",
      "Method",
      "Reference Number",
      "Notes",
      "Created At",
    ];
    const rows = rows_typed.map((r) =>
      toCsvRow([
        r.invoices?.invoice_number ?? "",
        r.invoices?.customers?.code ?? "",
        r.invoices?.customers?.company_name ?? "",
        r.amount,
        r.payment_date,
        r.method,
        r.reference,
        r.notes,
        r.created_at,
      ])
    );
    csvContent = [toCsvRow(headers), ...rows].join("\n");
  }

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${table}-export-${date}.csv"`,
    },
  });
}
