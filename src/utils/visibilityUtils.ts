import { Page, ElementHandle } from "playwright";
import logger from "./logger.js";

/**
 * Ensures an element is visible in the viewport before interacting with it
 */
export async function ensureElementVisible(page: Page, elementHandle: ElementHandle): Promise<void> {
  try {
    // Check if element is currently visible in viewport
    const isVisible = await elementHandle.evaluate((element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      
      // Check if element has dimensions
      if (rect.width === 0 || rect.height === 0) return false;
      
      // Check if element is in viewport
      const isInViewport = 
        rect.top >= 0 && 
        rect.left >= 0 && 
        rect.bottom <= window.innerHeight && 
        rect.right <= window.innerWidth;
      
      return isInViewport;
    });
    
    // If not visible, scroll it into view
    if (!isVisible) {
      logger.info('Element not in viewport, scrolling into view');
      
      await elementHandle.evaluate((element: HTMLElement) => {
        // Use smooth scrolling to make the element visible in the center of viewport
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Return a promise that resolves after scrolling animation is likely complete
        return new Promise(resolve => setTimeout(resolve, 500));
      });
      
      // Wait a bit more for the page to settle after scrolling
      await page.waitForTimeout(500);
    }
  } catch (error) {
    logger.warn('Error ensuring element visibility', { error });
    // Continue execution even if visibility check fails
  }
}
