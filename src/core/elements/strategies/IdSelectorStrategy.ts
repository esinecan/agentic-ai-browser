import { Page, ElementHandle } from "playwright";
import { Action } from "../../actions/types.js";
import { BaseElementStrategy, ElementContext } from "../types.js";
import logger from '../../../utils/logger.js';

export class IdSelectorStrategy extends BaseElementStrategy {
  constructor() {
    super('IdSelector', 90);
  }
  
  async canHandle(page: Page, action: Action): Promise<boolean> {
    return !!(action.element && 
      typeof action.element === 'string' && 
      action.element.startsWith('#') &&
      (action.type === 'click' || action.type === 'input'));
  }
  
  async findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null> {
    if (!action.element) return null;
    
    try {
      await this.safeWaitForSelector(page, action.element, context.timeoutPerStrategy);
      const idElement = await page.$(action.element);
      
      if (idElement) {
        this.logSuccess(action.element, context);
        return this.finalizeElement(idElement, action);
      }
    } catch (e) {
      logger.debug('ID selector lookup failed', { selector: action.element, error: e });
    }
    
    return null;
  }
}
