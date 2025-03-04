import { launchBrowser, createPage, getPageState, verifyAction, GraphContext, compressHistory, verifyElementExists } from "./browserExecutor.js";
import { ollamaProcessor } from "./llmProcessorOllama.js";
import { generateNextAction as geminiGenerateNextAction } from "./llmProcessorGemini.js";
import { Page } from 'playwright';
import { Action } from './browserExecutor.js';
import { LLMProcessor } from './llmProcessor.js';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { SuccessPatterns } from './successPatterns.js';
import { generatePageSummary, extractInteractiveElements } from './pageInterpreter.js';
import { getAgentState } from './utils/agentState.js';

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

// Define our state functions in an object keyed by state name.
const states: { [key: string]: (ctx: GraphContext) => Promise<string> } = {
  start: async (ctx: GraphContext) => {
    ctx.history = [];
    ctx.actionHistory = []; // Track actions separately for redundancy detection
    ctx.startTime = Date.now();
    ctx.browser = await launchBrowser();
    ctx.page = await createPage(ctx.browser);
    ctx.history.push(`Navigated to initial URL: ${ctx.page.url()}`);
    
    // Initialize success tracking
    ctx.successfulActions = [];
    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.previousPageState = null;
    
    // Initialize milestones
    initializeMilestones(ctx);
    
    // Reset the agent state
    const agentState = getAgentState();
    agentState.clearStop();
    
    return "chooseAction";
  },
  chooseAction: async (ctx: GraphContext) => {
    // First check for stop request
    const agentState = getAgentState();
    if (agentState.isStopRequested()) {
      ctx.history.push("Stop requested by user");
      return "terminate";
    }
    
    if (!ctx.page) throw new Error("Page not initialized");
    const stateSnapshot = await getPageState(ctx.page) as PageState;
    
    // Store the current valid state in the AgentState
    agentState.setLastValidState(stateSnapshot);
    
    // Get AI-generated page summary
    try {
      ctx.pageSummary = await generatePageSummary(stateSnapshot.domSnapshot);
      
      // Get interactive elements
      ctx.interactiveElements = extractInteractiveElements(stateSnapshot.domSnapshot);
    } catch (error) {
      console.error("Error generating page summary:", error);
    }
    
    // Compress history for better context
    ctx.compressedHistory = compressHistory(ctx.history);
    
    // Detect progress between states
    detectProgress(ctx, ctx.previousPageState, stateSnapshot);
    
    // Check for milestone achievements
    checkMilestones(ctx, stateSnapshot);
    
    // Store current state for future comparison
    ctx.previousPageState = stateSnapshot;
    
    // Add feedback about repeated actions to context for the LLM
    const actionFeedback = generateActionFeedback(ctx);
    if (actionFeedback) {
      ctx.actionFeedback = actionFeedback;
      //console.log(actionFeedback); // Log feedback for debugging
    }
    
    // Add suggestions from success patterns if we have them
    if (ctx.page.url()) {
      try {
        const domain = new URL(ctx.page.url()).hostname;
        const successPatternsInstance = new SuccessPatterns();
        const domainSuggestions = successPatternsInstance.getSuggestionsForDomain(domain);
        
        if (domainSuggestions.length > 0) {
          const suggestions = `💡 Tips based on previous successes:\n${domainSuggestions.join('\n')}`;
          //console.log(suggestions);
          
          if (ctx.actionFeedback) {
            ctx.actionFeedback += '\n\n' + suggestions;
          } else {
            ctx.actionFeedback = suggestions;
          }
        }
      } catch (error) {
        console.error("Error getting domain suggestions:", error);
      }
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
    
    // Store the last selector used for better error feedback
    if (action.element) {
      ctx.lastSelector = action.element;
    }
    
    ctx.history.push(`Selected action: ${JSON.stringify(action)}`);
    
    // Record the action for redundancy detection
    if (!ctx.actionHistory) ctx.actionHistory = [];
    ctx.actionHistory.push(action);
    
    // Now handle possible capitalization differences
    const actionType = action.type.toLowerCase();
    
    // Element existence verification before proceeding with element-based actions
    if (action.element && ['click', 'input'].includes(actionType)) {
      try {
        //console.log(`Verifying existence of element: ${action.element}`);
        const elementCheck = await verifyElementExists(ctx.page, action.element, action.selectorType);
        
        if (!elementCheck.exists) {
          ctx.history.push(`Element ${action.element} does not exist on the page.`);
          if (elementCheck.suggestion) {
            ctx.actionFeedback = `Element "${action.element}" not found. ${elementCheck.suggestion}`;
            ctx.history.push(elementCheck.suggestion);
          }
          return "handleFailure";
        } else {
          //console.log(`Element exists with ${elementCheck.count} instances on page`);
        }
      } catch (error) {
        console.error("Error verifying element existence:", error);
      }
    }
    
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
      
      // Use the question provided by the model or fall back to a default
      const question = ctx.action.question || 
        `I've tried ${ctx.retries} times but keep failing. The page title is "${await ctx.page.title()}". What should I try next?`;
      
      // Format the question with context
      const formattedQuestion = `
AI needs your help (screenshot saved to ${screenshotPath}):

${question}

Current URL: ${ctx.page.url()}
Current task: ${ctx.userGoal}
Recent actions: ${ctx.history.slice(-3).join("\n")}

Your guidance:`;
      
      // Get human input
      console.log("\n\n=== ASKING FOR HUMAN HELP ===");
      const humanResponse = await promptUser(formattedQuestion);
      console.log("=== RECEIVED HUMAN RESPONSE ===\n\n");
      
      // Save the response to context for the LLM to use - make it prominent in the feedback
      ctx.actionFeedback = `👤 HUMAN ASSISTANCE: ${humanResponse}`;
      
      // Add to history logs
      ctx.history.push(`Asked human: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`);
      ctx.history.push(`Human response: "${humanResponse.substring(0, 50)}${humanResponse.length > 50 ? '...' : ''}"`);
      
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
      const elementHandle = await getElement(ctx.page, ctx.action);
      if (!elementHandle) throw new Error("Element not found");
      await elementHandle.click({ timeout: ctx.action.maxWait });
      
      // Verify that the click had the intended effect.
      const verified = await verifyAction(ctx.page, ctx.action);
      if (!verified) throw new Error("Action verification failed after click");
      
      // Track success
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      const elementSelector = ctx.action.element;
      const description = ctx.action.description || elementSelector;
      
      // Store successful action
      ctx.successfulActions?.push(`click:${elementSelector}`);
      
      // Create tailored positive feedback
      let feedback = `✅ Successfully clicked on ${description}!`;
      
      // Add extra encouragement for consecutive successes
      if (ctx.successCount > 1) {
        feedback += ` Great work! You've had ${ctx.successCount} successful actions in a row.`;
      }
      
      // Add specific context about what changed as a result
      feedback += ` The page has responded to the click.`;
      
      ctx.actionFeedback = feedback;
      ctx.history.push(`Clicked ${description} successfully`);
      
      // Record success pattern
      try {
        const domain = new URL(ctx.page.url()).hostname;
        const successPatternsInstance = new SuccessPatterns();
        successPatternsInstance.recordSuccess(ctx.action, domain);
      } catch (error) {
        console.error("Error recording success pattern:", error);
      }
      
      return "getPageState";
    } catch (error) {
      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
      ctx.history.push(`Click failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  input: async (ctx: GraphContext) => {
    if (!ctx.page || !ctx.action) throw new Error("Invalid context");
    try {
      const { getElement } = await import("./browserExecutor.js");
      const elementHandle = await getElement(ctx.page, ctx.action);
      if (!elementHandle) throw new Error("Element not found");
      await elementHandle.fill(ctx.action.value!, { timeout: ctx.action.maxWait });
      
      // Verify that the input was correctly entered.
      const verified = await verifyAction(ctx.page, ctx.action);
      if (!verified) throw new Error("Action verification failed after input");
      
      // Track success
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      const elementSelector = ctx.action.element;
      const value = ctx.action.value;
      const description = ctx.action.description || elementSelector;
      
      // Store successful action
      ctx.successfulActions?.push(`input:${elementSelector}`);
      
      // Create tailored positive feedback
      let feedback = `✅ Successfully entered "${value}" into ${description}!`;
      
      // Add extra encouragement for consecutive successes
      if (ctx.successCount > 1) {
        feedback += ` You're doing great! ${ctx.successCount} successful actions in a row.`;
      }
      
      ctx.actionFeedback = feedback;
      ctx.history.push(`Input '${ctx.action.value}' to ${ctx.action.element}`);
      
      // Record success pattern
      try {
        const domain = new URL(ctx.page.url()).hostname;
        const successPatternsInstance = new SuccessPatterns();
        successPatternsInstance.recordSuccess(ctx.action, domain);
      } catch (error) {
        console.error("Error recording success pattern:", error);
      }
      
      return "chooseAction";
    } catch (error) {
      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
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
      
      // Track success
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      
      // Store successful action
      ctx.successfulActions?.push(`navigate:${url}`);
      
      // Create tailored positive feedback
      let feedback = `✅ Successfully navigated to ${url}!`;
      
      // Add extra encouragement for consecutive successes
      if (ctx.successCount > 1) {
        feedback += ` You're on a roll with ${ctx.successCount} successful actions in a row!`;
      }
      
      ctx.actionFeedback = feedback;
      ctx.history.push(`Navigated to: ${url}`);
      
      // Record success pattern
      try {
        const domain = url.hostname;
        const successPatternsInstance = new SuccessPatterns();
        successPatternsInstance.recordSuccess(ctx.action, domain);
      } catch (error) {
        console.error("Error recording success pattern:", error);
      }
      
      return "chooseAction";
    } catch (error) {
      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
      ctx.history.push(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  wait: async (ctx: GraphContext) => {
    // Implementation for the 'wait' state that the LLM sometimes tries to use
    try {
      const waitTime = ctx.action?.maxWait || 430000; // Default to 430000ms if not specified
      
      // Track success
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      
      // Store successful action
      ctx.successfulActions?.push(`wait:${waitTime}ms`);
      
      let feedback = `✅ Successfully waited for ${waitTime}ms.`;
      
      // Add extra encouragement for consecutive successes
      if (ctx.successCount > 1) {
        feedback += ` You've had ${ctx.successCount} successful actions in a row.`;
      }
      
      ctx.actionFeedback = feedback;
      ctx.history.push(`Waiting for ${waitTime}ms`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return "chooseAction";
    } catch (error) {
      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
      ctx.history.push(`Wait failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  extract: async (ctx: GraphContext) => {
    // Basic implementation for extract state
    try {
      // Track success
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      
      // Store successful action
      if (ctx.action?.element) {
        ctx.successfulActions?.push(`extract:${ctx.action.element}`);
      }
      
      let feedback = `✅ Successfully extracted content!`;
      
      // Add extra encouragement for consecutive successes
      if (ctx.successCount > 1) {
        feedback += ` Nice job! ${ctx.successCount} successful actions in a row.`;
      }
      
      ctx.actionFeedback = feedback;
      ctx.history.push(`Extract action received: ${JSON.stringify(ctx.action)}`);
      
      // Record success pattern if we have an element
      if (ctx.action?.element && ctx.page) {
        try {
          const domain = new URL(ctx.page.url()).hostname;
          const successPatternsInstance = new SuccessPatterns();
          successPatternsInstance.recordSuccess(ctx.action, domain);
        } catch (error) {
          console.error("Error recording success pattern:", error);
        }
      }
      
      return "chooseAction";
    } catch (error) {
      ctx.lastActionSuccess = false;
      ctx.successCount = 0;
      ctx.history.push(`Extract failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return "handleFailure";
    }
  },
  handleFailure: async (ctx: GraphContext) => {
    // Reset success tracking
    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    
    ctx.retries = (ctx.retries || 0) + 1;
    if (ctx.retries > MAX_RETRIES) {
      ctx.history.push("Max retries exceeded");
      return "terminate";
    }
    
    ctx.history.push(`Attempting recovery (${ctx.retries}/${MAX_RETRIES})`);
    
    // If this is an input action failing on a common text input selector, try with a textarea
    if (ctx.action?.type === 'input' && 
        (ctx.action.element === 'input[type=text]' || ctx.action.element === 'input[type="text"]')) {
      ctx.action.element = 'textarea';
      ctx.history.push(`Switching selector from input[type=text] to textarea for better search box compatibility`);
      return ctx.action.type;
    }
    
    // If this is a click action failing on a search button, try alternative selectors
    if (ctx.action?.type === 'click' && 
        (ctx.action.element?.toLowerCase().includes('search') || 
         ctx.action.description?.toLowerCase().includes('search'))) {
      // Try alternative search button selectors
      const searchButtonSelectors = [
        'button[type=submit]',
        '[role=button][aria-label*="search" i]',
        'button.search-button',
        'input[type=submit]',
        '[role=search] button'
      ];
      
      // Find one that exists
      if (ctx.page) {
        for (const selector of searchButtonSelectors) {
          try {
            const exists = await ctx.page.$(selector);
            if (exists) {
              ctx.action.element = selector;
              ctx.history.push(`Switching to alternative search button selector: ${selector}`);
              return ctx.action.type;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      }
    }
    
    // If we have a selector that failed, try to find a similar one
    if (ctx.action?.element && ctx.page) {
      const { findBestMatch } = await import("./browserExecutor.js");
      const match = await findBestMatch(ctx.page, ctx.action.element);
      if (match) {
        ctx.action.element = match;
        ctx.history.push(`Found similar element: ${match}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return ctx.action.type;
      } else {
        // If no match found, try verifyElementExists to get suggestions
        try {
          const elementCheck = await verifyElementExists(ctx.page, ctx.action.element, ctx.action.selectorType);
          if (elementCheck.suggestion) {
            ctx.actionFeedback = `Element "${ctx.action.element}" not found. ${elementCheck.suggestion}`;
            ctx.history.push(elementCheck.suggestion);
            
            // Extract the first suggested selector and try it directly
            const selectorMatch = elementCheck.suggestion.match(/Try instead: ([^,]+)/);
            if (selectorMatch && selectorMatch[1]) {
              ctx.action.element = selectorMatch[1].trim();
              ctx.history.push(`Trying suggested selector: ${ctx.action.element}`);
              return ctx.action.type;
            }
          }
        } catch (error) {
          console.error("Error finding alternative selectors:", error);
        }
      }
    }
    
    await ctx.page?.reload();
    return "chooseAction";
  },
  terminate: async (ctx: GraphContext) => {
    ctx.history.push("Session ended");
    
    // Clear the stop flag
    const agentState = getAgentState();
    agentState.clearStop();
    
    if (ctx.browser) {
      await ctx.browser.close();
    }
    return "terminated";
  },
  getPageState: async (ctx: GraphContext) => {
    // New state to transition after action success and capture updated page state
    if (!ctx.page) throw new Error("Page not initialized");
    
    const stateSnapshot = await getPageState(ctx.page) as PageState;
    
    // Check if the state has changed in a meaningful way
    detectProgress(ctx, ctx.previousPageState, stateSnapshot);
    
    // Store the current state for future comparison
    ctx.previousPageState = stateSnapshot;
    
    // Check for milestones
    checkMilestones(ctx, stateSnapshot);
    
    return "chooseAction";
  }
};

// A simple state-machine runner that loops until the state "terminated" is reached.
async function runStateMachine(ctx: GraphContext): Promise<void> {
  let currentState: string = "start";
  
  // Track overall progress
  let totalActionCount = 0;
  let successActionCount = 0;
  
  while (currentState !== "terminated") {
    // Check for stop request at the beginning of each cycle
    const agentState = getAgentState();
    if (agentState.isStopRequested()) {
      ctx.history.push("Stop requested by user during state machine execution");
      currentState = "terminate";
      continue;
    }
    
    // Store current valid state in case of emergency stop
    if (ctx.page) {
      try {
        const stateSnapshot = await getPageState(ctx.page);
        agentState.setLastValidState(stateSnapshot);
      } catch (error) {
        console.error("Failed to capture state for emergency stop handling:", error);
      }
    }
    
    if (!(currentState in states)) {
      // Handle undefined states gracefully instead of throwing an error
      const validStates = Object.keys(states).join(", ");
      console.warn(`State "${currentState}" is not defined in the state machine. Valid states are: ${validStates}`);
      ctx.history.push(`Encountered undefined state: "${currentState}". Falling back to chooseAction.`);
      currentState = "chooseAction";
    } else {
      // Update progress counters
      if (ctx.lastActionSuccess) {
        successActionCount++;
      }
      totalActionCount++;
      
      // Print progress bar every 5 actions
      if (totalActionCount % 5 === 0) {
        const successRate = (successActionCount / totalActionCount) * 100;
        const progressBar = '='.repeat(Math.floor(successRate / 10)) + '-'.repeat(10 - Math.floor(successRate / 10));
        
        if (successRate > 70) {
          //console.log(`🌟 You're doing great! Keep up the good work!`);
        }
      }
      
      currentState = await states[currentState](ctx);
    }
  }
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
