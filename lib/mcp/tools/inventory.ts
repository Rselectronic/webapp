import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Inventory MCP tools.
 *
 * The previous `rs_get_bg_stock` tool was removed when migration 081 dropped
 * the legacy `bg_stock` / `bg_stock_log` tables. The new inventory feature
 * (inventory_parts + inventory_movements + inventory_allocations) replaces
 * it; an MCP tool surfacing the new model can be added here when needed.
 */
export function registerInventoryTools(_server: McpServer) {
  // Intentionally empty — see file-level comment above.
}
