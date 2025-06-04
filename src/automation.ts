import { launchBrowser, createPage, getPageState, verifyAction, GraphContext, compressHistory, verifyElementExists, Action } from "./browserExecutor.js";
import { LLMProcessor } from './core/llm/llmProcessor.js';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { SuccessPatterns } from './successPatterns.js';
import { getAgentState } from './utils/agentState.js';
import logger from './utils/logger.js';

// Import new modular components
import { runStateMachine, states, registerState, isRedundantAction, generateActionFeedback, shuffleArray } from './core/automation/machine.js';
import { ContextManager } from './core/automation/context.js';
import { checkMilestones } from './core/automation/milestones.js';
import { detectProgress, PageState } from './core/automation/progress.js';

// Import action handlers from respective modules
import { clickHandler } from './core/action-handling/handlers/clickHandler.js';
import { inputHandler } from './core/action-handling/handlers/inputHandler.js';
import { navigateHandler } from './core/action-handling/handlers/navigateHandler.js';
import { waitHandler } from './core/action-handling/handlers/waitHandler.js';
import { handleFailureHandler } from './core/action-handling/handlers/failureHandler.js';
import { terminateHandler } from './core/action-handling/handlers/terminateHandler.js';
import { getPageStateHandler } from './core/action-handling/handlers/pageStateHandler.js';
import { notesHandler } from './core/action-handling/handlers/notesHandler.js';
import { scrollHandler } from './core/action-handling/handlers/scrollHandler.js';

// Add imports for user-defined functions
import { 
  processFunctionCall, 
  isUserFunctionCall, 
  isListFunctionsRequest,
  listAvailableFunctions 
} from './core/user-functions/functionParser.js';

// Lazy initialization of LLM processor
let llmProcessor: LLMProcessor | null = null;

async function getLLMProcessor(): Promise<LLMProcessor> {
  if (llmProcessor) return llmProcessor;
  
  switch(process.env.LLM_PROVIDER?.toLowerCase()) {
    case 'gemini':
      const { geminiProcessor } = await import("./core/llm/llmProcessorGemini.js");
      llmProcessor = geminiProcessor;
      break;
    case 'openai':
      const { openaiProcessor } = await import("./core/llm/llmProcessorOpenAI.js");
      llmProcessor = openaiProcessor;
      break;
    default:
      const { ollamaProcessor } = await import("./core/llm/llmProcessorOllama.js");
      llmProcessor = ollamaProcessor;
  }
  
  return llmProcessor;
}

// Store active readline interface for cleanup
let activeReadline: readline.Interface | null = null;

// Store global context for cleanup
let globalContext: GraphContext | null = null;

// Create readline interface for user input
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  activeReadline = rl;

  return new Promise((resolve) => {
    let isResolved = false;
    
    rl.question(question, (answer) => {
      if (!isResolved) {
        isResolved = true;
        activeReadline = null;
        rl.close();
        resolve(answer);
      }
    });
    
    // Handle readline being closed externally (e.g., by Ctrl+C)
    rl.on('close', () => {
      if (!isResolved) {
        isResolved = true;
        activeReadline = null;
        resolve('exit'); // Return 'exit' when readline is closed
      }
    });
  });
}

