import { Page, ElementHandle } from "playwright";
import { Action } from "../../actions/types.js";
import { BaseElementStrategy, ElementContext } from "../types.js";
import logger from '../../../utils/logger.js';

export class LinkStrategy extends BaseElementStrategy {
  constructor() {
    super('LinkStrategy', 65);
  }
  
  async canHandle(page: Page, action: Action): Promise<boolean> {
    return action.type === 'click' && 
           !!action.element && 
           typeof action.element === 'string' && 
           action.element.toLowerCase().includes('a[href');
  }
  
  async findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null> {
    if (!action.element) return null;
    
    // Try finding by link text if action.value is provided
    if (action.value) {
      try {
        const linkByText = page.getByRole('link', { name: action.value });
        const count = await linkByText.count();
        
        if (count > 0) {
          logger.debug('Found link by text content', { text: action.value });
          const linkHandle = await linkByText.first().elementHandle();
          if (linkHandle) {
            this.logSuccess(`link[text="${action.value}"]`, context);
            return linkHandle;
          }
        }
      } catch (e) {
        logger.debug('Link text lookup failed', { value: action.value, error: e });
      }
    }
    
    // Try extracting the href URL and finding by partial match
    try {
      const hrefMatch = action.element.match(/a\[href=["']([^"']+)["']\]/i);
      if (hrefMatch) {
        const urlToFind = hrefMatch[1];
        // Find all links and check each href
        const links = await page.$$('a');
        for (const link of links) {
          const href = await link.getAttribute('href');
          if (href && href.includes(urlToFind.replace(/\(|\)/g, ''))) {
            logger.debug('Found link by partial href match', { href });
            this.logSuccess(`a[href*="${urlToFind}"]`, context);
            return link;
          }
        }
      }
    } catch (e) {
      logger.debug('Link href extraction failed', { error: e });
    }
    
    // If the page has only one link, use it as a fallback
    try {
      const allLinks = await page.$$('a');
      if (allLinks.length === 1) {
        logger.debug('Using the only link on the page as fallback');
        this.logSuccess('single-link-fallback', context);
        return allLinks[0];
      }
    } catch (e) {
      logger.debug('Single link lookup failed', { error: e });
    }
    
    return null;
  }
}
