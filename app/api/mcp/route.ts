import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServerForRole } from "@/lib/mcp/server";
import { validateMcpRequest } from "@/lib/mcp/auth";

/**
 * RS PCB Assembly — MCP Server over Streamable HTTP
 *
 * This endpoint speaks the Model Context Protocol (JSON-RPC 2.0) so that
 * any MCP-compatible client (Claude Desktop, OpenClaw, mcp-inspector, etc.)
 * can connect and call the ~20 RS business tools.
 *
 * Auth: Supabase JWT in `Authorization: Bearer <token>` header.
 *       Role (ceo / operations_manager / shop_floor) determines which
 *       tools are exposed.
 *
 * Transport: Stateless streamable HTTP (Web Standards). A new McpServer
 * instance is built per request, so no session state is shared between
 * users — safe for serverless / Vercel.
 *
 * Client config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "rs-pcb-assembly": {
 *         "url": "https://webapp-fawn-seven.vercel.app/api/mcp",
 *         "headers": {
 *           "Authorization": "Bearer <supabase-jwt>"
 *         }
 *       }
 *     }
 *   }
 */

// Force Node.js runtime — MCP SDK uses Node streams under the hood for
// request buffering even in the Web Standards transport.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  // 1. Validate Supabase JWT from Authorization header
  let user;
  try {
    user = await validateMcpRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message },
        id: null,
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": 'Bearer realm="rs-pcb-mcp"',
        },
      }
    );
  }

  // 2. Build a fresh MCP server instance scoped to this user's role
  const server = buildMcpServerForRole(user.role);

  // 3. Create a stateless transport and hand off the request.
  //
  // We do NOT close the transport/server in a `finally` block — the
  // returned Response carries a ReadableStream body that the runtime
  // flushes after this function returns. Closing early would tear down
  // that stream mid-flight (EPIPE / aborted stream errors). In stateless
  // mode the transport sets `_hasHandledRequest = true` after one use
  // and both server + transport are garbage-collected once the Response
  // is consumed.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true, // Claude Desktop and mcp-inspector prefer JSON
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    console.error("[MCP] Error handling request:", err);
    // Best-effort cleanup on the error path only
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    try {
      await server.close();
    } catch {
      /* ignore */
    }
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message:
            err instanceof Error ? err.message : "Internal server error",
        },
        id: null,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function GET(request: Request): Promise<Response> {
  // GET is used by MCP clients to open an SSE notification stream (optional
  // in stateless mode). We still route it through handleRequest so the
  // transport can respond with 405 / 200 as appropriate.
  return handle(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(request);
}
