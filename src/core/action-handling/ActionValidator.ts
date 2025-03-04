// src/core/action-handling/ActionValidator.ts
import { AgentContext, Action } from '../shared/types.js';

export class ActionValidator {
  constructor(private context: AgentContext) {}

  async validate(action: Action): Promise<Action> {
    await this.checkAgainstState(action);
    return this.addContextualDefaults(action);
  }

  // Check the action against the current browser state.
  private async checkAgainstState(action: Action): Promise<void> {
    const { currentState } = this.context;
    // For a click action, ensure the selector is among the interactive elements.
    if (action.type.toLowerCase() === 'click') {
      if (!action.selector || !currentState.interactiveElements.includes(action.selector)) {
        throw new Error(`Selector "${action.selector}" not found in current interactive elements.`);
      }
    }
    // For navigation actions, verify that the provided URL is valid.
    if (action.type.toLowerCase() === 'navigate') {
      try {
        new URL(action.value || '');
      } catch (e) {
        throw new Error(`Invalid navigation URL: ${action.value}`);
      }
    }
    // Additional type-specific checks can be added here.
  }

  // Add defaults or contextual adjustments to the action.
  private addContextualDefaults(action: Action): Action {
    if (action.type.toLowerCase() === 'click' && !action.selector) {
      action.selector = 'button'; // A generic default; adjust as necessary.
    }
    // Incorporate any context-specific fields (e.g., retryCount).
    return action;
  }
}