// Helper function to process user function calls
async function processUserFunctionCall(ctx: GraphContext, functionCall: string): Promise<string> {
  const expandedPrompt = await processFunctionCall(functionCall);
  
  if (expandedPrompt) {
    // Ask if the user wants to replace or prepend to the current goal
    const actionChoice = await promptUser(
      "Function detected. Do you want to:\n" +
      "1. Replace current goal with this function\n" +
      "2. Prepend to current goal\n" +
      "Enter 1 or 2: "
    );
    
    if (actionChoice === "1") {
      // Replace current goal
      ctx.userGoal = expandedPrompt;
      ctx.history.push(`User replaced goal with function: ${functionCall}`);
      logger.info('Replaced goal with user function', {
        original: functionCall,
        newGoalPreview: expandedPrompt.substring(0, 100) + (expandedPrompt.length > 100 ? '...' : '')
      });
    } else {
      // Prepend to current goal
      ctx.userGoal = `${expandedPrompt}\n\nAdditional context: ${ctx.userGoal}`;
      ctx.history.push(`User prepended function to goal: ${functionCall}`);
      logger.info('Prepended user function to goal', {
        original: functionCall,
        newGoalPreview: ctx.userGoal.substring(0, 100) + (ctx.userGoal.length > 100 ? '...' : '')
      });
    }
    
    // Reinitialize milestones for the new goal
    const { initializeMilestones } = await import('./core/automation/milestones.js');
    initializeMilestones(ctx);
    
    ctx.actionFeedback = `👤 FUNCTION ACTIVATED: ${functionCall} has been processed and goal updated.`;
  } else {
    // If function processing failed
    ctx.actionFeedback = `👤 FUNCTION ERROR: Failed to process "${functionCall}". Please check syntax and function name.`;
    ctx.history.push(`Failed to process function call: "${functionCall}"`);
  }
  
  return "chooseAction";
}

