// src/core/state-management/ContextManager.ts
import { AgentContext } from '../shared/types.js';
import { mergeContexts } from '../shared/utils.js';

// Simple in-memory storage adapter implementation.
class InMemoryStorageAdapter {
  private store: Record<string, any> = {};

  load(key: string): any {
    return this.store[key] || null;
  }

  save(key: string, data: any): void {
    this.store[key] = data;
  }
}

export class ContextManager {
  private storage: InMemoryStorageAdapter;

  constructor() {
    this.storage = new InMemoryStorageAdapter();
  }

  loadContext(initial: Partial<AgentContext>): AgentContext {
    const key = initial.persistence?.storageKey || 'agent_context';
    const saved = this.storage.load(key);
    return mergeContexts(initial, saved);
  }

  saveContext(context: AgentContext): void {
    const serializable = this.sanitizeContext(context);
    this.storage.save(context.persistence.storageKey, serializable);
  }

  private sanitizeContext(context: AgentContext): object {
    return {
      currentState: context.currentState,
      actionHistory: context.actionHistory.map(entry => ({
        action: entry.action,
        result: entry.result,
        timestamp: entry.timestamp
      })),
      llmSessionState: context.llmSessionState,
      recoveryState: context.recoveryState,
      persistence: context.persistence
    };
  }
}