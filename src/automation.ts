import { launchBrowser, createPage, getPageState, verifyAction, GraphContext } from "./browserExecutor.js";
import { generateNextAction } from "./llmProcessorOllama.js";
import { Page, ElementHandle } from 'playwright';
import { Action, doRetry } from './browserExecutor.js';

const MAX_RETRIES = 3;

// Define our state functions in an object keyed by state name.
const states: { [key: string]: (ctx: GraphContext) => Promise<string> } = {
  start: async (ctx: GraphContext) => {
    ctx.history = [];
    ctx.startTime = Date.now();
    ctx.browser = await launchBrowser();
    ctx.page = await createPage(ctx.browser);
    ctx.history.push(`Navigated to initial URL: ${ctx.page.url()}`);
    return "chooseAction";
  },
  chooseAction: async (ctx: GraphContext) => {
    if (!ctx.page) throw new Error("Page not initialized");
    const stateSnapshot = await getPageState(ctx.page);
    const action = await generateNextAction(stateSnapshot, ctx);
    if (!action) {
      ctx.history.push("Failed to generate a valid action.");
      return "handleFailure";
    }
    ctx.action = action;
    ctx.history.push(`Selected action: ${JSON.stringify(action)}`);
    return action.type;
  },
  click: async (ctx: GraphContext) => {
    if (!ctx.page || !ctx.action) throw new Error("Invalid context");
    try {
      // Dynamically import getElement to avoid circular dependencies
      const { getElement } = await import("./browserExecutor.js");
      const element = await getElement(ctx.page, ctx.action);
      if (!element) throw new Error("Element not found");
      await element.click({ timeout: ctx.action.maxWait });
      // Verify that the click had the intended effect.
      const verified = await verifyAction(ctx.page, ctx.action);
      if (!verified) throw new Error("Action verification failed after click");
      ctx.history.push(`Clicked element: ${ctx.action.element}`);
      return "chooseAction";
    } catch (error) {
      ctx.history.push(`Click failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  input: async (ctx: GraphContext) => {
    if (!ctx.page || !ctx.action) throw new Error("Invalid context");
    try {
      const { getElement } = await import("./browserExecutor.js");
      const element = await getElement(ctx.page, ctx.action);
      if (!element) throw new Error("Element not found");
      await element.fill(ctx.action.value!, { timeout: ctx.action.maxWait });
      // Verify that the input was correctly entered.
      const verified = await verifyAction(ctx.page, ctx.action);
      if (!verified) throw new Error("Action verification failed after input");
      ctx.history.push(`Input '${ctx.action.value}' to ${ctx.action.element}`);
      return "chooseAction";
    } catch (error) {
      ctx.history.push(`Input failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  navigate: async (ctx: GraphContext) => {
    if (!ctx.page || !ctx.action?.value) throw new Error("Invalid context");
    try {
      const url = new URL(ctx.action.value);
      await ctx.page.goto(url.toString(), { 
        timeout: 30000,
        waitUntil: "domcontentloaded"
      });
      // Verify that navigation succeeded.
      const verified = await verifyAction(ctx.page, ctx.action);
      if (!verified) throw new Error("Action verification failed after navigation");
      ctx.history.push(`Navigated to: ${url}`);
      return "chooseAction";
    } catch (error) {
      ctx.history.push(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  handleFailure: async (ctx: GraphContext) => {
    ctx.retries = (ctx.retries || 0) + 1;
    if (ctx.retries > MAX_RETRIES) {
      ctx.history.push("Max retries exceeded");
      return "terminate";
    }
    ctx.history.push(`Attempting recovery (${ctx.retries}/${MAX_RETRIES})`);
    if (ctx.action?.element && ctx.page) {
      const { findBestMatch } = await import("./browserExecutor.js");
      const match = await findBestMatch(ctx.page, ctx.action.element);
      if (match) {
        ctx.action.element = match;
        ctx.history.push(`Found similar element: ${match}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return ctx.action.type;
      }
    }
    await ctx.page?.reload();
    return "chooseAction";
  },
  terminate: async (ctx: GraphContext) => {
    ctx.history.push("Session ended");
    console.log("Execution history:", ctx.history);
    if (ctx.browser) {
      await ctx.browser.close();
      console.log("Browser closed successfully");
    }
    return "terminated";
  },
};

// A simple state-machine runner that loops until the state "terminated" is reached.
async function runStateMachine(ctx: GraphContext): Promise<void> {
  let currentState: string = "start";
  while (currentState !== "terminated") {
    if (!(currentState in states)) {
      throw new Error(`State "${currentState}" is not defined in the state machine.`);
    }
    currentState = await states[currentState](ctx);
  }
}

// Exported function to run the entire automation graph.
export async function runGraph(): Promise<void> {
  const ctx: GraphContext = { history: [] };
  await runStateMachine(ctx);
}
