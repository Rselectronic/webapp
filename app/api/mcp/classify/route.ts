import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyComponent } from "@/lib/mcode/classifier";

/**
 * rs_classify_component — Run 3-layer M-Code classification on a single component.
 * POST { mpn, description, manufacturer, package_case? }
 * Returns { m_code, confidence, source, reasoning }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    mpn?: string;
    description?: string;
    manufacturer?: string;
    package_case?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const mpn = body.mpn?.trim() ?? "";
  const description = body.description?.trim() ?? "";
  const manufacturer = body.manufacturer?.trim() ?? "";

  if (!mpn && !description) {
    return NextResponse.json(
      { error: "At least one of mpn or description is required" },
      { status: 400 }
    );
  }

  try {
    const result = await classifyComponent(
      {
        mpn,
        description,
        cpc: mpn, // fallback: use MPN as CPC
        manufacturer,
        package_case: body.package_case?.trim(),
      },
      supabase
    );

    return NextResponse.json({
      m_code: result.m_code,
      confidence: result.confidence,
      source: result.source,
      reasoning: result.rule_id ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Classification failed" },
      { status: 500 }
    );
  }
}
