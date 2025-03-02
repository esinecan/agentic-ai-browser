import { launchBrowser, createPage, getPageState, verifyAction, GraphContext } from "./browserExecutor.js";
import { ollamaProcessor } from "./llmProcessorOllama.js";
import { generateNextAction as geminiGenerateNextAction } from "./llmProcessorGemini.js";
import { Page } from 'playwright';
import { Action } from './browserExecutor.js';
import { LLMProcessor } from './llmProcessor.js';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

const MAX_RETRIES = 3;
const MAX_REPEATED_ACTIONS = 3; // Number of repeated actions before forced change

// Create a proper LLMProcessor object for Gemini
const geminiProcessor: LLMProcessor = {
  generateNextAction: geminiGenerateNextAction
};

// Use our ollama processor by default, but allow for other implementations
const llmProcessor: LLMProcessor = process.env.LLM_PROVIDER === 'gemini' ? geminiProcessor : ollamaProcessor;

// Function to check if an action is redundant/repeated
function isRedundantAction(currentAction: Action, history: Action[]): boolean {
  if (history.length < 2) return false;
  
  // Get the last few actions for comparison
  const recentActions = history.slice(-MAX_REPEATED_ACTIONS);
  
  // Count occurrences of this action type and target
  let similarActionCount = 0;
  
  for (const pastAction of recentActions) {
    if (pastAction.type === currentAction.type) {
      // For extract and click, check if targeting the same element
      if ((currentAction.type === 'extract' || currentAction.type === 'click') && 
          pastAction.element === currentAction.element) {
        similarActionCount++;
      }
      // For input, check if targeting the same element with the same value
      else if (currentAction.type === 'input' && 
               pastAction.element === currentAction.element && 
               pastAction.value === currentAction.value) {
        similarActionCount++;
      }
      // For navigate, check if navigating to the same URL
      else if (currentAction.type === 'navigate' && pastAction.value === currentAction.value) {
        similarActionCount++;
      }
      // For wait, consider it repeated if just repeated waits
      else if (currentAction.type === 'wait') {
        similarActionCount++;
      }
    }
  }
  
  // If we've seen very similar actions multiple times in a row, consider it redundant
  return similarActionCount >= MAX_REPEATED_ACTIONS - 1;
}

// Generate feedback for the LLM based on action history
function generateActionFeedback(ctx: GraphContext): string {
  if (!ctx.actionHistory || ctx.actionHistory.length < 2) return "";
  
  const lastAction = ctx.actionHistory[ctx.actionHistory.length - 1];
  const previousActions = ctx.actionHistory.slice(-MAX_REPEATED_ACTIONS);
  
  // Check for repeated actions
  if (isRedundantAction(lastAction, previousActions)) {
    // Build a specific feedback message based on the action type
    if (lastAction.type === 'extract') {
      return `NOTICE: You've repeatedly tried to extract content from "${lastAction.element}". Please try a different element or action type.`;
    }
    else if (lastAction.type === 'click') {
      return `NOTICE: You've repeatedly tried to click "${lastAction.element}" without success. Try a different element or action type.`;
    }
    else if (lastAction.type === 'input') {
      return `NOTICE: You've repeatedly tried to input "${lastAction.value}" into "${lastAction.element}". Try a different field or value.`;
    }
    else if (lastAction.type === 'navigate') {
      return `NOTICE: You've repeatedly tried to navigate to "${lastAction.value}". Try a different URL or action type.`;
    }
    else if (lastAction.type === 'wait') {
      return `NOTICE: You've used multiple wait actions in succession. Try a more productive action now.`;
    }
    
    return `NOTICE: You seem to be repeating the same "${lastAction.type}" action. Please try something different.`;
  }
  
  return "";
}

