import { launchBrowser, createPage, getPageState, verifyAction, GraphContext, compressHistory, verifyElementExists } from "./browserExecutor.js";
import { ollamaProcessor } from "./llmProcessorOllama.js";
import { geminiProcessor } from "./llmProcessorGemini.js";
import { Page } from 'playwright';
import { Action } from './browserExecutor.js';
import { LLMProcessor } from './llmProcessor.js';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { SuccessPatterns } from './successPatterns.js';
import { getAgentState } from './utils/agentState.js';
import logger from './utils/logger.js';

const MAX_RETRIES = 7;
const MAX_REPEATED_ACTIONS = 3; // Number of repeated actions before forced change

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
      // For click, check if targeting the same element
      if (currentAction.type === 'click' && 
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
    if (lastAction.type === 'click') {
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

// Initialize milestones based on the user goal
function initializeMilestones(ctx: GraphContext) {
  if (!ctx.milestones) {
    ctx.milestones = [];
    ctx.recognizedMilestones = [];
    
    // Example milestone detection based on common goals
    if (ctx.userGoal?.toLowerCase().includes('search')) {
      ctx.milestones.push(
        'reach_search_page',
        'enter_search_query',
        'submit_search',
        'review_search_results'
      );
    } else if (ctx.userGoal?.toLowerCase().includes('login') || ctx.userGoal?.toLowerCase().includes('sign in')) {
      ctx.milestones.push(
        'reach_login_page',
        'enter_credentials',
        'submit_login',
        'login_successful'
      );
    } else if (ctx.userGoal?.toLowerCase().includes('purchase') || ctx.userGoal?.toLowerCase().includes('buy')) {
      ctx.milestones.push(
        'find_product',
        'add_to_cart',
        'proceed_to_checkout',
        'enter_payment_info',
        'complete_purchase'
      );
    } else if (ctx.userGoal?.toLowerCase().includes('form')) {
      ctx.milestones.push(
        'find_form',
        'fill_form_fields',
        'submit_form',
        'form_submission_successful'
      );
    }
    
    // Add generic milestones for any goal
    ctx.milestones.push(
      'initial_navigation',
      'page_interaction',
      'goal_completion'
    );
  }
}

// Check for milestone completion after each page state update
function checkMilestones(ctx: GraphContext, state: any) {
  if (!ctx.milestones || !ctx.recognizedMilestones) return;
  
  // Check for search-related milestones
  if (ctx.milestones.includes('reach_search_page') && 
      !ctx.recognizedMilestones.includes('reach_search_page')) {
    
    if (state.url.includes('search') || 
        state.title.toLowerCase().includes('search') || 
        state.domSnapshot?.inputs?.some((input: any) => 
          typeof input === 'string' && 
          (input.includes('search') || input.includes('query'))
        )) {
      ctx.recognizedMilestones.push('reach_search_page');
      ctx.actionFeedback = `🏆 Milestone achieved: You've successfully reached the search page! Great job!`;
      //////console.log(ctx.actionFeedback);
    }
  }
  
  if (ctx.milestones.includes('enter_search_query') && 
      !ctx.recognizedMilestones.includes('enter_search_query') &&
      ctx.recognizedMilestones.includes('reach_search_page') &&
      ctx.action?.type === 'input') {
    
    ctx.recognizedMilestones.push('enter_search_query');
    ctx.actionFeedback = `🏆 Milestone achieved: You've entered a search query! Moving right along!`;
    //////console.log(ctx.actionFeedback);
  }
  
  if (ctx.milestones.includes('submit_search') && 
      !ctx.recognizedMilestones.includes('submit_search') &&
      ctx.recognizedMilestones.includes('enter_search_query') &&
      (ctx.action?.type === 'click' || ctx.action?.type === 'navigate')) {
    
    ctx.recognizedMilestones.push('submit_search');
    ctx.actionFeedback = `🏆 Milestone achieved: You've submitted your search! Let's see what we find!`;
    ////console.log(ctx.actionFeedback);
  }
  
  // Check for login-related milestones
  if (ctx.milestones.includes('reach_login_page') && 
      !ctx.recognizedMilestones.includes('reach_login_page')) {
    
    if (state.url.includes('login') || 
        state.url.includes('signin') ||
        state.title.toLowerCase().includes('login') || 
        state.title.toLowerCase().includes('sign in')) {
      
      ctx.recognizedMilestones.push('reach_login_page');
      ctx.actionFeedback = `🏆 Milestone achieved: You've successfully reached the login page!`;
      ////console.log(ctx.actionFeedback);
    }
  }
  
  // Check for generic milestones
  if (ctx.milestones.includes('initial_navigation') && 
      !ctx.recognizedMilestones.includes('initial_navigation')) {
    
    if (ctx.action?.type === 'navigate' || ctx.history.length > 3) {
      ctx.recognizedMilestones.push('initial_navigation');
      ctx.actionFeedback = `🏆 Milestone achieved: Initial navigation complete! You're on your way!`;
      ////console.log(ctx.actionFeedback);
    }
  }
  
  if (ctx.milestones.includes('page_interaction') && 
      !ctx.recognizedMilestones.includes('page_interaction')) {
    
    if ((ctx.action?.type === 'click' || ctx.action?.type === 'input') && ctx.lastActionSuccess) {
      ctx.recognizedMilestones.push('page_interaction');
      ctx.actionFeedback = `🏆 Milestone achieved: Successful page interaction! You're making progress!`;
      ////console.log(ctx.actionFeedback);
    }
  }
}

// Detect progress between page states
function detectProgress(ctx: GraphContext, previousState: any, currentState: any) {
  // No previous state to compare against
  if (!previousState) return;
  
  // Check for meaningful changes that indicate progress
  const indicators = [];
  
  // URL changed - significant progress
  if (previousState.url !== currentState.url) {
    indicators.push(`navigated from ${previousState.url} to ${currentState.url}`);
  }
  
  // Title changed - likely progress
  if (previousState.title !== currentState.title) {
    indicators.push(`page title changed from "${previousState.title}" to "${currentState.title}"`);
  }
  
  // New elements appeared
  const prevInputCount = previousState.domSnapshot?.inputs?.length || 0;
  const currentInputCount = currentState.domSnapshot?.inputs?.length || 0;
  if (currentInputCount > prevInputCount) {
    indicators.push(`new input fields appeared`);
  }
  
  // Check for new buttons
  const prevButtonCount = previousState.domSnapshot?.buttons?.length || 0;
  const currentButtonCount = currentState.domSnapshot?.buttons?.length || 0;
  if (currentButtonCount > prevButtonCount) {
    indicators.push(`new buttons appeared`);
  }
  
  // Check for new links
  const prevLinkCount = previousState.domSnapshot?.links?.length || 0;
  const currentLinkCount = currentState.domSnapshot?.links?.length || 0;
  if (currentLinkCount > prevLinkCount) {
    indicators.push(`new links appeared`);
  }
  
  if (indicators.length > 0) {
    ctx.actionFeedback = `🎉 Great progress! You've ${indicators.join(' and ')}. You're moving closer to the goal!`;
    ////console.log(ctx.actionFeedback);
  }
}

// Update type definition to include specific properties
interface PageState {
  url: string;
  title: string;
  domSnapshot: any;
}

// Extract the askHuman handler to a standalone function
async function askHumanHandler(ctx: GraphContext): Promise<string> {
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
        return mainContent ? mainContent.substring(0, 500) : document.title;
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

// Define our state functions in an object keyed by state name.
const states: { [key: string]: (ctx: GraphContext) => Promise<string> } = {
  start: async (ctx: GraphContext) => {
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
    
    // Initialize milestones
    initializeMilestones(ctx);
    
    // Reset agent state
    const agentState = getAgentState();
    agentState.clearStop();
    
    return "chooseAction";
  },

  chooseAction: async (ctx: GraphContext) => {
    logger.transition(`Transitioning to chooseAction`, {
      url: ctx.page?.url(),
      lastAction: ctx.action,
      metrics: {
        successCount: ctx.successCount,
        totalActions: ctx.actionHistory?.length,
        milestonesAchieved: ctx.recognizedMilestones?.length
      }
    });

    // Check for stop request
    const agentState = getAgentState();
    if (agentState.isStopRequested()) {
      logger.info('Stop requested by user');
      ctx.history.push("Stop requested by user");
      return "terminate";
    }

    if (!ctx.page) throw new Error("Page not initialized");
    const stateSnapshot = await getPageState(ctx.page);
    
    // Store state and update progress
    agentState.setLastValidState(stateSnapshot);
    ctx.compressedHistory = compressHistory(ctx.history);
    detectProgress(ctx, ctx.previousPageState, stateSnapshot);
    checkMilestones(ctx, stateSnapshot);
    ctx.previousPageState = stateSnapshot;

    // Add feedback about repeated actions
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
      const shouldAskHuman = Math.random() < 0.7;
      
      if (shouldAskHuman) {
        const failedActionType = ctx.actionHistory?.[ctx.actionHistory.length - 1]?.type || 'action';
        
        logger.info('Switching to human help', {
          retries: ctx.retries,
          lastFailedAction: failedActionType
        });
        
        ctx.action = {
          type: 'askHuman',
          question: `I've tried ${ctx.retries} times to ${failedActionType} but keep failing. The page title is "${await ctx.page.title()}". What should I try next?`,
          selectorType: 'css',
          maxWait: 5000
        };
        
        return "askHuman";
      }
    }

    // Check for redundant actions
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
          type: 'askHuman',
          question: `I seem to be stuck in a loop of waiting. The page title is "${await ctx.page.title()}". What should I try next?`,
          selectorType: 'css',
          maxWait: 5000
        };
        return "askHuman";
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

    // Verify element existence
    if (action.element && ['click', 'input'].includes(action.type.toLowerCase())) {
      try {
        logger.browser.action('elementCheck', {
          element: action.element,
          type: action.type
        });
        
        const elementCheck = await verifyElementExists(ctx.page, action.element, action.selectorType);
        
        if (!elementCheck.exists) {
          logger.warn('Element not found', {
            element: action.element,
            suggestion: elementCheck.suggestion
          });
          
          if (elementCheck.suggestion) {
            ctx.actionFeedback = `Element "${action.element}" not found. ${elementCheck.suggestion}`;
          }
          return "handleFailure";
        }
      } catch (error) {
        logger.error('Error verifying element existence', error);
      }
    }

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
  },

  // Use the extracted function for both cases
  askHuman: askHumanHandler,
  askhuman: askHumanHandler, // This is now valid since we're using a pre-defined function
  
  click: async (ctx: GraphContext) => {
    if (!ctx.page || !ctx.action) throw new Error("Invalid context");
    
    logger.browser.action('click', {
      element: ctx.action.element,
      url: ctx.page.url()
    });
    
    try {
      const { getElement } = await import("./browserExecutor.js");
      const elementHandle = await getElement(ctx.page, ctx.action);
      if (!elementHandle) throw new Error("Element not found");
      
      await elementHandle.click({ timeout: ctx.action.maxWait });
      const verified = await verifyAction(ctx.page, ctx.action);
      
      if (!verified) {
        throw new Error("Action verification failed after click");
      }

      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      
      const elementSelector = ctx.action.element;
      const description = ctx.action.description || elementSelector;
      ctx.successfulActions?.push(`click:${elementSelector}`);

      logger.info('Click successful', {
        element: description,
        successCount: ctx.successCount
      });

      try {
        const domain = new URL(ctx.page.url()).hostname;
        const successPatternsInstance = new SuccessPatterns();
        successPatternsInstance.recordSuccess(ctx.action, domain);
      } catch (error) {
        logger.error('Error recording success pattern', error);
      }

      return "getPageState";
    } catch (error) {
      logger.browser.error('click', {
        error,
        element: ctx.action.element
      });
      
      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
      return "handleFailure";
    }
  },
  input: async (ctx: GraphContext) => {
    if (!ctx.page || !ctx.action) throw new Error("Invalid context");

    logger.browser.action('input', {
      element: ctx.action.element,
      value: ctx.action.value,
      url: ctx.page.url()
    });

    try {
      const { getElement } = await import("./browserExecutor.js");
      const elementHandle = await getElement(ctx.page, ctx.action);
      if (!elementHandle) throw new Error("Element not found");
      
      await elementHandle.fill(ctx.action.value!, { timeout: ctx.action.maxWait });
      const verified = await verifyAction(ctx.page, ctx.action);
      
      if (!verified) throw new Error("Action verification failed after input");
      
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      const elementSelector = ctx.action.element;
      const value = ctx.action.value;
      const description = ctx.action.description || elementSelector;
      
      ctx.successfulActions?.push(`input:${elementSelector}`);
      
      ctx.actionFeedback = `✅ Successfully entered "${value}" into ${description}!` + 
        (ctx.successCount > 1 ? ` You're doing great! ${ctx.successCount} successful actions in a row.` : '');
      
      ctx.history.push(`Input '${ctx.action.value}' to ${ctx.action.element}`);
      
      try {
        const domain = new URL(ctx.page.url()).hostname;
        const successPatternsInstance = new SuccessPatterns();
        successPatternsInstance.recordSuccess(ctx.action, domain);
      } catch (error) {
        logger.error("Error recording success pattern", error);
      }
      
      logger.info("Input successful", {
        element: ctx.action.element,
        value: ctx.action.value,
        successCount: ctx.successCount
      });

      return "chooseAction";
    } catch (error) {
      logger.browser.error("input", {
        error,
        element: ctx.action.element,
        value: ctx.action.value
      });

      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
      ctx.history.push(`Input failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  navigate: async (ctx: GraphContext) => {
    if (!ctx.page || !ctx.action?.value) throw new Error("Invalid context");

    logger.browser.action('navigate', {
      url: ctx.action.value,
      currentUrl: ctx.page.url()
    });

    try {
      const url = new URL(ctx.action.value);
      await ctx.page.goto(url.toString(), { 
        timeout: 30000,
        waitUntil: "domcontentloaded"
      });
      
      const verified = await verifyAction(ctx.page, ctx.action);
      if (!verified) throw new Error("Action verification failed after navigation");
      
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      ctx.successfulActions?.push(`navigate:${url}`);
      
      ctx.actionFeedback = `✅ Successfully navigated to ${url}!` +
        (ctx.successCount > 1 ? ` You're on a roll with ${ctx.successCount} successful actions in a row!` : '');
      
      ctx.history.push(`Navigated to: ${url}`);
      
      try {
        const domain = url.hostname;
        const successPatternsInstance = new SuccessPatterns();
        successPatternsInstance.recordSuccess(ctx.action, domain);
      } catch (error) {
        logger.error("Error recording success pattern", error);
      }
      
      logger.info("Navigation successful", {
        url: ctx.action.value,
        successCount: ctx.successCount
      });

      return "chooseAction";
    } catch (error) {
      logger.browser.error("navigation", {
        error,
        url: ctx.action.value
      });

      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
      ctx.history.push(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  wait: async (ctx: GraphContext) => {
    const waitTime = ctx.action?.maxWait || 430000;

    logger.browser.action('wait', {
      duration: waitTime
    });

    try {
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      ctx.successfulActions?.push(`wait:${waitTime}ms`);
      
      ctx.actionFeedback = `✅ Successfully waited for ${waitTime}ms.` +
        (ctx.successCount > 1 ? ` You've had ${ctx.successCount} successful actions in a row.` : '');
      
      ctx.history.push(`Waiting for ${waitTime}ms`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));

      logger.info("Wait completed", {
        duration: waitTime,
        successCount: ctx.successCount
      });

      return "chooseAction";
    } catch (error) {
      logger.browser.error("wait", {
        error,
        duration: waitTime
      });

      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
      ctx.history.push(`Wait failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  handleFailure: async (ctx: GraphContext) => {
    logger.error('Action failure', {
      retries: ctx.retries,
      lastAction: ctx.action,
      url: ctx.page?.url()
    });

    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.retries = (ctx.retries || 0) + 1;

    if (ctx.retries > MAX_RETRIES) {
      logger.error('Max retries exceeded', {
        maxRetries: MAX_RETRIES,
        totalActions: ctx.actionHistory?.length
      });
      return "terminate";
    }

    // ...existing recovery logic with added logging...

    return "chooseAction";
  },
  terminate: async (ctx: GraphContext) => {
    logger.info('Terminating session', {
      metrics: {
        totalActions: ctx.actionHistory?.length,
        successfulActions: ctx.successfulActions?.length,
        duration: Date.now() - (ctx.startTime || Date.now())
      },
      milestones: ctx.recognizedMilestones
    });

    const agentState = getAgentState();
    agentState.clearStop();

    if (ctx.browser) {
      await ctx.browser.close();
    }
    return "terminated";
  },
  getPageState: async (ctx: GraphContext) => {
    if (!ctx.page) throw new Error("Page not initialized");
    
    logger.browser.action('getPageState', {
      url: ctx.page.url()
    });

    const stateSnapshot = await getPageState(ctx.page) as PageState;
    detectProgress(ctx, ctx.previousPageState, stateSnapshot);
    ctx.previousPageState = stateSnapshot;
    checkMilestones(ctx, stateSnapshot);
    
    return "chooseAction";
  },
};

// Update runStateMachine function with better logging
async function runStateMachine(ctx: GraphContext): Promise<void> {
  logger.info('Starting state machine', {
    goal: ctx.userGoal,
    browserConfig: {
      executable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: process.env.HEADLESS !== "false"
    }
  });

  let currentState: string = "start";
  let totalActionCount = 0;
  let successActionCount = 0;

  // Initialize arrays
  ctx.history = ctx.history || [];
  ctx.actionHistory = ctx.actionHistory || [];
  ctx.successfulActions = ctx.successfulActions || [];
  ctx.recognizedMilestones = ctx.recognizedMilestones || [];
  ctx.milestones = ctx.milestones || [];

  while (currentState !== "terminated") {
    const handler = states[currentState];
    if (!handler) {
      logger.error(`Unknown state: ${currentState}`, {
        availableStates: Object.keys(states)
      });
      break;
    }
    
    logger.info(`Executing state: ${currentState}`, {
      actionCount: totalActionCount,
      retries: ctx.retries || 0
    });

    try {
      totalActionCount++;
      if (ctx.lastActionSuccess) {
        successActionCount++;
      }
      
      // Execute the state handler and get the next state
      currentState = await handler(ctx);navigate to https://geopoliticaleconomy.com/ and there, you will see all sorts of news items, usually geopolitics related. Read all the natural language text on the page and then using askHuman function, give me a news briefing.
      
    } catch (error) {
      logger.error(`Error in state "${currentState}"`, error);
      currentState = "handleFailure";
    }
  }

  logger.info('State machine completed', {
    finalStats: {
      totalActions: totalActionCount,
      successfulActions: successActionCount,
      successRate: totalActionCount > 0 ? 
        `${((successActionCount / totalActionCount) * 100).toFixed(1)}%` : 
        "0%",
      completedMilestones: ctx.recognizedMilestones,
      duration: `${Math.round((Date.now() - (ctx.startTime || Date.now())) / 1000)}s`
    }
  });
}

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
  
  await runStateMachine(ctx);
}

// Add a new exported function to force stop the agent
export async function stopAgent(): Promise<void> {
  const agentState = getAgentState();
  agentState.requestStop();
  console.log("Stop request has been registered");
}

async function buildOptimizedContext(ctx: GraphContext): Promise<string> {
  let promptContext = "";
  
  // 1. Current goal (always include)
  promptContext += `Your current goal is: ${ctx.userGoal}\n\n`;
  
  // 2. Current page state (most important)
  promptContext += `Current page: ${ctx.page?.url() || "Unknown"}\n`;
  promptContext += `Page title: ${ctx.previousPageState?.title || "Unknown"}\n\n`;
  
  // 3. Interactive elements (filtered to most relevant)
  const MAX_ELEMENTS = 10;
  if (ctx.previousPageState?.interactiveElements) {
    promptContext += "Key interactive elements:\n";
    const elements = filterMostRelevantElements(ctx.previousPageState.interactiveElements, MAX_ELEMENTS);
    elements.forEach(el => {
      promptContext += `- ${el.type}: "${el.text || el.id || el.name}" ${el.selector ? `(${el.selector})` : ""}\n`;
    });
    promptContext += "\n";
  }
  
  // 4. Recent actions (compressed)
  if (ctx.history && ctx.history.length > 0) {
    const { compressHistory } = await import("./browserExecutor.js");
    const recentHistory = compressHistory(ctx.history, 5);
    promptContext += "Recent actions:\n";
    recentHistory.forEach(h => promptContext += `- ${h}\n`);
    promptContext += "\n";
  }
  
  // 5. Success/failure info (selective)
  if (ctx.lastActionSuccess !== undefined) {
    promptContext += ctx.lastActionSuccess 
      ? "✅ Last action was successful\n" 
      : "❌ Last action failed\n";
  }
  
  // Only include successful patterns if we recently had a failure
  if (!ctx.lastActionSuccess && ctx.page?.url()) {
    try {
      const domain = new URL(ctx.page.url()).hostname;
      const successPatternsInstance = new SuccessPatterns();
      const domainSuggestions = successPatternsInstance.getSuggestionsForDomain(domain);
      
      if (domainSuggestions.length > 0) {
        promptContext += "💡 Suggested approaches:\n";
        domainSuggestions.forEach(s => promptContext += `- ${s}\n`);
      }
    } catch (error) {
      console.error("Error getting domain suggestions:", error);
    }
  }
  
  return promptContext;
}

// Helper to filter elements by relevance
function filterMostRelevantElements(elements: any[], maxCount: number): any[] {
  // Prioritize buttons, links, and inputs
  const priorityElements = elements.filter(el => 
    el.type === 'button' || 
    el.type === 'link' || 
    el.type === 'input'
  );
  
  // If we have too many, prioritize ones with text
  if (priorityElements.length > maxCount) {
    return priorityElements
      .filter(el => el.text)
      .slice(0, maxCount);
  }
  
  return priorityElements.slice(0, maxCount);
}
