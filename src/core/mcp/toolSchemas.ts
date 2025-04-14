// Tool schema registry for MCP
import { z } from 'zod';

// Create a registry of all tool schemas
export const toolSchemas: Record<string, any> = {
  click: {
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
  input: {
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
  navigate: {
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
  notes: {
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
  scroll: {
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
  getPageInfo: {
    name: "getPageInfo",
    description: "Get current page information",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  setGoal: {
    name: "setGoal",
    description: "Set the automation goal",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "The goal for the browser automation"
        }
      },
      required: ["goal"]
    }
  }
};

// Create manifest data for the well-known endpoint
export const manifestData = {
  name: "agentic-browser",
  version: "1.0.0",
  protocol: "mcp",
  description: "MCP-compatible browser automation server",
  capabilities: {
    tools: Object.values(toolSchemas)
  },
  documentation: "https://modelcontextprotocol.io",
  transport: {
    http: {
      endpoint: "/mcp"
    }
  }
};
