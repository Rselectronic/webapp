import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOverviewTools } from "./tools/overview.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerBomTools } from "./tools/boms.js";
import { registerQuoteTools } from "./tools/quotes.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerProcurementTools } from "./tools/procurement.js";
import { registerProductionTools } from "./tools/production.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerSearchTools } from "./tools/search.js";

/**
 * Register all 22 MCP tools on the server instance.
 *
 * Tools by domain:
 *   overview:     rs_business_overview (1)
 *   customers:    rs_list_customers, rs_get_customer (2)
 *   boms:         rs_get_bom, rs_search_components, rs_classify_component (3)
 *   quotes:       rs_list_quotes, rs_get_quote (2)
 *   jobs:         rs_list_jobs, rs_get_job, rs_update_job_status (3)
 *   procurement:  rs_get_procurement, rs_list_backorders (2)
 *   production:   rs_get_production_status, rs_log_production_event (2)
 *   invoices:     rs_list_invoices, rs_get_aging_report, rs_get_profitability (3)
 *   inventory:    rs_get_bg_stock (1)
 *   search:       rs_search (1)
 *   ─────────────────────────────────────────
 *   Total: 20 tools
 */
export function registerAllTools(server: McpServer): void {
  registerOverviewTools(server);
  registerCustomerTools(server);
  registerBomTools(server);
  registerQuoteTools(server);
  registerJobTools(server);
  registerProcurementTools(server);
  registerProductionTools(server);
  registerInvoiceTools(server);
  registerInventoryTools(server);
  registerSearchTools(server);
}
