import express, { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { listTools, toolDefs } from "./tools.js";
import type { GraphContext } from "../../browserExecutor.js";
import logger from "../../utils/logger.js";
import { z } from "zod"; // Import z

let ctx: GraphContext;
export const setCtx = (c: GraphContext) => {
  if (ctx !== c) {
    ctx = c;
  }
};

const transports: Record<string, SSEServerTransport> = {};

// Define Zod schemas for MCP requests
const ToolsListRequestSchema = z.object({ method: z.literal("tools/list") });
const ToolsCallRequestSchema = z.object({ method: z.literal("tools/call"), params: z.object({ name: z.string(), arguments: z.any() }) });

function buildServer() {
  const s = new Server({ name: "agentic-browser", version: "1.0.0" }, { capabilities: { tools: { listChanged: true } } });

  // Corrected: Use Zod object schema for the first argument
  s.setRequestHandler(ToolsListRequestSchema, async (request) => { // Handler receives validated object
    logger.mcp.server("Handling tools/list request");
    return { tools: listTools() };
  });

  // Corrected: Use Zod object schema for the first argument
  s.setRequestHandler(ToolsCallRequestSchema, async (request) => { // Handler receives validated object
    const { params } = request; // params is now guaranteed by schema
    const { name, arguments: args } = params;
    logger.mcp.server(`Handling tools/call request: ${name}`, { args });

    if (!ctx) {
      logger.mcp.error("MCP Context (ctx) is not set. Cannot call tool.");
      return { isError: true, content: [{ type: "text", text: "Agent context not initialized yet." }] };
    }
    
    if (!ctx.page) {
      logger.mcp.error("MCP Context page is not set. Cannot call tool.");
      return { isError: true, content: [{ type: "text", text: "Agent page not initialized yet." }] };
    }

    const t = (toolDefs as any)[name]; 
    if (!t) {
      logger.mcp.error(`Unknown tool called: ${name}`);
      return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] }; 
    }
    try {
      // Arguments are already validated by the handler's schema, but re-parsing here for explicit type narrowing if needed
      const validatedArgs = t.schema.parse(args); // This might be redundant depending on SDK implementation
      const res = await t.impl(ctx, validatedArgs);
      logger.mcp.server(`Tool call successful: ${name}`, { result: res });
      let resultText = "Action completed.";
      try {
        resultText = JSON.stringify(res ?? { ok: true });
      } catch (e) {
        logger.mcp.error(`Failed to stringify tool result for ${name}`, { error: e, result: res });
        resultText = JSON.stringify({ ok: false, error: "Failed to stringify result" });
      }
      return { content: [{ type: "text", text: resultText }] };
    } catch (e: any) {
      logger.mcp.error(`Tool call failed: ${name}`, { error: e });
      let errorMessage = e.message || String(e);
      if (e instanceof z.ZodError) {
        errorMessage = `Invalid arguments for tool ${name}: ${e.errors.map(err => `${err.path.join('.')} - ${err.message}`).join('; ')}`;
      }
      return { isError: true, content: [{ type: "text", text: errorMessage }] };
    }
  });

  return s;
}

export async function startMcp(port = 3000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const app = express();
      const srv = buildServer();

      app.get("/", (req: Request, res: Response) => {
        res.json({ ok: true, mcp: "/mcp" });
      });

      app.get("/mcp", async (req: Request, res: Response) => {
        try {
          const tr = new SSEServerTransport("/mcp/message", res);
          transports[tr.sessionId] = tr;
          logger.mcp.server(`New MCP connection: ${tr.sessionId}`, { remoteAddress: req.ip });
          res.on("close", () => {
            logger.mcp.server(`MCP connection closed: ${tr.sessionId}`);
            delete transports[tr.sessionId];
          });
          await srv.connect(tr);
        } catch (error) {
          logger.mcp.error("Error handling /mcp GET request", { error });
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to establish MCP connection" });
          }
        }
      });

      app.use(express.json()); 
      app.post("/mcp/message", async (req: Request, res: Response): Promise<void> => {
        const sessionId = req.query.sessionId as string;
        const tr = transports[sessionId];
        if (!tr) {
          logger.mcp.warn(`Session not found for incoming message: ${sessionId}`);
          res.status(404).json({ error: "session not found" });
        }
        try {
          await tr.handlePostMessage(req, res);
        } catch (error) {
          logger.mcp.error(`Error handling /mcp/message POST for session ${sessionId}`, { error });
        }
      });

      const serverInstance = app.listen(port, () => {
        logger.mcp.info(`MCP Server ready at http://localhost:${port}/mcp`);
        resolve();
      });

      serverInstance.on('error', (err: any) => {
        logger.mcp.error('MCP server failed to start', { error: err });
        reject(err);
      });

    } catch (err: any) { 
      logger.mcp.error('Failed to initialize MCP server setup', { error: err });
      reject(err);
    }
  });
}