// Create readline interface for user input
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Define our state functions in an object keyed by state name.
const states: { [key: string]: (ctx: GraphContext) => Promise<string> } = {
  start: async (ctx: GraphContext) => {
    ctx.history = [];
    ctx.actionHistory = []; // Track actions separately for redundancy detection
    ctx.startTime = Date.now();
    ctx.browser = await launchBrowser();
    ctx.page = await createPage(ctx.browser);
    ctx.history.push(`Navigated to initial URL: ${ctx.page.url()}`);
    return "chooseAction";
  },
  chooseAction: async (ctx: GraphContext) => {
    if (!ctx.page) throw new Error("Page not initialized");
    const stateSnapshot = await getPageState(ctx.page);
    
    // Add feedback about repeated actions to context for the LLM
    const actionFeedback = generateActionFeedback(ctx);
    if (actionFeedback) {
      ctx.actionFeedback = actionFeedback;
      console.log(actionFeedback); // Log feedback for debugging
    }
    
    const action = await llmProcessor.generateNextAction(stateSnapshot, ctx);
    
    if (!action) {
      ctx.history.push("Failed to generate a valid action.");
      return "handleFailure";
    }
    
    // Smart triggering for human help
    if (ctx.retries && ctx.retries >= 2) {
      // After 2 retries, consider asking for help
      const shouldAskHuman = Math.random() < 0.7; // 70% chance after repeated failures
      
      if (shouldAskHuman) {
        // Generate a question based on recent failures
        const failedActionType = ctx.actionHistory && ctx.actionHistory.length > 0 
          ? ctx.actionHistory[ctx.actionHistory.length - 1].type 
          : 'action';
        
        ctx.action = {
          type: 'askHuman',
          question: `I've tried ${ctx.retries} times to ${failedActionType} but keep failing. The page title is "${await ctx.page.title()}". What should I try next?`,
          selectorType: 'css',
          maxWait: 5000
        };
        
        ctx.history.push(`AI decided to ask for human help after ${ctx.retries} failures`);
        return "askHuman";
      }
    }
    
    // If this is a repeated redundant action, take evasive action
    if (ctx.actionHistory && ctx.actionHistory.length > 0 && 
        isRedundantAction(action, ctx.actionHistory)) {
      ctx.history.push(`Detected redundant action: ${JSON.stringify(action)}. Trying to break the loop.`);
      
      // Try a "wait" action to let the page settle if we're in a loop
      if (action.type !== 'wait') {
        ctx.action = { type: 'wait', maxWait: 2000, selectorType: 'css' };
        ctx.history.push(`Inserted wait action to break potential loop.`);
        return "wait";
      }
      // If we're already in a wait loop, try to ask human
      else if (action.type === 'wait') {
        ctx.action = {
          type: 'askHuman',
          question: `I seem to be stuck in a loop of waiting. The page title is "${await ctx.page.title()}". What should I try next?`,
          selectorType: 'css',
          maxWait: 5000
        };
        ctx.history.push(`AI decided to ask for human help to break out of wait loop`);
        return "askHuman";
      }
    }
    
    ctx.action = action;
    ctx.history.push(`Selected action: ${JSON.stringify(action)}`);
    
    // Record the action for redundancy detection
    if (!ctx.actionHistory) ctx.actionHistory = [];
    ctx.actionHistory.push(action);
    
    // Now handle possible capitalization differences
    const actionType = action.type.toLowerCase();
    
    // Check if the state exists first
    if (states[actionType]) {
      return actionType;
    } else {
      ctx.history.push(`Action type "${actionType}" not supported. Using fallback.`);
      return "handleFailure";
    }
  },
  
  // New state handler for askHuman action
  askHuman: async (ctx: GraphContext) => {
    if (!ctx.page || !ctx.action) throw new Error("Invalid context");
    
    try {
      // Store page state before human interaction
      const beforeHelpState = {
        url: ctx.page.url(),
        title: await ctx.page.title()
      };
      
      // Take a screenshot to show the current state
      const screenshotDir = process.env.SCREENSHOT_DIR || "./screenshots";
      const screenshotPath = path.join(screenshotDir, `human-help-${Date.now()}.png`);
      await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
      await ctx.page.screenshot({ path: screenshotPath });
      
      // Format the question with context
      const question = ctx.action.question || "What should I do next?";
      const formattedQuestion = `
AI needs your help (screenshot saved to ${screenshotPath}):

${question}

Current URL: ${ctx.page.url()}
Current task: ${ctx.userGoal}
Recent actions: ${ctx.history.slice(-3).join("\n")}

Your guidance:`;
      
      // Get human input
      const humanResponse = await promptUser(formattedQuestion);
      
      // Save the response to context for the LLM to use
      ctx.actionFeedback = `HUMAN ASSISTANCE: ${humanResponse}`;
      ctx.history.push(`Asked human for help: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`);
      ctx.history.push(`Human responded: "${humanResponse.substring(0, 50)}${humanResponse.length > 50 ? '...' : ''}"`);
      
      // After getting human response, check if page changed
      const currentUrl = ctx.page.url();
      if (currentUrl !== beforeHelpState.url) {
        ctx.history.push(`Note: Page changed during human interaction from "${beforeHelpState.url}" to "${currentUrl}"`);
        // Reset accumulated state since we're on a new page
        ctx.retries = 0;
      }
      
      // Reset retries since human helped
      ctx.retries = 0;
      
      return "chooseAction";
    } catch (error) {
      ctx.history.push(`Human interaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
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
  wait: async (ctx: GraphContext) => {
    // Implementation for the 'wait' state that the LLM sometimes tries to use
    try {
      const waitTime = ctx.action?.maxWait || 5000; // Default to 5000ms if not specified
      ctx.history.push(`Waiting for ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return "chooseAction";
    } catch (error) {
      ctx.history.push(`Wait failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  extract: async (ctx: GraphContext) => {
    // Basic implementation for extract state
    ctx.history.push(`Extract action received: ${JSON.stringify(ctx.action)}`);
    // Just continue to next action since we're handling content extraction
    return "chooseAction";
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
      // Handle undefined states gracefully instead of throwing an error
      const validStates = Object.keys(states).join(", ");
      console.warn(`State "${currentState}" is not defined in the state machine. Valid states are: ${validStates}`);
      ctx.history.push(`Encountered undefined state: "${currentState}". Falling back to chooseAction.`);
      currentState = "chooseAction";
    } else {
      currentState = await states[currentState](ctx);
    }
  }
}

// Exported function to run the entire automation graph.
export async function runGraph(): Promise<void> {
  // Prompt the user for their automation goal
  const userGoal = await promptUser("Please enter your goal for this automation: ");
  console.log(`Starting automation with goal: ${userGoal}`);
  
  // Initialize context with user goal and history
  const ctx: GraphContext = { 
    history: [],
    userGoal 
  };
  
  await runStateMachine(ctx);
}
