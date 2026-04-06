#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./server.js";

const server = new McpServer({
  name: "rs-pcb-assembly",
  version: "1.0.0",
});

// Register all 20 tools across 10 domain areas
registerAllTools(server);

// Connect via stdio transport (for Claude Code / local CLI use)
const transport = new StdioServerTransport();
await server.connect(transport);
