import { Action } from "../../browserExecutor.js";
import { ElementHandle, Page } from "playwright";

/**
 * Context information for element finding operations
 */
export interface ElementContext {
  previousAttempts: string[];
  startTime: number;
  timeoutPerStrategy: number;
  lastError?: Error;
}

/**
 * Core element strategy interface - represents a way to find elements
 */
export interface ElementStrategy {
  readonly name: string;
  readonly priority: number;
  
  canHandle(page: Page, action: Action, context: ElementContext): Promise<boolean>;
  findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null>;
}

/**
 * Base implementation of an element strategy with helper methods
 */
export abstract class BaseElementStrategy implements ElementStrategy {
  name: string;
  priority: number;
  
  constructor(name: string, priority: number = 10) {
    this.name = name;
    this.priority = priority;
  }
  
  abstract canHandle(page: Page, action: Action, context: ElementContext): Promise<boolean>;
  abstract findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null>;
  
  // Helper methods that strategies can use
  protected async safeWaitForSelector(
    page: Page, 
    selector: string, 
    timeout: number
  ): Promise<boolean> {
    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch (e) {
      return false;
    }
  }
  
  protected async finalizeElement(
    element: ElementHandle | null, 
    action: Action
  ): Promise<ElementHandle | null> {
    // Remove readonly attribute for input actions
    if (element && action.type === 'input') {
      await element.evaluate((el: HTMLElement) => el.removeAttribute('readonly'));
    }
    return element;
  }
  
  protected logSuccess(selector: string, context: ElementContext): void {
    console.debug(`Strategy ${this.name} found element`, {
      selector,
      elapsedMs: Date.now() - context.startTime
    });
  }
}
