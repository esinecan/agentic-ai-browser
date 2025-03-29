import { Page, ElementHandle } from "playwright";
import logger from "./logger.js";

/**
 * Ensures an element is visible in the viewport by scrolling to it
 * Returns whether the element was successfully scrolled into view
 */
export async function ensureElementVisible(page: Page, elementHandle: ElementHandle): Promise<boolean> {
  try {
    // First check if element is already visible
    const isVisible = await elementHandle.evaluate((el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && 
             rect.left >= 0 && 
             rect.bottom <= window.innerHeight &&
             rect.right <= window.innerWidth &&
             window.getComputedStyle(el).display !== 'none' &&
             window.getComputedStyle(el).visibility !== 'hidden';
    });
    
    // If already visible, no need to scroll
    if (isVisible) {
      return true;
    }

    // Element exists but not in viewport, scroll it into view
    await elementHandle.evaluate((el: HTMLElement) => {
      el.scrollIntoView({ 
        behavior: 'instant', 
        block: 'center', 
        inline: 'center' 
      });
    });
    
    // Brief pause to let scroll complete and page stabilize
    await page.waitForTimeout(300);
    
    // Verify element is now visible
    const isNowVisible = await elementHandle.evaluate((el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && 
             rect.left >= 0 && 
             rect.bottom <= window.innerHeight &&
             rect.right <= window.innerWidth;
    });
    
    logger.debug('Element scroll result', {
      scrolled: true,
      nowVisible: isNowVisible
    });
    
    return isNowVisible;
  } catch (error) {
    logger.error('Error ensuring element visibility', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return false;
  }
}
