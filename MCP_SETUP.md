# RS PCB Assembly — MCP Server Setup

This repo exposes a real **Model Context Protocol** (MCP) server at
`/api/mcp` so any MCP-compatible client (Claude Desktop, OpenClaw,
`mcp-inspector`, etc.) can plug directly into the RS ERP and call ~20
business tools with full auth.

- **Endpoint (production):** `https://webapp-fawn-seven.vercel.app/api/mcp`
- **Endpoint (local dev):** `http://localhost:3000/api/mcp`
- **Transport:** Streamable HTTP (stateless, Web Standards)
- **Auth:** Supabase JWT in `Authorization: Bearer <token>` header
- **Protocol:** JSON-RPC 2.0 (per MCP spec)

---

## Tools Exposed

All tools are prefixed with `rs_` so they don't clash with other MCP
servers you might have connected.

### Read-only (all roles)

| Tool                         | What it does                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `rs_business_overview`       | Orientation snapshot — customers, quotes, jobs, invoices, recent activity      |
| `rs_list_customers`          | List customers with active-job counts                                          |
| `rs_get_customer`            | Full customer detail incl. BOM config, recent quotes/jobs/invoices, GMPs      |
| `rs_get_bom`                 | Full parsed BOM with all lines and M-Code assignments                          |
| `rs_search_components`       | Search the master component library                                            |
| `rs_classify_component`      | Run DB + PAR-rules M-Code classification on a single component                 |
| `rs_list_quotes`             | List quotes with filters                                                       |
| `rs_get_quote`               | Full quote detail with pricing breakdown                                       |
| `rs_list_jobs`               | List jobs with filters                                                         |
| `rs_get_job`                 | Full job detail with procurement + production events + status history          |
| `rs_get_procurement`         | Full PROC with line-by-line status and supplier POs                            |
| `rs_list_backorders`         | All lines on backorder across active procurements                              |
| `rs_get_production_status`   | Chronological production events for a job                                     |
| `rs_get_bg_stock`            | Bulk-goods stock from BG-flagged procurement lines                             |
| `rs_search`                  | Universal search across customers, quotes, jobs, invoices, components          |
| `rs_list_invoices`           | Invoice list with aging (ceo + ops)                                            |

### Write / financial (restricted)

| Tool                         | Allowed roles                            |
| ---------------------------- | ---------------------------------------- |
| `rs_update_job_status`       | ceo, operations_manager                  |
| `rs_log_production_event`    | ceo, operations_manager, shop_floor      |
| `rs_get_aging_report`        | ceo only                                 |
| `rs_get_profitability`       | ceo only                                 |

### Role matrix

- **ceo** → all tools
- **operations_manager** → everything except `rs_get_aging_report` and `rs_get_profitability`
- **shop_floor** → `rs_business_overview`, `rs_list_jobs`, `rs_get_job`, `rs_get_production_status`, `rs_log_production_event`, `rs_search`

---

## Getting a Supabase JWT

The MCP endpoint requires a Supabase access token from a user row in
`public.users`. Anas / Piyush / Hammad already have accounts. To grab a
token you can paste into Claude Desktop's config:

### Option A — Browser devtools (easiest)

1. Log into https://webapp-fawn-seven.vercel.app with your RS account.
2. Open DevTools → Application → Cookies → find the `sb-...-auth-token`
   cookie. The value is a JSON array; the first element is the
   `access_token`.
3. Copy the `access_token` — that's your Bearer token.

Note: Supabase access tokens expire (typically 1 hour). For long-lived
MCP access, generate a service token via the Supabase CLI or use the
refresh-token flow from a small helper script.

### Option B — supabase-js in a Node one-liner

```bash
node -e "
  const { createClient } = require('@supabase/supabase-js');
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  c.auth.signInWithPassword({ email: 'anas@rspcbassembly.com', password: '<PASSWORD>' })
    .then(r => console.log(r.data.session.access_token));
"
```

---

## Claude Desktop Setup

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) and
add the `rs-pcb-assembly` server:

```json
{
  "mcpServers": {
    "rs-pcb-assembly": {
      "url": "https://webapp-fawn-seven.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer PASTE_YOUR_SUPABASE_JWT_HERE"
      }
    }
  }
}
```

Restart Claude Desktop. You should see `rs-pcb-assembly` appear in the
MCP tools menu with all 20 tools listed.

Try these prompts to verify:

- _"Give me the RS business overview."_
- _"List all active RS customers."_
- _"Show me the details for customer TLAN."_
- _"What jobs are currently in production?"_
- _"Show the aging report."_ (ceo only)

---

## Testing with mcp-inspector

The official MCP inspector is the fastest way to smoke-test tools:

```bash
npx @modelcontextprotocol/inspector \
  --transport http \
  --url http://localhost:3000/api/mcp \
  --header "Authorization=Bearer $RS_MCP_TOKEN"
```

Inspector opens a web UI at http://localhost:5173 where you can list
tools, inspect their schemas, and invoke them with form inputs.

---

## Testing with curl (raw JSON-RPC)

The MCP protocol is JSON-RPC 2.0 over HTTP. A full init + list-tools
round-trip:

```bash
# 1. Initialize
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $RS_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "curl-test", "version": "0.0.1" }
    }
  }'

# 2. List tools
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $RS_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'

# 3. Call rs_business_overview
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $RS_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "rs_business_overview",
      "arguments": {}
    }
  }'
```

If init succeeds you'll get a response containing
`"serverInfo":{"name":"rs-pcb-assembly","version":"1.0.0"}`. If
`tools/list` returns only 6 tools instead of 20, you're authenticated
as `shop_floor` — that's expected.

---

## Files / Code Layout

- **`app/api/mcp/route.ts`** — the HTTP MCP endpoint. Parses the JWT,
  builds a fresh `McpServer` scoped to the user's role, hands the
  request to `WebStandardStreamableHTTPServerTransport`, and returns
  the MCP response.
- **`lib/mcp/server.ts`** — `buildMcpServerForRole(role)` — registers
  all 20 tools then removes the ones the role can't access.
- **`lib/mcp/auth.ts`** — Supabase JWT validation + role → allowed-tools
  mapping.
- **`lib/mcp/db.ts`** — service-role Supabase client used by tools
  (RLS is bypassed; access control is enforced in `auth.ts`).
- **`lib/mcp/tools/*.ts`** — the 20 MCP tools, grouped by domain
  (customers, boms, quotes, jobs, procurement, production, invoices,
  inventory, search, overview).

The `/api/mcp` streamable-HTTP endpoint is the **only** MCP server
the app ships. Claude Desktop, OpenClaw, mcp-inspector, and any other
MCP client should point at that URL with a Supabase JWT in the
`Authorization: Bearer <token>` header.

### History (removed 2026-04-15)

- **`erp-rs-mcp/`** — a standalone stdio MCP package that predated the
  in-app server. Its tool files drifted out of sync with `lib/mcp/tools/`
  and nothing was wired to it in the webapp. Deleted. If stdio access
  is needed locally, write a thin `stdin/stdout` wrapper around
  `/api/mcp` or re-introduce the package and mirror `lib/mcp/tools/`.
- **`app/api/mcp/classify/route.ts`** and **`app/api/mcp/overview/route.ts`** —
  legacy JSON-REST shims that predated the streamable HTTP transport.
  Comment in the old doc claimed these were "for backwards compatibility
  with the in-app Chat", but a grep of every TS file in the repo found
  zero callers — the chat route imports `classifyWithAI` directly from
  `lib/mcode/ai-classifier` and never hit these endpoints. Deleted.
