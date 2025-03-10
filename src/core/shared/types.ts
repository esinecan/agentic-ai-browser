// src/core/shared/types.ts
export interface BrowserState {
  url: string;
  title: string;
  screenshot?: string;
  domHash: string;
  interactiveElements: string[];
}

export interface Action {
  type: "input" | "navigate" | "click" | "wait" | "askHuman";
  selector?: string;
  element?: string;
  value?: string;
  question?: string;
  description?: string;
  selectorType: "css" | "xpath" | "text";
  maxWait: number;
  previousUrl?: string;
}

export interface AgentContext {
  currentState: BrowserState;
  actionHistory: Array<{
    action: Action;
    result: 'success' | 'partial' | 'fail';
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