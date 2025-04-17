import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import { getMcpContext } from './server.js';
import {
  handleClickAction,
  handleInputAction,
  handleNavigateAction,
  handleNotesAction,
  handleScrollAction,
  handleGetPageInfoAction,
  handleSetGoalAction
} from './handlers.js';
import { manifestData, toolSchemas } from './toolSchemas.js';

// Track SSE clients with a Map to support multiple connections
const sseClients: Map<string, Response> = new Map();

/**
 * Broadcasts an event to all connected SSE clients
 */
export function broadcastSseEvent(eventType: string, data: any): void {
  const eventData = JSON.stringify({
    type: eventType,
    data,
    timestamp: new Date().toISOString()
  });

  sseClients.forEach((client) => {
    client.write(`data: ${eventData}\n\n`);
  });

  logger.debug(`SSE event broadcast: ${eventType}`, {
    clients: sseClients.size,
    dataType: typeof data
  });
}

/**
 * Starts an HTTP server for MCP (Model Context Protocol)
 */
export async function startMcpHttpServer(port: number = 3000): Promise<void> {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(bodyParser.json());

  // Health check route
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Well-known MCP manifest endpoint for discovery
  app.get('/.well-known/mcp/manifest.json', (req, res) => {
    res.json(manifestData);
  });

  // Redirect for AI-plugin compatibility
  app.get('/.well-known/ai-plugin.json', (req, res) => {
    res.redirect('/.well-known/mcp/manifest.json');
  });

  // Root discovery endpoint (optional)
  app.get('/', (req, res) => {
    res.json({
      name: 'agentic-browser',
      description: 'MCP-compatible browser automation server',
      mcp_manifest: '/.well-known/mcp/manifest.json'
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /mcp for SSE or fallback
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/mcp', (req, res) => {
    logger.info('GET /mcp request received', { headers: req.headers });

    // Check if client wants SSE
    if (req.headers.accept?.includes('text/event-stream')) {
      // SSE handshake
      const clientId = uuidv4();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Send initial SSE message
      res.write(`data: ${JSON.stringify({ type: 'connection', status: 'ready', clientId })}\n\n`);
      sseClients.set(clientId, res);
      logger.info(`SSE client connected: ${clientId}`);

      // Handle disconnect
      req.on('close', () => {
        sseClients.delete(clientId);
        logger.info(`SSE client disconnected: ${clientId}`);
      });

      // Keep-alive comment
      const keepAlive = setInterval(() => {
        if (sseClients.has(clientId)) {
          res.write(':\n\n'); // SSE comment
        } else {
          clearInterval(keepAlive);
        }
      }, 30000);

    } else {
      // Not an SSE request, just respond with a basic JSON message
      res.json({
        server: 'agentic-browser',
        message: 'SSE endpoint. Use Accept: text/event-stream for live events.'
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /mcp for JSON-RPC
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/mcp', async (req, res) => {
    const jsonRpcRequest = req.body;

    // Basic JSON-RPC validation
    if (!jsonRpcRequest || jsonRpcRequest.jsonrpc !== '2.0' || !jsonRpcRequest.method) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: jsonRpcRequest?.id,
        error: {
          code: -32600,
          message: 'Invalid Request'
        }
      });
      return;
    }

    logger.info(`MCP request received: ${jsonRpcRequest.method}`, { id: jsonRpcRequest.id });

    try {
      if (jsonRpcRequest.method === 'initialize' || jsonRpcRequest.method === 'initialized') {
        // Return an initialize result
        res.json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          result: {
            serverInfo: {
              name: 'agentic-browser',
              version: '1.0.0'
            },
            capabilities: {
              tools: {}
            }
          }
        });
        return;
      }

      else if (jsonRpcRequest.method === 'tools/describe') {
        const { name } = jsonRpcRequest.params || {};
        if (!name || !toolSchemas[name]) {
          res.json({
            jsonrpc: '2.0',
            id: jsonRpcRequest.id,
            error: {
              code: -32602,
              message: `Tool not found: ${name}`
            }
          });
          return;
        }

        res.json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          result: toolSchemas[name]
        });
        return;
      }

      else if (jsonRpcRequest.method === 'tools/list') {
        res.json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          result: {
            tools: Object.values(toolSchemas)
          }
        });
        return;
      }

      else if (jsonRpcRequest.method === 'tools/call') {
        const { name, arguments: args } = jsonRpcRequest.params || {};
        const ctx = getMcpContext();

        // If we require a "goal" or context to exist first
        if (!ctx && name !== 'setGoal') {
          res.json({
            jsonrpc: '2.0',
            id: jsonRpcRequest.id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: 'Browser context not available. Please set a goal first.'
                }
              ]
            }
          });
          return;
        }

        // Optional: SSE broadcast that a tool call was requested
        broadcastSseEvent('tool-request', {
          tool: name,
          requestId: jsonRpcRequest.id,
          args
        });

        let toolResult;
        switch (name) {
          case 'click':
            toolResult = await handleClickAction(args);
            break;
          case 'input':
            toolResult = await handleInputAction(args);
            break;
          case 'navigate':
            toolResult = await handleNavigateAction(args);
            break;
          case 'notes':
            toolResult = await handleNotesAction(args);
            break;
          case 'scroll':
            toolResult = await handleScrollAction(args);
            break;
          case 'getPageInfo':
            toolResult = await handleGetPageInfoAction();
            break;
          case 'setGoal':
            toolResult = await handleSetGoalAction(args);
            break;
          default:
            res.json({
              jsonrpc: '2.0',
              id: jsonRpcRequest.id,
              result: {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: `Unknown tool: ${name}`
                  }
                ]
              }
            });
            return;
        }

        // Optional: SSE broadcast that the tool call finished
        broadcastSseEvent('tool-result', {
          tool: name,
          requestId: jsonRpcRequest.id,
          result: toolResult
        });

        res.json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          result: toolResult
        });
        return;
      }

      else {
        // Unknown method
        res.json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        });
        return;
      }
    } catch (error) {
      logger.error('MCP request error', { error, method: jsonRpcRequest.method });
      res.json({
        jsonrpc: '2.0',
        id: jsonRpcRequest.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  });

  // Start server
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, () => {
        logger.info(`MCP HTTP server started on port ${port}`);
        resolve();
      });

      // Handle server errors
      server.on('error', (error) => {
        logger.error('MCP HTTP server error', { error });
        reject(error);
      });
    } catch (error) {
      logger.error('Failed to start MCP HTTP server', { error });
      reject(error);
    }
  });
}
