import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import logger from '../../utils/logger.js';
import { GraphContext } from '../../browserExecutor.js';
import { states } from '../automation/machine.js';
import { getAgentState } from '../../utils/agentState.js';
// Import all handlers from handlers.ts
import { 
  handleClickAction, 
  handleInputAction, 
  handleNavigateAction, 
  handleNotesAction, 
  handleScrollAction, 
  handleGetPageInfoAction,
  handleSetGoalAction
} from './handlers.js';

// Define types for MCP requests and responses
interface ToolCallRequest {
  params: {
    name: string;
    arguments?: Record<string, any>;
    _meta?: Record<string, any>;
  };
  method: string;
}

interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

let currentContext: GraphContext | null = null;
let mcpServer: Server | null = null;

/**
 * Gets the current browser context being used by the MCP server
 */
export function getMcpContext(): GraphContext | null {
  return currentContext;
}

/**
 * Updates the context used by the MCP server
 */
export function setMcpContext(ctx: GraphContext | null): void {
  currentContext = ctx;
}

/**
 * Initializes and starts the MCP server
 */
export async function startMcpServer(): Promise<void> {
  // Create and configure the MCP server
  mcpServer = new Server({
    name: "browser-agent",
    version: "1.0.0"
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Register tool handlers
  registerTools(mcpServer);

  // Connect with stdio transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  logger.info('MCP server started');
}

/**
 * Register available tools with the MCP server
 */
function registerTools(server: Server): void {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "click",
          description: "Click an element on the page",
          inputSchema: {
            type: "object",
            properties: {
              element: {
                type: "string",
                description: "CSS selector or descriptive text of the element to click"
              },
              description: {
                type: "string",
                description: "Why you're clicking this element"
              }
            },
            required: ["element"]
          }
        },
        {
          name: "input",
          description: "Enter text into an input field",
          inputSchema: {
            type: "object",
            properties: {
              element: {
                type: "string",
                description: "CSS selector of the input field" 
              },
              value: {
                type: "string",
                description: "Text to enter"
              }
            },
            required: ["element", "value"]
          }
        },
        {
          name: "navigate",
          description: "Navigate to a URL",
          inputSchema: {
            type: "object",
            properties: {
              value: {
                type: "string", 
                description: "URL to navigate to"
              }
            },
            required: ["value"]
          }
        },
        {
          name: "notes",
          description: "Add or read notes",
          inputSchema: {
            type: "object",
            properties: {
              operation: {
                type: "string",
                enum: ["add", "read"],
                description: "Operation to perform on notes"
              },
              note: {
                type: "string",
                description: "Note text to add (required for add operation)"
              }
            },
            required: ["operation"]
          }
        },
        {
          name: "scroll",
          description: "Scroll the page",
          inputSchema: {
            type: "object",
            properties: {
              direction: {
                type: "string",
                enum: ["up", "down"],
                description: "Direction to scroll"
              }
            },
            required: ["direction"]
          }
        },
        {
          name: "getPageInfo",
          description: "Get current page information",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    };
  });
  
  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request: ToolCallRequest) => {
    if (!currentContext) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Error: Browser context not available. Make sure the browser is initialized."
          }
        ]
      };
    }

    const { name, arguments: args } = request.params;
    
    try {      switch (name) {
        case "click":
          return await handleClickAction(args as any);
        case "input":
          return await handleInputAction(args as any);
        case "navigate":
          return await handleNavigateAction(args as any);
        case "notes":
          return await handleNotesAction(args as any);
        case "scroll":
          return await handleScrollAction(args as any);
        case "getPageInfo":
          return await handleGetPageInfoAction();
        case "setGoal":
          return await handleSetGoalAction(args as any);
        default:
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: Unknown tool: ${name}`
              }
            ]
          };
      }
    } catch (error) {
      logger.error(`MCP tool execution error: ${name}`, { error });
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  });
}

// All handler implementations have been moved to handlers.ts
// No duplicate implementations here