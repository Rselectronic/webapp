import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = req.nextUrl.searchParams.get("active");
  let query = supabase.from("customers").select("id, code, company_name, contact_name, contact_email, is_active").order("code");
  if (active === "true") query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const { code, company_name, contact_name, contact_email, contact_phone, payment_terms, billing_address, shipping_address, notes } = body;

  if (!code || !company_name) {
    return NextResponse.json({ error: "Customer code and company name are required" }, { status: 400 });
  }

  // Check for duplicate code
  const { data: existing } = await supabase.from("customers").select("id").eq("code", code.toUpperCase()).single();
  if (existing) {
    return NextResponse.json({ error: `Customer code "${code}" already exists` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      code: code.toUpperCase().trim(),
      company_name: company_name.trim(),
      contact_name: contact_name || null,
      contact_email: contact_email || null,
      contact_phone: contact_phone || null,
      payment_terms: payment_terms || "Net 30",
      billing_address: billing_address || {},
      shipping_address: shipping_address || {},
      notes: notes || null,
      is_active: true,
      created_by: user.id,
    })
    .select("id, code, company_name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
