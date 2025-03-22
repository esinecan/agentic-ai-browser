import { Page, ElementHandle } from "playwright";
import { Action } from "../../browserExecutor.js";
import { ElementStrategy, ElementContext } from "./types.js";
import { DirectSelectorStrategy } from "./strategies/DirectSelectorStrategy.js";
import { IdSelectorStrategy } from "./strategies/IdSelectorStrategy.js";
import { InputPatternStrategy } from "./strategies/InputPatternStrategy.js";
import { RoleBasedStrategy } from "./strategies/RoleBasedStrategy.js";
import { LinkStrategy } from "./strategies/LinkStrategy.js";
import { SingleElementStrategy } from "./strategies/SingleElementStrategy.js";
import logger from '../../utils/logger.js';

export class ElementFinder {
  private strategies: ElementStrategy[] = [];
  
  constructor() {
    // Register strategies in priority order
    this.registerStrategy(new DirectSelectorStrategy());
    this.registerStrategy(new IdSelectorStrategy());
    this.registerStrategy(new InputPatternStrategy());
    this.registerStrategy(new RoleBasedStrategy());
    this.registerStrategy(new LinkStrategy());
    this.registerStrategy(new SingleElementStrategy());
    
    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.priority - a.priority);
  }
  
  registerStrategy(strategy: ElementStrategy): void {
    this.strategies.push(strategy);
  }
  
  async findElement(page: Page, action: Action): Promise<ElementHandle | null> {
    logger.debug('Finding element with strategies', {
      selector: action.element,
      type: action.type,
      strategyCount: this.strategies.length
    });
    
    // Skip element finding for notes action type
    if (action.type === 'notes') {
      logger.debug('Skipping element finding for notes action');
      return null;
    }
    
    const context: ElementContext = {
      previousAttempts: [],
      startTime: Date.now(),
      timeoutPerStrategy: Math.min(action.maxWait || 2000, 2000) / Math.min(this.strategies.length, 3)
    };
    
    // Try each strategy in priority order
    for (const strategy of this.strategies) {
      try {
        // Type assertion to make TypeScript happy
        const actionForStrategy = action as Exclude<Action, { type: 'notes' }>;
        const canHandle = await strategy.canHandle(page, actionForStrategy, context);
        if (!canHandle) continue;
        
        logger.debug(`Trying element strategy: ${strategy.name}`, {
          selector: action.element,
          type: action.type
        });
        
        const element = await strategy.findElement(page, actionForStrategy, context);
        if (element) {
          return element;
        }
        
        // Track attempts
        if (action.element) {
          context.previousAttempts.push(action.element);
        }
      } catch (error) {
        logger.debug(`Strategy ${strategy.name} failed`, {
          error,
          selector: action.element
        });
        context.lastError = error as Error;
      }
    }
    
    logger.warn('No matching element found', { 
      triedStrategies: this.strategies.map(s => s.name).join(', '),
      selector: action.element
    });
    
    return null;
  }
  
  async getAlternativeSuggestions(page: Page, selector: string): Promise<string[]> {
    // Basic implementation of alternative selector suggestions
    const suggestions: string[] = [];
    
    // For input fields
    if (selector.includes('input')) {
      const inputSelectors = ['textarea', '[role=searchbox]', 'input[name=q]'];
      for (const altSelector of inputSelectors) {
        try {
          const exists = await page.$(altSelector);
          if (exists) suggestions.push(altSelector);
        } catch (e) {
          // Continue checking
        }
      }
    }
    
    // For buttons
    if (selector.includes('button')) {
      const buttonSelectors = ['[role=button]', 'input[type=submit]', 'button[type=submit]'];
      for (const altSelector of buttonSelectors) {
        try {
          const exists = await page.$(altSelector);
          if (exists) suggestions.push(altSelector);
        } catch (e) {
          // Continue checking
        }
      }
    }
    
    return suggestions;
  }
}

// Singleton instance
export const elementFinder = new ElementFinder();