// Extract the sendHumanMessage handler to a standalone function
async function sendHumanMessageHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action) throw new Error("Invalid context");
  
  try {
    const beforeHelpState = {
      url: ctx.page.url(),
      title: await ctx.page.title()
    };
    
    const screenshotDir = process.env.SCREENSHOT_DIR || "./screenshots";
    const screenshotPath = path.join(screenshotDir, `human-help-${Date.now()}.png`);
    await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
    await ctx.page.screenshot({ path: screenshotPath });
    
    const question = ctx.action.question || 
      `I've tried ${ctx.retries} times but keep failing. The page title is "${await ctx.page.title()}". What should I try next?`;
    
    let pageInfo = "";
    try {
      pageInfo = await ctx.page.evaluate(() => {
        const mainContent = document.querySelector('main, article, #readme')?.textContent?.trim();
        return mainContent ? mainContent.substring(0, 2000) : document.title;
      });
    } catch (err) {
      logger.error("Failed to extract page context", err);
    }
    
    const formattedQuestion = `
Current URL: ${ctx.page.url()}
Current task: ${ctx.userGoal}
Recent actions: ${ctx.history.slice(-3).join("\n")}

AI needs your help (screenshot saved to ${screenshotPath}):
${question}

Tip: You can use ::functions to list available function templates.
Your guidance:`;
    
    logger.info("Asking for human help", {
      screenshot: screenshotPath,
      question,
      currentUrl: ctx.page.url(),
      task: ctx.userGoal
    });

    const humanResponse = await promptUser(formattedQuestion);
    
    // Handle special function commands
    if (isListFunctionsRequest(humanResponse)) {
      const functionsList = await listAvailableFunctions();
      logger.info('User requested function list');
      
      // Show functions and ask for further input
      const followupPrompt = `
Available User Functions:

${functionsList}

Enter a function call like ::functionName("arg1") or new instructions:`;
      
      const followupResponse = await promptUser(followupPrompt);
      
      if (followupResponse.trim()) {
        // Process the new input as if it was the original response
        if (isUserFunctionCall(followupResponse)) {
          return await processUserFunctionCall(ctx, followupResponse);
        } else {
          // Handle as regular input
          ctx.actionFeedback = `👤 HUMAN ASSISTANCE: ${followupResponse}`;
          ctx.history.push(`Human response: "${followupResponse.substring(0, 50)}${followupResponse.length > 50 ? '...' : ''}"`);
        }
      }
    }
    // Handle function calls
    else if (isUserFunctionCall(humanResponse)) {
      return await processUserFunctionCall(ctx, humanResponse);
    }
    // Handle regular input
    else {
      const newGoal = await promptUser("Do you want to update the goal? (Leave empty to keep current goal): ");
      if (newGoal.trim() !== "") {
        ctx.userGoal = newGoal;
        ctx.history.push(`User updated goal to: ${newGoal}`);
        // Use the extracted initializeMilestones function from the milestones module
        const { initializeMilestones } = await import('./core/automation/milestones.js');
        initializeMilestones(ctx);
      }

      logger.info("Received human response", {
        responsePreview: humanResponse.substring(0, 100)
      });
      
      ctx.actionFeedback = `👤 HUMAN ASSISTANCE: ${humanResponse}`;
      
      ctx.history.push(`Asked human: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`);
      ctx.history.push(`Human response: "${humanResponse.substring(0, 50)}${humanResponse.length > 50 ? '...' : ''}"`);
    }
    
    const currentUrl = ctx.page.url();
    if (currentUrl !== beforeHelpState.url) {
      ctx.history.push(`Note: Page changed during human interaction from "${beforeHelpState.url}" to "${currentUrl}"`);
      ctx.retries = 0;
    }
    
    ctx.retries = 0;
    
    return "chooseAction";
  } catch (error) {
    logger.error("Human interaction failed", error);
    ctx.history.push(`Human interaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return "handleFailure";
  }
}

// Fix the helper function's return type
function createSendHumanMessageAction(question: string): {
  type: "sendHumanMessage";
  question: string;
  selectorType: "css" | "text" | "xpath";
  maxWait: number;
} {
  return {
    type: 'sendHumanMessage' as const,  // Use 'as const' to ensure literal type
    question,
    selectorType: 'css' as const,
    maxWait: 1000
  };
}

// Register state handlers
registerState("start", async (ctx: GraphContext) => {
  logger.info('Starting automation session', {
    goal: ctx.userGoal,
    browser: {
      executable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: process.env.HEADLESS !== "false"
    }
  });

  ctx.history = [];
  ctx.actionHistory = [];
  ctx.startTime = Date.now();
  ctx.browser = await launchBrowser();
  ctx.page = await createPage(ctx.browser);
  
  logger.browser.action('navigation', {
    url: ctx.page.url(),
    timestamp: Date.now()
  });
  
  // Initialize tracking arrays
  ctx.successfulActions = [];
  ctx.lastActionSuccess = false;
  ctx.successCount = 0;
  ctx.previousPageState = null;
  
  // Reset agent state
  const agentState = getAgentState();
  agentState.clearStop();
  
  return "setupBrowser";
});

registerState("chooseAction", async (ctx: GraphContext) => {
  if (!ctx.page) {
    throw new Error("No page available");
  }
  
  logger.browser.action('getState', {
    url: ctx.page.url()
  });
  
  // Check if this is a repeated action
  let shouldShuffleElements = false;
  if (ctx.actionHistory && ctx.actionHistory.length >= 2) {
    const lastAction = ctx.actionHistory[ctx.actionHistory.length - 1];
    const secondLastAction = ctx.actionHistory[ctx.actionHistory.length - 2];
    
    // Compare actions to detect repetition
    if (lastAction.type === secondLastAction.type && 
        lastAction.element === secondLastAction.element) {
      shouldShuffleElements = true;
      logger.debug('Detected repeated action - will shuffle element ordering', {
        action: lastAction
      });
    }
  }
  
  try {
    const { PageAnalyzer } = await import("./core/page/analyzer.js");
    const domSnapshot = await PageAnalyzer.extractSnapshot(ctx.page);
    
    // Shuffle elements if needed to break repetition pattern
    if (shouldShuffleElements && domSnapshot.elements) {
      // Shuffle buttons
      if (domSnapshot.elements.buttons && domSnapshot.elements.buttons.length > 1) {
        domSnapshot.elements.buttons = shuffleArray([...domSnapshot.elements.buttons]);
      }
      
      // Shuffle links
      if (domSnapshot.elements.links && domSnapshot.elements.links.length > 1) {
        domSnapshot.elements.links = shuffleArray([...domSnapshot.elements.links]);
      }
      
      // Shuffle inputs
      if (domSnapshot.elements.inputs && domSnapshot.elements.inputs.length > 1) {
        domSnapshot.elements.inputs = shuffleArray([...domSnapshot.elements.inputs]);
      }
    }
    
    // Get page state
    const stateSnapshot = await getPageState(ctx.page);
  
    // Store state and update progress
    const agentState = getAgentState();
    agentState.setLastValidState(stateSnapshot);
    ctx.compressedHistory = compressHistory(ctx.history);
    
    // Use the extracted functions from our new modules
    // Cast stateSnapshot to PageState type to satisfy TypeScript
    detectProgress(ctx, ctx.previousPageState, stateSnapshot as PageState);
    checkMilestones(ctx, stateSnapshot);
    ctx.previousPageState = stateSnapshot;

    // Add feedback about repeated actions - using the extracted function
    const actionFeedback = generateActionFeedback(ctx);
    if (actionFeedback) {
      ctx.actionFeedback = actionFeedback;
    }

    // Get suggestions from success patterns
    if (ctx.page.url()) {
      try {
        const domain = new URL(ctx.page.url()).hostname;
        const successPatternsInstance = new SuccessPatterns();
        const domainSuggestions = successPatternsInstance.getSuggestionsForDomain(domain);
        
        if (domainSuggestions.length > 0) {
          logger.debug('Success pattern suggestions', {
            domain,
            suggestions: domainSuggestions
          });
          
          const suggestions = `💡 Tips based on previous successes:\n${domainSuggestions.join('\n')}`;
          ctx.actionFeedback = ctx.actionFeedback 
            ? ctx.actionFeedback + '\n\n' + suggestions
            : suggestions;
        }
      } catch (error) {
        logger.error('Error getting domain suggestions', error);
      }
    }

    const processor = await getLLMProcessor();
    const action = await processor.generateNextAction(stateSnapshot, ctx);
    
    if (!action) {
      logger.error('Failed to generate valid action');
      return "handleFailure";
    }

    logger.browser.action('nextAction', action);
    
    // Smart triggering for human help
    if (ctx.retries && ctx.retries >= 2) {
      const shouldSendHumanMessage = Math.random() < 0.7;
      
      if (shouldSendHumanMessage) {
        const failedActionType = ctx.actionHistory?.[ctx.actionHistory.length - 1]?.type || 'action';
        
        logger.info('Switching to human help', {
          retries: ctx.retries,
          lastFailedAction: failedActionType
        });
        
        ctx.action = createSendHumanMessageAction(`I've tried ${ctx.retries} times to ${failedActionType} but keep failing. The page title is "${await ctx.page.title()}". What should I try next?`);
        
        return "sendHumanMessage";
      }
    }

    // Check for redundant actions - using the extracted function
    if (ctx.actionHistory?.length && isRedundantAction(action, ctx.actionHistory)) {
      logger.warn('Detected redundant action', {
        action,
        recentActions: ctx.actionHistory.slice(-3)
      });

      if (action.type !== 'wait') {
        ctx.action = { type: 'wait', maxWait: 2000, selectorType: 'css' };
        return "wait";
      } else {
        ctx.action = createSendHumanMessageAction(`I seem to be stuck in a loop of waiting. The page title is "${await ctx.page.title()}". What should I try next?`);
        return "sendHumanMessage";
      }
    }

    ctx.action = action;
    if (action.type === 'navigate' && ctx.page) {
      action.previousUrl = ctx.page.url();
    }
    if (action.element) {
      ctx.lastSelector = action.element;
    }

    // Record action
    ctx.history.push(`Selected action: ${JSON.stringify(action)}`);
    if (!ctx.actionHistory) ctx.actionHistory = [];
    ctx.actionHistory.push(action);

    const actionType = action.type.toLowerCase();
    if (states[actionType] || states[action.type]) {
      return actionType;
    } else {
      logger.error('Unsupported action type', {
        type: actionType,
        supportedTypes: Object.keys(states)
      });
      return "handleFailure";
    }
  } catch (error) {
    logger.error('Error in chooseAction', error);
    return "handleFailure";
  }
});

