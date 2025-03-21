import { Page, ElementHandle } from "playwright";
import { Action } from "../../actions/types.js";
import { BaseElementStrategy, ElementContext } from "../types.js";
import logger from '../../../utils/logger.js';

export class SingleElementStrategy extends BaseElementStrategy {
  constructor() {
    super('SingleElement', 40); // Low priority, use as fallback
  }
  
  async canHandle(page: Page, action: Action): Promise<boolean> {
    // This is a fallback strategy for when we have no better options
    return !!action.element;
  }
  
  async findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null> {
    // Handle input actions by finding the single text input
    if (action.type === 'input') {
      try {
        const textInputLocator = page.locator('input[type="text"], textarea, input[type="search"]');
        const count = await textInputLocator.count();
        
        if (count === 1) {
          logger.debug('Using the single text input on the page as fallback');
          const textInputHandle = await textInputLocator.first().elementHandle();
          if (textInputHandle) {
            this.logSuccess('single-input-fallback', context);
            return this.finalizeElement(textInputHandle, action);
          }
        }
      } catch (e) {
        logger.debug('Single input element lookup failed', { error: e });
      }
    }
    
    // Handle click actions for buttons by finding the single button
    if (action.type === 'click' && typeof action.element === 'string' && 
        action.element.toLowerCase().includes('button')) {
      try {
        const buttonLocator = page.locator('button');
        const count = await buttonLocator.count();
        
        if (count === 1) {
          logger.debug('Using the single button on the page as fallback');
          const buttonHandle = await buttonLocator.first().elementHandle();
          if (buttonHandle) {
            this.logSuccess('single-button-fallback', context);
            return buttonHandle;
          }
        }
      } catch (e) {
        logger.debug('Single button lookup failed', { error: e });
      }
    }
    
    return null;
  }
}
