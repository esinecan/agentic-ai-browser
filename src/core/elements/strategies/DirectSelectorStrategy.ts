import { Page, ElementHandle } from "playwright";
import { Action } from "../../actions/types.js";
import { BaseElementStrategy, ElementContext } from "../types.js";
import logger from '../../../utils/logger.js';

export class DirectSelectorStrategy extends BaseElementStrategy {
  constructor() {
    super('DirectSelector', 100); // Highest priority
  }
  
  async canHandle(page: Page, action: Action): Promise<boolean> {
    return !!action.element;
  }
  
  async findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null> {
    if (!action.element) return null;
    
    try {
      const directLocator = page.locator(action.element);
      const directHandle = await directLocator.first().elementHandle({
        timeout: context.timeoutPerStrategy
      }).catch(() => null);
      
      if (directHandle) {
        this.logSuccess(action.element, context);
        return this.finalizeElement(directHandle, action);
      }
    } catch (err) {
      logger.debug('Direct lookup failed', { selector: action.element, error: err });
    }
    
    return null;
  }
}
