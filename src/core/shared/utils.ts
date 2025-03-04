// src/core/shared/utils.ts
import { AgentContext } from './types.js';

export function mergeContexts(
  initial: Partial<AgentContext>,
  saved: any
): AgentContext {
  // Define default context values.
  const defaultContext: AgentContext = {
    currentState: {
      url: '',
      title: '',
      domHash: '',
      interactiveElements: []
    },
    actionHistory: [],
    llmSessionState: {
      model: 'default-model',
      temperature: 0.7,
      retryCount: 0
    },
    recoveryState: {
      lastError: '',
      errorCount: 0,
      fallbackTriggered: false
    },
    persistence: {
      sessionId: 'default-session',
      storageKey: 'agent_context',
      autoSaveInterval: 5000
    }
  };

  // Merge defaults, initial values, and any saved context.
  return {
    ...defaultContext,
    ...initial,
    ...saved
  };
}