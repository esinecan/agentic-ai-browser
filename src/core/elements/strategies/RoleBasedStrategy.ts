import { Page, ElementHandle } from "playwright";
import { Action } from "../../actions/types.js";
import { BaseElementStrategy, ElementContext } from "../types.js";
import logger from '../../../utils/logger.js';

export class RoleBasedStrategy extends BaseElementStrategy {
  constructor() {
    super('RoleBased', 60);
  }
  
  async canHandle(page: Page, action: Action): Promise<boolean> {
    return action.type === 'click' && 
           !!action.element && 
           !!action.value &&
           typeof action.element === 'string' && 
           action.element.toLowerCase().includes('button');
  }
  
  async findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null> {
    if (!action.value) return null;
    
    try {
      // Try to find a button by its accessible name (aria-label, text content, etc.)
      const buttonByRole = page.getByRole('button', { name: action.value });
      const count = await buttonByRole.count();
      
      if (count === 1) {
        logger.debug('Found button via role with name', { name: action.value });
        const roleButtonHandle = await buttonByRole.first().elementHandle();
        if (roleButtonHandle) {
          this.logSuccess(`role=button[name="${action.value}"]`, context);
          return roleButtonHandle;
        }
      }
    } catch (e) {
      logger.debug('Role-based lookup failed', { value: action.value, error: e });
    }
    
    return null;
  }
}
