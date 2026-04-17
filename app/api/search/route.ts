import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const { user, supabase } = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sanitize input — strip PostgREST filter metacharacters to prevent filter injection
  const sanitized = q.replace(/[,.()"\\]/g, "");
  const pattern = `%${sanitized}%`;

  const [customers, quotes, jobs, invoices, components] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, company_name")
      .or(`code.ilike.${pattern},company_name.ilike.${pattern}`)
      .limit(5),
    supabase
      .from("quotes")
      .select("id, quote_number, customer_id, customers(company_name)")
      .ilike("quote_number", pattern)
      .limit(5),
    supabase
      .from("jobs")
      .select("id, job_number, customer_id, customers(company_name)")
      .ilike("job_number", pattern)
      .limit(5),
    supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, customers(company_name)")
      .ilike("invoice_number", pattern)
      .limit(5),
    supabase
      .from("components")
      .select("id, mpn, manufacturer, description")
      .ilike("mpn", pattern)
      .limit(5),
  ]);

  type CustomerRow = { id: string; code: string; company_name: string };
  type QuoteRow = {
    id: string;
    quote_number: string;
    customer_id: string;
    customers: { company_name: string } | null;
  };
  type JobRow = {
    id: string;
    job_number: string;
    customer_id: string;
    customers: { company_name: string } | null;
  };
  type InvoiceRow = {
    id: string;
    invoice_number: string;
    customer_id: string;
    customers: { company_name: string } | null;
  };
  type ComponentRow = {
    id: string;
    mpn: string;
    manufacturer: string | null;
    description: string | null;
  };

  const results: {
    type: string;
    id: string;
    title: string;
    url: string;
  }[] = [];

  for (const c of (customers.data ?? []) as unknown as CustomerRow[]) {
    results.push({
      type: "customer",
      id: c.id,
      title: `${c.code} — ${c.company_name}`,
      url: `/customers/${c.id}`,
    });
  }

  for (const q of (quotes.data ?? []) as unknown as QuoteRow[]) {
    const label = q.customers?.company_name
      ? `${q.quote_number} (${q.customers.company_name})`
      : q.quote_number;
    results.push({
      type: "quote",
      id: q.id,
      title: label,
      url: `/quotes/${q.id}`,
    });
  }

  for (const j of (jobs.data ?? []) as unknown as JobRow[]) {
    const label = j.customers?.company_name
      ? `${j.job_number} (${j.customers.company_name})`
      : j.job_number;
    results.push({
      type: "job",
      id: j.id,
      title: label,
      url: `/jobs/${j.id}`,
    });
  }

  for (const inv of (invoices.data ?? []) as unknown as InvoiceRow[]) {
    const label = inv.customers?.company_name
      ? `${inv.invoice_number} (${inv.customers.company_name})`
      : inv.invoice_number;
    results.push({
      type: "invoice",
      id: inv.id,
      title: label,
      url: `/invoices/${inv.id}`,
    });
  }

  for (const comp of (components.data ?? []) as unknown as ComponentRow[]) {
    const label = comp.manufacturer
      ? `${comp.mpn} — ${comp.manufacturer}`
      : comp.mpn;
    results.push({
      type: "component",
      id: comp.id,
      title: label,
      url: `/components/${comp.id}`,
    });
  }

  return NextResponse.json({ results });
}
