import { Server } from '@modelcontextprotocol/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk';
import logger from '../../utils/logger.js';
import { GraphContext } from '../../browserExecutor.js';
import { states } from '../automation/machine.js';
import { getAgentState } from '../../utils/agentState.js';

// Define types for MCP requests and responses
interface ToolCallRequest {
  method: string;
  params: {
    name: string;
    arguments: Record<string, any>;
  };
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
  server.setRequestHandler({
    method: "tools/list"
  }, async () => {
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
  server.setRequestHandler({
    method: "tools/call"
  }, async (request: ToolCallRequest) => {
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
    
    try {
      switch (name) {
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

// Tool handlers
async function handleClickAction(args: { element: string, description?: string }) {
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }

  // Use the existing state handler for click actions
  currentContext.action = {
    type: "click",
    element: args.element,
    description: args.description || "",
    selectorType: "css",
    maxWait: 2000
  };

  // Execute the action using the state machine
  const clickHandler = states["click"];
  if (!clickHandler) {
    throw new Error("Click handler not found in state machine");
  }
  
  // Execute the action and store the result
  const result = await clickHandler(currentContext);
  
  return {
    content: [
      {
        type: "text",
        text: `Clicked element: ${args.element}\nCurrent URL: ${currentContext.page.url()}`
      }
    ]
  };
}

async function handleInputAction(args: { element: string, value: string }) {
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }

  // Use the existing state handler for input actions
  currentContext.action = {
    type: "input",
    element: args.element,
    value: args.value,
    selectorType: "css",
    maxWait: 2000
  };

  // Execute the action using the state machine
  const inputHandler = states["input"];
  if (!inputHandler) {
    throw new Error("Input handler not found in state machine");
  }
  
  // Execute the action and store the result
  const result = await inputHandler(currentContext);
  
  return {
    content: [
      {
        type: "text",
        text: `Entered text into ${args.element}\nCurrent URL: ${currentContext.page.url()}`
      }
    ]
  };
}

async function handleNavigateAction(args: { value: string }) {
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }

  // Use the existing state handler for navigate actions
  currentContext.action = {
    type: "navigate",
    value: args.value,
    selectorType: "css",
    maxWait: 10000
  };

  // Execute the action using the state machine
  const navigateHandler = states["navigate"];
  if (!navigateHandler) {
    throw new Error("Navigate handler not found in state machine");
  }
  
  // Execute the action and store the result
  const result = await navigateHandler(currentContext);
  
  return {
    content: [
      {
        type: "text",
        text: `Navigated to ${args.value}\nCurrent URL: ${currentContext.page.url()}`
      }
    ]
  };
}

async function handleNotesAction(args: { operation: "add" | "read", note?: string }) {
  if (!currentContext) {
    throw new Error("Browser not initialized");
  }

  // Use the existing state handler for notes actions
  currentContext.action = {
    type: "notes",
    operation: args.operation,
    note: args.note || "",
    selectorType: "css",
    maxWait: 1000
  };

  // Execute the action using the state machine
  const notesHandler = states["notes"];
  if (!notesHandler) {
    throw new Error("Notes handler not found in state machine");
  }
  
  // Execute the action and store the result
  const result = await notesHandler(currentContext);
  
  return {
    content: [
      {
        type: "text",
        text: args.operation === "add" 
          ? `Added note: ${args.note}` 
          : `Notes: ${result}`
      }
    ]
  };
}

async function handleScrollAction(args: { direction: "up" | "down" }) {
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }

  // Use the existing state handler for scroll actions
  currentContext.action = {
    type: "scroll",
    direction: args.direction,
    selectorType: "css",
    maxWait: 2000
  };

  // Execute the action using the state machine
  const scrollHandler = states["scroll"];
  if (!scrollHandler) {
    throw new Error("Scroll handler not found in state machine");
  }
  
  // Execute the action and store the result
  const result = await scrollHandler(currentContext);
  
  return {
    content: [
      {
        type: "text",
        text: `Scrolled ${args.direction}\nCurrent URL: ${currentContext.page.url()}`
      }
    ]
  };
}

async function handleGetPageInfoAction() {
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }
  
  const url = await currentContext.page.url();
  const title = await currentContext.page.title();
  
  // Get key elements from the page
  const pageContent = currentContext.previousPageState?.content || "No content available";
  
  return {
    content: [
      {
        type: "text",
        text: `URL: ${url}\nTitle: ${title}\n\nPage Content:\n${pageContent.substring(0, 1000)}...`
      }
    ]
  };
}
