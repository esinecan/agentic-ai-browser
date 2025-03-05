// src/core/state-management/RecoveryEngine.ts
import { AgentContext, StateTransition } from '../shared/types.js';

export class RecoveryEngine {
  constructor(private context: AgentContext) {}

  async handleFailure(error: Error): Promise<StateTransition> {
    // Update the recovery state with the error details.
    this.context.recoveryState.lastError = error.message;
    this.context.recoveryState.errorCount++;

    console.error(`RecoveryEngine: Error encountered - ${error.message}`);

    // Decide next state:
    // If errors exceed threshold, trigger human intervention; otherwise, retry action selection.
    if (this.context.recoveryState.errorCount > 3) {
      return {
        nextState: 'human-intervention',
        contextUpdate: {}
      };
    }
    return {
      nextState: 'choose-action',
      contextUpdate: {}
    };
  }
}