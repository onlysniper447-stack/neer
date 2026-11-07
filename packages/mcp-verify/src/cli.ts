#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { endpoint } from "./client.js";
import { createServer } from "./server.js";

try {
 const baseUrl=process.env.NEER_API_URL;
 endpoint(baseUrl); // Reject unsafe/malformed configuration before opening stdio.
 const server=createServer({baseUrl});
 await server.connect(new StdioServerTransport());
} catch {
 process.stderr.write("Neer MCP could not start.\n");
 process.exitCode=1;
}
