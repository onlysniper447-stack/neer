import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callVerify, type ClientOptions } from "./client.js";
import { ToolInputSchema, VERIFY_VERSION } from "./schema.js";

export const TOOL_NAME="verify_near_deposit";
export const TOOL_DESCRIPTION="Checks a NEAR Intents deposit (address, network, token, amount, memo) against its signed quote before funds are sent. Returns pass, warn, or block with reasons. Call this after getting a deposit address and before the user or agent sends funds. Does not sign or submit transactions.";
export function createServer(options:ClientOptions={}):McpServer {
 const server=new McpServer({name:"@neer/mcp-verify",version:VERIFY_VERSION},{maxToolInputElements:64});
 server.registerTool(TOOL_NAME,{description:TOOL_DESCRIPTION,inputSchema:ToolInputSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},async(args)=>callVerify(args,options));
 return server;
}
