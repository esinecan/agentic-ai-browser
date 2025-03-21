import { Page, ElementHandle } from "playwright";
import { Action } from "../../actions/types.js";
import { BaseElementStrategy, ElementContext } from "../types.js";
import logger from '../../../utils/logger.js';

export class InputPatternStrategy extends BaseElementStrategy {
  private inputSelectors = [
    'textarea',
    '[role=searchbox]',
    '[role=search] input',
    '[role=search] textarea',
    'textarea.gLFyf',
    'input[name=q]',
    'input[placeholder*="search" i]',
    'textarea[placeholder*="search" i]',
    '#search',
    '#searchbox',
    '#searchInput',
    '#search-input',
    'input#search',
    'input#q'
  ];
  
  constructor() {
    super('InputPattern', 70);
  }
  
  async canHandle(page: Page, action: Action): Promise<boolean> {
    return action.type === 'input' && 
           !!action.element && 
           typeof action.element === 'string' && 
           action.element.toLowerCase().includes('input');
  }
  
  async findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null> {
    if (!action.element) return null;
    
    // Try each alternative input selector
    for (const selector of this.inputSelectors) {
      try {
        const exists = await this.safeWaitForSelector(page, selector, context.timeoutPerStrategy / 2);
        if (exists) {
          const element = await page.$(selector);
          if (element) {
            logger.debug('Found input using alternative selector', { 
              original: action.element, 
              match: selector 
            });
            this.logSuccess(selector, context);
            return this.finalizeElement(element, action);
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    // If original selector has an ID, try with input prefix
    if (action.element.startsWith('#')) {
      const idValue = action.element.substring(1);
      const selectors = [
        `input#${idValue}`,
        `textarea#${idValue}`,
        `[role=searchbox]#${idValue}`
      ];
      
      for (const selector of selectors) {
        try {
          const exists = await this.safeWaitForSelector(page, selector, context.timeoutPerStrategy / 3);
          if (exists) {
            const element = await page.$(selector);
            if (element) {
              logger.debug('Found input using ID-based selector', { 
                original: action.element, 
                match: selector 
              });
              this.logSuccess(selector, context);
              return this.finalizeElement(element, action);
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }
    }
    
    return null;
  }
}
