import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { GraphContext } from "../../browserExecutor.js";
import logger from "../../utils/logger.js";

export const toolDefs = {
  click: {
    desc: "Click an element",
    schema: z.object({ element: z.string(), description: z.string().optional() }),
    impl: async (ctx: GraphContext, a: any) => {
      logger.mcp.tool("click", a);
      ctx.action = { type: "click", element: a.element, description: a.description, selectorType: "css", maxWait: 2000 };
      const { clickHandler } = await import("../action-handling/handlers/clickHandler.js");
      return clickHandler(ctx);
    }
  },

  input: {
    desc: "Type text",
    schema: z.object({ element: z.string(), value: z.string(), description: z.string().optional() }),
    impl: async (ctx: GraphContext, a: any) => {
      logger.mcp.tool("input", a);
      ctx.action = { type: "input", element: a.element, value: a.value, description: a.description, selectorType: "css", maxWait: 2000 };
      const { inputHandler } = await import("../action-handling/handlers/inputHandler.js");
      return inputHandler(ctx);
    }
  },

  navigate: {
    desc: "Go to URL",
    schema: z.object({ url: z.string().url() }),
    impl: async (ctx: GraphContext, a: any) => {
      logger.mcp.tool("navigate", a);
      ctx.action = { type: "navigate", value: a.url, selectorType: "css", maxWait: 10000 };
      const { navigateHandler } = await import("../action-handling/handlers/navigateHandler.js");
      return navigateHandler(ctx);
    }
  },

  scroll: {
    desc: "Scroll page",
    schema: z.object({ direction: z.enum(["up", "down"]).default("down"), amount: z.number().optional() }),
    impl: async (ctx: GraphContext, a: any) => {
      logger.mcp.tool("scroll", a);
      ctx.action = { type: "scroll", direction: a.direction, amount: a.amount, selectorType: "css", maxWait: 1000 };
      const { scrollHandler } = await import("../action-handling/handlers/scrollHandler.js");
      return scrollHandler(ctx);
    }
  },

  notes: {
    desc: "Add or read notes",
    schema: z.object({ operation: z.enum(["add", "read"]), note: z.string().optional() }),
    impl: async (ctx: GraphContext, a: any) => {
      logger.mcp.tool("notes", a);
      ctx.action = { type: "notes", operation: a.operation, note: a.note, selectorType: "css", maxWait: 1000 };
      const { notesHandler } = await import("../action-handling/handlers/notesHandler.js");
      return notesHandler(ctx);
    }
  },

  getPageInfo: {
    desc: "Return page snapshot",
    schema: z.object({}),
    impl: async (ctx: GraphContext) => {
      logger.mcp.tool("getPageInfo");
      const { getPageState } = await import("../../browserExecutor.js");
      return getPageState(ctx.page!); // Add non-null assertion
    }
  },

  setGoal: {
    desc: "Replace automation goal",
    schema: z.object({ goal: z.string() }),
    impl: async (ctx: GraphContext, a: any) => {
      logger.mcp.tool("setGoal", a);
      ctx.userGoal = a.goal;
      ctx.history.push(`New goal set via MCP: ${a.goal}`);
      const { initializeMilestones } = await import("../automation/milestones.js");
      initializeMilestones(ctx);
      return { ok: true, message: `Goal updated to: ${a.goal}` }; // Provide more informative response
    }
  }
};

// helper for MCP list‑tools
export const listTools = () =>
  Object.entries(toolDefs).map(([name, d]) => ({
    name,
    description: d.desc,
    inputSchema: zodToJsonSchema(d.schema, { $refStrategy: "none" })
  }));
