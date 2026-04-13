import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOverviewTools } from "./tools/overview";
import { registerCustomerTools } from "./tools/customers";
import { registerBomTools } from "./tools/boms";
import { registerQuoteTools } from "./tools/quotes";
import { registerJobTools } from "./tools/jobs";
import { registerProcurementTools } from "./tools/procurement";
import { registerProductionTools } from "./tools/production";
import { registerInvoiceTools } from "./tools/invoices";
import { registerInventoryTools } from "./tools/inventory";
import { registerSearchTools } from "./tools/search";
import { allowedToolsForRole, type McpRole } from "./auth";

/**
 * Build a fresh McpServer with only the tools allowed for the given user role.
 *
 * We build a fresh instance per request (stateless mode). This is the
 * pattern recommended by the MCP SDK for serverless / Next.js deployments
 * so that session/request state doesn't leak between users.
 */
export function buildMcpServerForRole(role: McpRole): McpServer {
  const server = new McpServer(
    {
      name: "rs-pcb-assembly",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools first, then remove the ones the role can't access.
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

  const allowed = allowedToolsForRole(role);

  // The McpServer keeps tools in the internal _registeredTools map. Rather
  // than reach into private state, we iterate the registry (exposed via the
  // server.server lower-level API) and remove disallowed tools.
  //
  // The simplest + safest approach is to disable them via the RegisteredTool
  // handle that `.tool()` returns — but we didn't capture those handles.
  // Instead we use the public registry accessor:
  const registry = (
    server as unknown as {
      _registeredTools: Record<string, { remove?: () => void; disable?: () => void }>;
    }
  )._registeredTools;

  if (registry) {
    for (const name of Object.keys(registry)) {
      if (!allowed.has(name)) {
        const t = registry[name];
        if (typeof t?.remove === "function") {
          t.remove();
        } else if (typeof t?.disable === "function") {
          t.disable();
        } else {
          delete registry[name];
        }
      }
    }
  }

  return server;
}
