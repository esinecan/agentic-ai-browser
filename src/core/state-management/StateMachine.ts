// src/core/state-management/StateMachine.ts
import { AgentContext, StateTransition, StateHandler, Action } from '../shared/types.js';
import { ContextManager } from './ContextManager.js';
import { ActionExtractor } from '../action-handling/ActionExtractor.js';
import { RecoveryEngine } from './RecoveryEngine.js';

export class AgentStateMachine {
  public context: AgentContext;
  public currentStateName: string;
  private states: Record<string, StateHandler>;
  private persistence: ContextManager;
  private actionExtractor: ActionExtractor;
  private recoveryEngine: RecoveryEngine;

  constructor(initialContext: Partial<AgentContext>) {
    this.persistence = new ContextManager();
    this.context = this.persistence.loadContext(initialContext);
    this.currentStateName = 'initialize';
    this.actionExtractor = new ActionExtractor(this.context);
    this.recoveryEngine = new RecoveryEngine(this.context);
    this.states = {
      'initialize': this.handleInitialize.bind(this),
      'analyze-page': this.handlePageAnalysis.bind(this),
      'choose-action': this.handleActionSelection.bind(this),
      'execute-action': this.handleActionExecution.bind(this),
      'validate-results': this.handleValidation.bind(this),
      'error-recovery': this.handleErrorRecovery.bind(this),
      'human-intervention': this.handleHumanIntervention.bind(this),
      'persist-state': this.handleStatePersistence.bind(this)
    };

    this.setupAutoSave();
  }

  private setupAutoSave() {
    setInterval(() => {
      this.persistence.saveContext(this.context);
      console.log('Context auto-saved.');
    }, this.context.persistence.autoSaveInterval);
  }

  async transition(stateName: string): Promise<void> {
    this.currentStateName = stateName;
    const handler = this.states[stateName];
    if (!handler) throw new Error(`Invalid state: ${stateName}`);

    console.log(`Transitioning from state: ${stateName}`);
    try {
      const transition = await handler(this.context);
      this.context = {
        ...this.context,
        ...transition.contextUpdate
      };
      if (transition.nextState === 'done') {
        console.log('State machine reached done state.');
        return;
      }
      await this.transition(transition.nextState);
    } catch (error) {
      console.error(`Error in state ${stateName}: ${error}`);
      const recoveryTransition = await this.recoveryEngine.handleFailure(error as Error);
      await this.transition(recoveryTransition.nextState);
    }
  }

  // --- State Handlers ---

  // Initialization: set up any required startup procedures.
  private async handleInitialize(context: AgentContext): Promise<StateTransition> {
    console.log('Handling initialization...');
    // (e.g., loading initial browser state)
    return {
      nextState: 'analyze-page',
      contextUpdate: {}
    };
  }

  // Page Analysis: simulate analyzing the page to update current state.
  private async handlePageAnalysis(context: AgentContext): Promise<StateTransition> {
    console.log('Analyzing page...');
    // Simulated page state update; replace with actual DOM analysis.
    context.currentState = {
      url: 'https://example.com',
      title: 'Example Domain',
      domHash: 'abc123',
      interactiveElements: ['#login', '#search']
    };
    return {
      nextState: 'choose-action',
      contextUpdate: {}
    };
  }

  // Action Selection: use the ActionExtractor to parse a raw action string.
  private async handleActionSelection(context: AgentContext): Promise<StateTransition> {
    console.log('Selecting action...');
    // Simulate receiving a raw action from an LLM.
    const rawAction = '{"type": "click", "selector": "#login"}';
    try {
      const action = await this.actionExtractor.processRawAction(rawAction);
      if (!action) throw new Error("Failed to extract action with call from state manager");
      // Record the action in history.
      context.actionHistory.push({
        action,
        result: 'success',
        timestamp: Date.now()
      });
      // Reset retry count after a valid action.
      context.llmSessionState.retryCount = 0;
      return {
        nextState: 'execute-action',
        contextUpdate: {}
      };
    } catch (error) {
      throw new Error(`Action selection failed: ${error}`);
    }
  }

  // Action Execution: execute the chosen action.
  private async handleActionExecution(context: AgentContext): Promise<StateTransition> {
    console.log('Executing action...');
    // Here, integrate with our browser automation layer.
    // For simulation, assume the action executes successfully.
    return {
      nextState: 'validate-results',
      contextUpdate: {}
    };
  }

  // Validation: verify that the action produced the desired outcome.
  private async handleValidation(context: AgentContext): Promise<StateTransition> {
    console.log('Validating results...');
    // Simulate validation logic; in practice, compare current page state against expectations.
    const validationSuccess = true; // Replace with real checks.
    return {
      nextState: validationSuccess ? 'persist-state' : 'error-recovery',
      contextUpdate: {}
    };
  }

  // Error Recovery: if validation fails or an error occurs, adjust context and retry.
  private async handleErrorRecovery(context: AgentContext): Promise<StateTransition> {
    console.log('Handling error recovery...');
    // Adjust recovery state; you could implement alternative strategies here.
    return {
      nextState: 'choose-action',
      contextUpdate: {
        recoveryState: {
          ...context.recoveryState,
          lastError: '',
          errorCount: context.recoveryState.errorCount + 1,
          fallbackTriggered: false
        }
      }
    };
  }

  // Human Intervention: if errors exceed a threshold, fall back to human input.
  private async handleHumanIntervention(context: AgentContext): Promise<StateTransition> {
    console.log('Requesting human intervention...');
    // In a real system, prompt the user; here, simulate human input and reset error counters.
    return {
      nextState: 'choose-action',
      contextUpdate: {
        recoveryState: {
          ...context.recoveryState,
          lastError: '',
          errorCount: 0,
          fallbackTriggered: false
        }
      }
    };
  }

  // Persist State: final state to save context and conclude the session.
  private async handleStatePersistence(context: AgentContext): Promise<StateTransition> {
    console.log('Persisting state...');
    this.persistence.saveContext(context);
    return {
      nextState: 'done',
      contextUpdate: {}
    };
  }
}