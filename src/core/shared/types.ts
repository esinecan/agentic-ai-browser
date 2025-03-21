// src/core/shared/types.ts
import { Action, ActionResult } from '../actions/types.js';

// Re-export Action types for backward compatibility
export { Action, ActionResult } from '../actions/types.js';

export interface BrowserState {
  url: string;
  title: string;
  screenshot?: string;
  domHash: string;
  interactiveElements: string[];
}

export interface AgentContext {
  currentState: BrowserState;
  actionHistory: Array<{
    action: Action;
    result: ActionResult;
    timestamp: number;
  }>;
  llmSessionState: {
    model: string;
    temperature: number;
    retryCount: number;
  };
  recoveryState: {
    lastError: string;
    errorCount: number;
    fallbackTriggered: boolean;
  };
  persistence: {
    sessionId: string;
    storageKey: string;
    autoSaveInterval: number;
  };
}

export interface StateTransition {
  nextState: string;
  contextUpdate: Partial<AgentContext>;
}

export type StateHandler = (context: AgentContext) => Promise<StateTransition>;