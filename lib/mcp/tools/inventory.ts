import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabase } from "../db";

export function registerInventoryTools(server: McpServer) {
  server.tool(
    "rs_get_bg_stock",
    "List all Bulk Goods (BG) stock items from procurement lines marked as BG. Shows MPN, current quantities, and stock status.",
    {
      m_code: z
        .string()
        .optional()
        .describe("Filter by M-Code, e.g. 'CP', '0402'"),
      low_stock_only: z
        .boolean()
        .default(false)
        .describe("Only show items with low/out-of-stock status"),
    },
    async ({ m_code, low_stock_only }) => {
      let query = supabase
        .from("procurement_lines")
        .select(
          "mpn, description, m_code, qty_ordered, qty_received, supplier, is_bg"
        )
        .eq("is_bg", true);

      if (m_code) query = query.eq("m_code", m_code.toUpperCase());

      const { data, error } = await query;
      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      const stockMap: Record<
        string,
        {
          mpn: string;
          description: string;
          m_code: string;
          total_ordered: number;
          total_received: number;
          supplier: string;
        }
      > = {};

      for (const line of data ?? []) {
        const key = line.mpn;
        if (!stockMap[key]) {
          stockMap[key] = {
            mpn: line.mpn,
            description: line.description ?? "",
            m_code: line.m_code ?? "",
            total_ordered: 0,
            total_received: 0,
            supplier: line.supplier ?? "",
          };
        }
        stockMap[key].total_ordered += line.qty_ordered ?? 0;
        stockMap[key].total_received += line.qty_received ?? 0;
      }

      let items = Object.values(stockMap).map((item) => {
        const currentQty = item.total_received;
        const minQty = Math.ceil(item.total_ordered * 0.2);
        let status: "ok" | "low" | "out" = "ok";
        if (currentQty === 0) status = "out";
        else if (currentQty < minQty) status = "low";

        return {
          mpn: item.mpn,
          description: item.description,
          m_code: item.m_code,
          current_qty: currentQty,
          min_qty: minQty,
          status,
          supplier: item.supplier,
        };
      });

      if (low_stock_only) {
        items = items.filter((i) => i.status !== "ok");
      }

      items.sort((a, b) => {
        const order = { out: 0, low: 1, ok: 2 };
        return order[a.status] - order[b.status];
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(items, null, 2) },
        ],
      };
    }
  );
}
