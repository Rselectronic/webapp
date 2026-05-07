import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db";

export function registerBomTools(server: McpServer) {
  server.tool(
    "rs_get_bom",
    "Get a full parsed BOM with all component lines and M-Code assignments. Look up by bom_id or by gmp_number + customer_code.",
    {
      bom_id: z.string().uuid().optional().describe("BOM UUID"),
      gmp_number: z
        .string()
        .optional()
        .describe("GMP number, e.g. 'TL265-5040-000-T'"),
      customer_code: z
        .string()
        .optional()
        .describe("Customer code, required if using gmp_number"),
    },
    async ({ bom_id, gmp_number, customer_code }) => {
      let bomId = bom_id;

      if (!bomId && gmp_number && customer_code) {
        const { data: customer } = await supabase
          .from("customers")
          .select("id")
          .eq("code", customer_code.toUpperCase())
          .single();
        if (!customer) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Customer '${customer_code}' not found.`,
              },
            ],
            isError: true,
          };
        }
        const { data: gmp } = await supabase
          .from("gmps")
          .select("id")
          .eq("customer_id", customer.id)
          .eq("gmp_number", gmp_number)
          .single();
        if (!gmp) {
          return {
            content: [
              {
                type: "text" as const,
                text: `GMP '${gmp_number}' not found for customer '${customer_code}'.`,
              },
            ],
            isError: true,
          };
        }
        const { data: bom } = await supabase
          .from("boms")
          .select("id")
          .eq("gmp_id", gmp.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (!bom) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No BOM found for GMP '${gmp_number}'.`,
              },
            ],
            isError: true,
          };
        }
        bomId = bom.id;
      }

      if (!bomId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide either bom_id or both gmp_number and customer_code.",
            },
          ],
          isError: true,
        };
      }

      const [{ data: bom, error }, { data: lines }] = await Promise.all([
        supabase
          .from("boms")
          .select(
            "*, customers(code, company_name), gmps(gmp_number, board_name)"
          )
          .eq("id", bomId)
          .single(),
        supabase
          .from("bom_lines")
          .select("*")
          .eq("bom_id", bomId)
          .order("line_number"),
      ]);

      if (error || !bom) {
        return {
          content: [
            {
              type: "text" as const,
              text: `BOM not found: ${error?.message ?? "unknown"}`,
            },
          ],
          isError: true,
        };
      }

      const bomRow = bom as Record<string, unknown>;
      const result = {
        bom_id: bomRow.id,
        file_name: bomRow.file_name,
        status: bomRow.status,
        revision: bomRow.revision,
        component_count: bomRow.component_count,
        customer: bomRow.customers,
        gmp: bomRow.gmps,
        lines: (lines ?? []).map((l) => ({
          line_number: l.line_number,
          quantity: l.quantity,
          reference_designator: l.reference_designator,
          cpc: l.cpc,
          description: l.description,
          mpn: l.mpn,
          manufacturer: l.manufacturer,
          m_code: l.m_code,
          m_code_confidence: l.m_code_confidence,
          m_code_source: l.m_code_source,
          is_pcb: l.is_pcb,
          is_dni: l.is_dni,
        })),
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "rs_search_components",
    "Search the master component library by MPN, description, or M-Code.",
    {
      query: z.string().describe("Search term (MPN, description, or keyword)"),
      m_code: z
        .string()
        .optional()
        .describe("Filter by M-Code, e.g. 'CP', 'IP', 'TH'"),
      limit: z.number().default(20).describe("Max results to return"),
    },
    async ({ query, m_code, limit }) => {
      let q = supabase
        .from("components")
        .select(
          "mpn, manufacturer, description, category, package_case, mounting_type, m_code, m_code_source, digikey_pn, mouser_pn"
        )
        .or(
          `mpn.ilike.%${query}%,description.ilike.%${query}%,manufacturer.ilike.%${query}%`
        )
        .limit(limit);

      if (m_code) {
        q = q.eq("m_code", m_code.toUpperCase());
      }

      const { data, error } = await q;
      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(data ?? [], null, 2) },
        ],
      };
    }
  );

  server.tool(
    "rs_classify_component",
    "Run rule-based M-Code classification on a single component. Checks the components DB first, then applies PAR rules.",
    {
      mpn: z.string().describe("Manufacturer Part Number"),
      cpc: z
        .string()
        .optional()
        .describe(
          "Customer Part Code (preferred lookup key — components table is CPC-keyed). Falls back to mpn if omitted."
        ),
      description: z.string().optional().describe("Component description"),
      package_case: z
        .string()
        .optional()
        .describe("Package/case, e.g. '0402', 'SOIC-8'"),
      mounting_type: z
        .string()
        .optional()
        .describe("'Surface Mount' or 'Through Hole'"),
    },
    async ({ mpn, cpc, description, package_case, mounting_type }) => {
      // Layer 1: Database lookup (components table is keyed on CPC)
      const lookupKey = cpc || mpn;
      const { data: existing } = await supabase
        .from("components")
        .select("m_code, m_code_source")
        .eq("cpc", lookupKey)
        .limit(1)
        .maybeSingle();

      if (existing?.m_code) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  mpn,
                  cpc: lookupKey,
                  m_code: existing.m_code,
                  confidence: 0.95,
                  source: "database",
                  reasoning: `Found in components table (source: ${existing.m_code_source})`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Layer 2: Rule engine
      const { data: rules } = await supabase
        .from("m_code_rules")
        .select("*")
        .eq("is_active", true)
        .order("priority");

      const input: Record<string, string> = {};
      if (description) input.description = description.toLowerCase();
      if (package_case) input.package_case = package_case.toLowerCase();
      if (mounting_type) input.mounting_type = mounting_type.toLowerCase();
      if (mpn) input.mpn = mpn.toLowerCase();

      for (const rule of rules ?? []) {
        const match1 = matchCondition(
          input,
          rule.field_1,
          rule.operator_1,
          rule.value_1
        );
        if (!match1) continue;

        if (rule.field_2 && rule.operator_2 && rule.value_2) {
          const match2 = matchCondition(
            input,
            rule.field_2,
            rule.operator_2,
            rule.value_2
          );
          if (!match2) continue;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  mpn,
                  m_code: rule.assigned_m_code,
                  confidence: 0.85,
                  source: "rules",
                  reasoning: `Matched rule ${rule.rule_id}: ${rule.description ?? ""}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                mpn,
                m_code: null,
                confidence: 0,
                source: null,
                reasoning:
                  "No match in components DB or rule engine. Requires manual classification or API lookup.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

function matchCondition(
  input: Record<string, string>,
  field: string | null,
  operator: string | null,
  value: string | null
): boolean {
  if (!field || !operator || !value) return false;
  const fieldValue = input[field.toLowerCase()];
  if (fieldValue === undefined) return false;

  const lowerValue = value.toLowerCase();

  switch (operator) {
    case "equals":
      return fieldValue === lowerValue;
    case "contains":
      return fieldValue.includes(lowerValue);
    case "regex":
      try {
        return new RegExp(value, "i").test(fieldValue);
      } catch {
        return false;
      }
    case "in":
      return lowerValue
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .includes(fieldValue);
    default:
      return false;
  }
}
