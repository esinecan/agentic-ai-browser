import { GraphContext, compressHistory } from '../../browserExecutor.js';
import { Page } from 'playwright';
import { initializeMilestones } from './milestones.js';
import logger from '../../utils/logger.js';

/**
 * Manages the context for the automation system
 */
export class ContextManager {
  /**
   * Initializes a GraphContext with default values for any missing properties
   */
  initializeContext(ctx: GraphContext): GraphContext {
    // Create default arrays if they don't exist
    ctx.history = ctx.history || [];
    ctx.actionHistory = ctx.actionHistory || [];
    ctx.successfulActions = ctx.successfulActions || [];
    ctx.recognizedMilestones = ctx.recognizedMilestones || [];
    
    // Initialize tracking variables if they don't exist
    ctx.lastActionSuccess = ctx.lastActionSuccess ?? false;
    ctx.successCount = ctx.successCount ?? 0;
    ctx.retries = ctx.retries ?? 0;
    
    // Setup milestones based on user goal
    initializeMilestones(ctx);
    
    return ctx;
  }
  
  /**
   * Build an optimized context for LLM prompting
   */
  async buildOptimizedContext(ctx: GraphContext): Promise<string> {
    let promptContext = "";
    
    // 1. Current goal (always include)
    promptContext += `Your current goal is: ${ctx.userGoal}\n\n`;
    
    // 2. Current page state (most important)
    promptContext += `Current page: ${ctx.page?.url() || "Unknown"}\n`;
    promptContext += `Page title: ${ctx.previousPageState?.title || "Unknown"}\n\n`;
    
    // 3. Interactive elements (filtered to most relevant)
    const MAX_ELEMENTS = 10;
    if (ctx.previousPageState?.interactiveElements) {
      promptContext += "Key interactive elements:\n";
      const elements = this.filterMostRelevantElements(ctx.previousPageState.interactiveElements, MAX_ELEMENTS);
      elements.forEach(el => {
        promptContext += `- ${el.type}: "${el.text || el.id || el.name}" ${el.selector ? `(${el.selector})` : ""}\n`;
      });
      promptContext += "\n";
    }
    
    // 4. Recent actions (compressed)
    if (ctx.history && ctx.history.length > 0) {
      const recentHistory = compressHistory(ctx.history, 5);
      promptContext += "Recent actions:\n";
      recentHistory.forEach(h => promptContext += `- ${h}\n`);
      promptContext += "\n";
    }
    
    // 5. Success/failure info (selective)
    if (ctx.lastActionSuccess !== undefined) {
      promptContext += ctx.lastActionSuccess 
        ? "✅ Last action was successful\n" 
        : "❌ Last action failed\n";
    }
    
    return promptContext;
  }
  
  /**
   * Filter elements by their relevance
   */
  filterMostRelevantElements(elements: any[], maxCount: number): any[] {
    // Prioritize buttons, links, and inputs
    const priorityElements = elements.filter(el => 
      el.type === 'button' || 
      el.type === 'link' || 
      el.type === 'input'
    );
    
    // If we have too many, prioritize ones with text
    if (priorityElements.length > maxCount) {
      return priorityElements
        .filter(el => el.text)
        .slice(0, maxCount);
    }
    
    return priorityElements.slice(0, maxCount);
  }
  
  /**
   * Update the context with a new page state
   */
  async updatePageState(ctx: GraphContext, page: Page): Promise<GraphContext> {
    if (!page) {
      logger.warn('Cannot update page state: no page provided');
      return ctx;
    }
    
    try {
      const { getPageState } = await import('../../browserExecutor.js');
      const stateSnapshot = await getPageState(page);
      
      // Store previous state for progress comparison
      ctx.previousPageState = ctx.previousPageState || null;
      
      // Update context with compressed history
      ctx.compressedHistory = compressHistory(ctx.history);
      
      // Return updated context
      return {
        ...ctx,
        previousPageState: stateSnapshot
      };
    } catch (error) {
      logger.error('Failed to update page state', { error });
      return ctx;
    }
  }
  
  /**
   * Save the current context state (can be implemented for persistence)
   */
  saveContext(ctx: GraphContext): void {
    // Implementation for persistence would go here
    // For now, just log that we would save
    logger.debug('Context checkpoint', {
      actions: ctx.actionHistory?.length || 0,
      url: ctx.page?.url()
    });
  }
}