// Use the extracted function for both cases
registerState("sendHumanMessage", sendHumanMessageHandler);
registerState("sendhumanmessage", sendHumanMessageHandler);

// Register action handlers that have been refactored into separate modules
registerState("click", clickHandler);
registerState("input", inputHandler);
registerState("navigate", navigateHandler);
registerState("wait", waitHandler);
registerState("handleFailure", handleFailureHandler);
registerState("terminate", terminateHandler);
registerState("getPageState", getPageStateHandler);
registerState("notes", notesHandler);
registerState("scroll", scrollHandler);

// Add this new state handler after the other state registrations

// New state to pause and allow user to set up browser before automation begins
registerState("setupBrowser", async (ctx: GraphContext) => {
  if (!ctx.page) {
    throw new Error("No page available");
  }
  
  const url = ctx.page.url();
  const title = await ctx.page.title();
  
  logger.info('Browser opened, waiting for user to complete setup', {
    url,
    title
  });
  
  // Prompt user to continue when ready
  const userInput = await promptUser(`
Browser is now open at: ${url}

You can now:
- Log into websites if needed
- Authorize any browser permissions
- Set up anything else required before automation begins

Press Enter when you're ready to continue automation, or type 'exit' to quit: `);
  
  // Check if user wants to exit
  if (userInput.toLowerCase() === 'exit') {
    logger.info('User requested to exit after browser launch');
    return "terminate";
  }
  
  logger.info('User completed setup, continuing with automation');
  return "chooseAction";
});

