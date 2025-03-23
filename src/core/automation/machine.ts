import { GraphContext, Action } from '../../browserExecutor.js';
import logger from '../../utils/logger.js';
import { getAgentState } from '../../utils/agentState.js';
import { ContextManager } from './context.js';
import { checkMilestones } from './milestones.js';
import { detectProgress } from './progress.js';

// Type definition for state handlers
export type StateHandler = (ctx: GraphContext) => Promise<string>;

// Maximum allowed retries before giving up
export const MAX_RETRIES = 7;

// Maximum number of repeated actions before forcing a change
export const MAX_REPEATED_ACTIONS = 3;

// Create a mapping of state names to their handler functions
export const states: Record<string, StateHandler> = {};

// Export the function that runs the state machine
export async function runStateMachine(ctx: GraphContext): Promise<void> {
  logger.info('Starting state machine', {
    goal: ctx.userGoal,
    browserConfig: {
      executable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: process.env.HEADLESS !== "false"
    }
  });

  // Initialize the context with default values if needed
  const contextManager = new ContextManager();
  ctx = contextManager.initializeContext(ctx);

  let currentState: string = "start";
  let totalActionCount = 0;
  let successActionCount = 0;

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

    logger.debug('State context', { 
      url: ctx.page?.url(), 
      goal: ctx.userGoal?.substring(0, 100) + '...'
    });

    try {
      totalActionCount++;
      if (ctx.lastActionSuccess) {
        successActionCount++;
      }
      
      // Execute the state handler and get the next state
      currentState = await handler(ctx);
      
      // Check if the agent has been requested to stop
      const agentState = getAgentState();
      if (agentState.isStopRequested()) {
        logger.info('Stop requested, terminating state machine');
        currentState = 'terminate';
      }
      
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

// Function to check if an action is redundant/repeated
export function isRedundantAction(currentAction: Action, history: Action[]): boolean {
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
export function generateActionFeedback(ctx: GraphContext): string {
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

/**
 * Register a state handler in the state machine
 */
export function registerState(name: string, handler: StateHandler): void {
  states[name] = handler;
}

/**
 * Fisher-Yates shuffle algorithm to randomize array elements
 * Used to prevent getting stuck in repeating patterns
 */
export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]; // Create a copy to avoid modifying original
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
