import { AgentContext } from '../shared/types.js';
import { Action } from './types.js';
import logger from '../../utils/logger.js';

export class ActionValidator {
  constructor(private context: AgentContext) {}

  // Validate an action against the current state and add contextual defaults
  async validate(action: Action): Promise<Action> {
    try {
      // Clone the action to avoid modifying the original
      const validatedAction = { ...action };
      
      // Check action against current state
      await this.checkAgainstState(validatedAction);
      
      // Add any missing defaults based on context
      return this.addContextualDefaults(validatedAction);
    } catch (error) {
      logger.error("Action validation error", error);
      // Return the original action if validation fails
      return action;
    }
  }

  private async checkAgainstState(action: Action): Promise<void> {
    if (!this.context.currentState) {
      return;  // No state to check against
    }

    // Check that interactive elements exist when needed
    if (action.element && (action.type === 'click' || action.type === 'input')) {
      const elementExists = this.context.currentState.interactiveElements.includes(action.element);
      
      if (!elementExists) {
        logger.warn(`Element not found in current state: ${action.element}`);
        // We don't throw error here, just log a warning
      }
    }
    
    // Additional validations could be added here
  }

  private addContextualDefaults(action: Action): Action {
    // Add default values based on context if they don't exist
    
    // Default maxWait value if not set
    if (!action.maxWait) {
      action.maxWait = 5000;
    }
    
    // Default selectorType if not set
    if (!action.selectorType) {
      action.selectorType = 'css';
    }
    
    // For click actions, add previous URL for verification purposes
    if (action.type === 'click' && this.context.currentState?.url) {
      action.previousUrl = action.previousUrl || this.context.currentState.url;
    }
    
    // Default question for human messages
    if (action.type === 'sendHumanMessage' && !action.question) {
      action.question = "What should I do next?";
    }
    
    return action;
  }
}
