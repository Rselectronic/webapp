import { NextResponse } from "next/server";

/**
 * MCP Tool Registry — returns available tools for AI integration.
 * Any AI client can GET this endpoint to discover what tools are available.
 */

const TOOLS = [
  {
    name: "rs_business_overview",
    description:
      "High-level snapshot of RS PCB Assembly: active customers, open quotes, active jobs, outstanding invoices, recent activity.",
    endpoint: "/api/mcp/overview",
    method: "GET",
    parameters: {},
  },
  {
    name: "rs_search",
    description:
      "Universal search across customers, quotes, jobs, invoices, and components.",
    endpoint: "/api/search",
    method: "GET",
    parameters: {
      q: {
        type: "string",
        required: true,
        description: "Search query (minimum 2 characters)",
      },
    },
  },
  {
    name: "rs_classify_component",
    description:
      "Run 3-layer M-Code classification on a single component. Layer 1: DB lookup, Layer 2: Rule engine (47 PAR rules), Layer 3: Claude AI.",
    endpoint: "/api/mcp/classify",
    method: "POST",
    parameters: {
      mpn: {
        type: "string",
        required: true,
        description: "Manufacturer Part Number",
      },
      description: {
        type: "string",
        required: true,
        description: "Component description",
      },
      manufacturer: {
        type: "string",
        required: true,
        description: "Manufacturer name",
      },
      package_case: {
        type: "string",
        required: false,
        description: "Package/case size (e.g. 0402, SOIC-8, QFP-48)",
      },
    },
  },
  {
    name: "rs_list_quotes",
    description: "List quotes with optional status filter.",
    endpoint: "/api/quotes",
    method: "GET",
    parameters: {
      status: {
        type: "string",
        required: false,
        description:
          "Filter by status: draft, review, sent, accepted, rejected, expired",
      },
    },
  },
  {
    name: "rs_create_quote",
    description: "Create a new quote from a parsed BOM.",
    endpoint: "/api/quotes",
    method: "POST",
    parameters: {
      bom_id: { type: "string", required: true },
      quantities: {
        type: "array",
        required: true,
        description: "Array of 4 quantity tiers",
      },
    },
  },
];

export async function GET() {
  return NextResponse.json({
    name: "RS PCB Assembly MCP",
    version: "1.0.0",
    description:
      "AI integration endpoints for RS PCB Assembly ERP. Provides business overview, component classification, search, and quote management.",
    tools: TOOLS,
  });
}
