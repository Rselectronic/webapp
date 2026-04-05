import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { parseBom } from "@/lib/bom/parser";
import { resolveColumnMapping } from "@/lib/bom/column-mapper";
import { classifyBomLines } from "@/lib/mcode/classifier";
import type { BomConfig, RawRow } from "@/lib/bom/types";
import * as XLSX from "xlsx";

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const customerId = formData.get("customer_id") as string;
  const gmpId = formData.get("gmp_id") as string;

  if (!file || !customerId || !gmpId) {
    return NextResponse.json(
      { error: "Missing required fields: file, customer_id, gmp_id" },
      { status: 400 }
    );
  }

  const { data: customer } = await admin
    .from("customers")
    .select("code, bom_config")
    .eq("id", customerId)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const bomConfig = (customer.bom_config as BomConfig) ?? { columns: "auto_detect" };

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const allRows: (string | number | null)[][] = XLSX.utils.sheet_to_json(
      sheet,
      { header: 1, raw: false }
    );

    if (allRows.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Determine header row and data start
    let headers: string[];
    let dataStartIndex: number;

    if (bomConfig.columns_fixed) {
      headers = bomConfig.columns_fixed;
      dataStartIndex = 0;
    } else if (bomConfig.header_row !== null && bomConfig.header_row !== undefined) {
      const headerRowIndex = bomConfig.header_row;
      if (allRows.length <= headerRowIndex) {
        return NextResponse.json({ error: "header_row exceeds file length" }, { status: 400 });
      }
      headers = allRows[headerRowIndex].map((h) => String(h ?? ""));
      dataStartIndex = headerRowIndex + 1;
    } else {
      // Auto-scan: try rows 0-20 to find the one with recognizable column headers
      const knownHeaders = [
        "qty", "quantity", "designator", "mpn", "manufacturer part number",
        "description", "reference", "part number", "manufacturer", "value",
        "ref des", "refdes", "manufacturer part", "qté",
      ];
      let foundRow = -1;
      for (let i = 0; i < Math.min(allRows.length, 20); i++) {
        const rowStrs = (allRows[i] ?? []).map((c) => String(c ?? "").toLowerCase().trim()).filter(Boolean);
        const matches = rowStrs.filter((s) => knownHeaders.some((kw) => s.includes(kw)));
        if (matches.length >= 2) {
          foundRow = i;
          break;
        }
      }
      if (foundRow >= 0) {
        headers = allRows[foundRow].map((h) => String(h ?? ""));
        dataStartIndex = foundRow + 1;
      } else {
        // Fallback: use row 0
        headers = allRows[0].map((h) => String(h ?? ""));
        dataStartIndex = 1;
      }
    }

    // Convert to RawRow objects
    const rawRows: RawRow[] = allRows.slice(dataStartIndex).map((row) => {
      const obj: RawRow = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] ?? null;
      });
      return obj;
    });

    // Resolve column mapping and parse
    const mapping = resolveColumnMapping(bomConfig, headers);
    const parseResult = parseBom(rawRows, mapping, headers, bomConfig);

    // Upload file to Supabase Storage (admin bypasses RLS)
    const filePath = `${customer.code}/${gmpId}/${file.name}`;
    const fileBuffer = new Uint8Array(buffer);
    const { error: uploadError } = await admin.storage.from("boms").upload(filePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (uploadError) {
      console.error("[BOM UPLOAD] Storage error:", uploadError);
      return NextResponse.json({ error: "File upload failed", details: uploadError.message }, { status: 500 });
    }

    // Create BOM record (admin bypasses RLS)
    const { data: bom, error: bomError } = await admin
      .from("boms")
      .insert({
        gmp_id: gmpId,
        customer_id: customerId,
        file_name: file.name,
        file_path: filePath,
        file_hash: `${file.size}-${file.name}`,
        status: "parsing",
        created_by: user.id,
      })
      .select()
      .single();

    if (bomError || !bom) {
      return NextResponse.json(
        { error: "Failed to create BOM record", details: bomError?.message },
        { status: 500 }
      );
    }

    // Classify all parsed lines
    const classificationResults = await classifyBomLines(
      parseResult.lines.map((l) => ({
        mpn: l.mpn,
        description: l.description,
        cpc: l.cpc,
        manufacturer: l.manufacturer,
      })),
      admin
    );

    // Build bom_lines rows
    const bomLines = parseResult.lines.map((line, idx) => ({
      bom_id: bom.id,
      line_number: line.line_number,
      quantity: line.quantity,
      reference_designator: line.reference_designator,
      cpc: line.cpc,
      description: line.description,
      mpn: line.mpn,
      manufacturer: line.manufacturer,
      is_pcb: line.is_pcb,
      is_dni: line.is_dni,
      m_code: classificationResults[idx]?.m_code ?? null,
      m_code_confidence: classificationResults[idx]?.confidence ?? null,
      m_code_source: classificationResults[idx]?.source ?? null,
    }));

    // Prepend PCB row if found
    if (parseResult.pcb_row) {
      bomLines.unshift({
        bom_id: bom.id,
        line_number: 0,
        quantity: parseResult.pcb_row.quantity,
        reference_designator: parseResult.pcb_row.reference_designator,
        cpc: parseResult.pcb_row.cpc,
        description: parseResult.pcb_row.description,
        mpn: parseResult.pcb_row.mpn,
        manufacturer: parseResult.pcb_row.manufacturer,
        is_pcb: true,
        is_dni: false,
        m_code: null,
        m_code_confidence: null as unknown as number,
        m_code_source: null,
      });
    }

    const { error: linesError } = await admin.from("bom_lines").insert(bomLines);
    if (linesError) {
      return NextResponse.json(
        { error: "Failed to insert BOM lines", details: linesError.message },
        { status: 500 }
      );
    }

    const classifiedCount = classificationResults.filter((r) => r.m_code !== null).length;
    const unclassifiedCount = classificationResults.filter((r) => r.m_code === null).length;

    // Update BOM to parsed
    await admin
      .from("boms")
      .update({
        status: "parsed",
        component_count: parseResult.lines.length,
        parse_result: {
          stats: parseResult.stats,
          classification_summary: {
            total: classificationResults.length,
            classified: classifiedCount,
            unclassified: unclassifiedCount,
          },
        },
      })
      .eq("id", bom.id);

    return NextResponse.json({
      bom_id: bom.id,
      file_name: file.name,
      stats: parseResult.stats,
      component_count: parseResult.lines.length,
      classified: classifiedCount,
      unclassified: unclassifiedCount,
    });
  } catch (err) {
    console.error("[BOM PARSE] Error:", err);
    return NextResponse.json(
      {
        error: "Parse failed",
        details: err instanceof Error ? err.message : "Unknown error",
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}
