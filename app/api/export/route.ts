import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_TABLES = ["quotes", "jobs", "invoices", "customers"] as const;
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

  const date = new Date().toISOString().slice(0, 10);
  let csvContent = "";

  if (table === "customers") {
    const { data, error } = await supabase
      .from("customers")
      .select("code, company_name, contact_name, contact_email, payment_terms, is_active")
      .order("code");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const headers = ["Code", "Company Name", "Contact Name", "Contact Email", "Payment Terms", "Active"];
    const rows = (data ?? []).map((r) =>
      toCsvRow([r.code, r.company_name, r.contact_name, r.contact_email, r.payment_terms, r.is_active ? "Yes" : "No"])
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
      .select("job_number, status, quantity, assembly_type, created_at, customers(code)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type JobRow = {
      job_number: string;
      status: string;
      quantity: number;
      assembly_type: string;
      created_at: string;
      customers: { code: string } | null;
    };

    const rows_typed = (data ?? []) as unknown as JobRow[];
    const headers = ["Job Number", "Status", "Quantity", "Assembly Type", "Customer Code", "Created At"];
    const rows = rows_typed.map((r) =>
      toCsvRow([r.job_number, r.status, r.quantity, r.assembly_type, r.customers?.code, r.created_at])
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

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${table}-export-${date}.csv"`,
    },
  });
}
