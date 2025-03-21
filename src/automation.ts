import { launchBrowser, createPage, getPageState, verifyAction, GraphContext, compressHistory, verifyElementExists, Action } from "./browserExecutor.js";
import { ollamaProcessor } from "./core/llm/llmProcessorOllama.js";
import { geminiProcessor } from "./core/llm/llmProcessorGemini.js";
import { openaiProcessor } from "./core/llm/llmProcessorOpenAI.js";
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

// Select LLM processor based on environment variable
let llmProcessor: LLMProcessor;
switch(process.env.LLM_PROVIDER?.toLowerCase()) {
  case 'gemini':
    llmProcessor = geminiProcessor;
    break;
  case 'openai':
    llmProcessor = openaiProcessor;
    break;
  default:
    llmProcessor = ollamaProcessor;
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
AI needs your help (screenshot saved to ${screenshotPath}):

${question}

Current URL: ${ctx.page.url()}
Current task: ${ctx.userGoal}
Recent actions: ${ctx.history.slice(-3).join("\n")}
${pageInfo ? `\nPage context: ${pageInfo}...\n` : ''}

Your guidance:`;
    
    logger.info("Asking for human help", {
      screenshot: screenshotPath,
      question,
      currentUrl: ctx.page.url(),
      task: ctx.userGoal
    });

    const humanResponse = await promptUser(formattedQuestion);
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
  
  return "chooseAction";
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

    const action = await llmProcessor.generateNextAction(stateSnapshot, ctx);
    
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
        
        ctx.action = {
          type: 'sendHumanMessage',
          question: `I've tried ${ctx.retries} times to ${failedActionType} but keep failing. The page title is "${await ctx.page.title()}". What should I try next?`,
          selectorType: 'css',
          maxWait: 1000
        };
        
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
        ctx.action = {
          type: 'sendHumanMessage',
          question: `I seem to be stuck in a loop of waiting. The page title is "${await ctx.page.title()}". What should I try next?`,
          selectorType: 'css',
          maxWait: 1000
        };
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

// Rest of state handlers...
// ...existing code...

// Exported function to run the entire automation graph.
export async function runGraph(): Promise<void> {
  // Prompt the user for their automation goal
  const userGoal = await promptUser("Please enter your goal for this automation: ");
  
  // Initialize context with user goal and history
  const ctx: GraphContext = { 
    history: [],
    userGoal,
    successfulActions: [],
    lastActionSuccess: false,
    successCount: 0,
    milestones: [],
    recognizedMilestones: []
  };
  
  // Use the extracted runStateMachine function
  await runStateMachine(ctx);
}

// Add a new exported function to force stop the agent
export async function stopAgent(): Promise<void> {
  const agentState = getAgentState();
  agentState.requestStop();
  console.log("Stop request has been registered");
}