// Export states so they can be accessed externally (for intervention handling)
export { states };

// Rest of state handlers...
// ...existing code...

// Exported function to run the entire automation graph.
export async function runGraph(): Promise<void> {
  // Prompt the user for their automation goal
  const userGoalPrompt = "Please enter your goal for this automation:\n" +
    "(Tip: You can use ::functions to list available function templates)";
  const userGoal = await promptUser(userGoalPrompt);
  
  // Check if user wants to exit (e.g., from Ctrl+C)
  if (userGoal === 'exit') {
    logger.info('User requested exit during goal prompt');
    return;
  }
  
  // Check for special commands
  if (isListFunctionsRequest(userGoal)) {
    const functionsList = await listAvailableFunctions();
    console.log("\nAvailable User Functions:\n");
    console.log(functionsList);
    console.log("\n");
    // Ask again after showing functions
    return runGraph();
  }
  
  // Process initial goal for function calls
  let processedGoal = userGoal;
  if (isUserFunctionCall(userGoal)) {
    const expandedGoal = await processFunctionCall(userGoal);
    if (expandedGoal) {
      processedGoal = expandedGoal;
      logger.info('Expanded user function for initial goal', {
        original: userGoal,
        expandedPreview: expandedGoal.substring(0, 100) + (expandedGoal.length > 100 ? '...' : '')
      });
      console.log("\nFunction expanded successfully!\n");
    } else {
      console.log("\nFunction processing failed. Using original input.\n");
    }
  }
  
  // Initialize context with user goal and history
  const ctx: GraphContext = { 
    history: [],
    userGoal: processedGoal,
    successfulActions: [],
    lastActionSuccess: false,
    successCount: 0,
    milestones: [],
    recognizedMilestones: []
  };
  
  // Store context globally for cleanup
  globalContext = ctx;
  
  try {
    // Use the extracted runStateMachine function
    await runStateMachine(ctx);
  } finally {
    // Clear global context
    globalContext = null;
  }
}

// Add a new exported function to force stop the agent
export async function stopAgent(): Promise<void> {
  const agentState = getAgentState();
  agentState.requestStop();
  console.log("Stop request has been registered");
  
  // Close active readline if it exists
  if (activeReadline) {
    activeReadline.close();
    activeReadline = null;
  }
  
  // Close browser if it exists
  if (globalContext?.browser) {
    try {
      await globalContext.browser.close();
      logger.info('Browser closed during shutdown');
    } catch (error) {
      logger.error('Error closing browser during shutdown', error);
    }
  }
}