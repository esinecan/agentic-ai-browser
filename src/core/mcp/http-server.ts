import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
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

/**
 * Starts an HTTP server for MCP (Model Context Protocol)
 */
export async function startMcpHttpServer(port: number = 3000): Promise<void> {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(bodyParser.json());
  
  // Health check route - define as a separate handler function
  const healthCheckHandler: RequestHandler = (req, res) => {
    res.json({ status: 'ok' });
  };  app.get('/health', healthCheckHandler);
  
  // Well-known MCP manifest endpoint for discovery
  app.get('/.well-known/mcp/manifest.json', (req, res) => {
    res.json(manifestData);
  });
  
  // Redirect for AI-plugin compatibility
  app.get('/.well-known/ai-plugin.json', (req, res) => {
    res.redirect('/.well-known/mcp/manifest.json');
  });
  
  // Root discovery endpoint
  app.get('/', (req, res) => {
    res.json({
      name: "agentic-browser",
      description: "MCP-compatible browser automation server",
      mcp_manifest: "/.well-known/mcp/manifest.json"
    });
  });
  
  // Add GET handler for /mcp endpoint for discovery
  app.get('/mcp', (req, res) => {
    res.json({
      name: "agentic-browser",
      version: "1.0.0",
      protocol: "mcp",
      description: "MCP-compatible browser automation server",
      documentation: "https://modelcontextprotocol.io"
    });
  });
  
  // MCP endpoint - define as a separate handler function
  const mcpHandler: RequestHandler = async (req, res) => {
    const jsonRpcRequest = req.body;
    
    // Basic JSON-RPC validation
    if (!jsonRpcRequest || jsonRpcRequest.jsonrpc !== '2.0' || !jsonRpcRequest.method) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: jsonRpcRequest?.id,
        error: {
          code: -32600,
          message: "Invalid Request"
        }
      });
      return;
    }
    
    try {
      logger.info(`MCP request received: ${jsonRpcRequest.method}`, { id: jsonRpcRequest.id });
      
      // Process methods
      if (jsonRpcRequest.method === 'initialize' || jsonRpcRequest.method === 'initialized') {
        // Handle initialization requests
        res.json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          result: {
            serverInfo: {
              name: "agentic-browser",
              version: "1.0.0"
            },
            capabilities: {
              tools: {}
            }
          }
        });
        return;
      }      else if (jsonRpcRequest.method === 'tools/describe') {
        const { name } = jsonRpcRequest.params;
        
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
      }      else if (jsonRpcRequest.method === 'tools/list') {
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
        const { name, arguments: args } = jsonRpcRequest.params;
        const ctx = getMcpContext();
        
        if (!ctx && name !== 'setGoal') {
          res.json({
            jsonrpc: '2.0',
            id: jsonRpcRequest.id,
            result: {
              isError: true,
              content: [{ type: "text", text: "Browser context not available. Please set a goal first." }]
            }
          });
          return;
        }
        
        let result;
        switch (name) {
          case "click":
            result = await handleClickAction(args);
            break;
          case "input":
            result = await handleInputAction(args);
            break;
          case "navigate":
            result = await handleNavigateAction(args);
            break;
          case "notes":
            result = await handleNotesAction(args);
            break;
          case "scroll":
            result = await handleScrollAction(args);
            break;
          case "getPageInfo":
            result = await handleGetPageInfoAction();
            break;
          case "setGoal":
            result = await handleSetGoalAction(args);
            break;
          default:
            res.json({
              jsonrpc: '2.0',
              id: jsonRpcRequest.id,
              result: {
                isError: true,
                content: [{ type: "text", text: `Unknown tool: ${name}` }]
              }
            });
            return;
        }
        
        res.json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          result
        });
        return;
      }
      else {
        res.json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          error: {
            code: -32601,
            message: "Method not found"
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
      return;
    }
  };
  app.post('/mcp', mcpHandler);
  
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