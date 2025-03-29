import { Page, ElementHandle } from "playwright";
import { GraphContext } from "../../../browserExecutor.js";
import { getElement, verifyAction } from "../../../browserExecutor.js";
import { SuccessPatterns } from "../../../successPatterns.js";
import { SelectorFallbacks } from "../../elements/strategies/SelectorFallbacks.js";
import { ensureElementVisible } from "../../../utils/visibilityUtils.js";
import logger from "../../../utils/logger.js";

// Default value for the universal submit selector if not set in environment variables
const DEFAULT_UNIVERSAL_SUBMIT_SELECTOR = "";

export async function clickHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action) {
    throw new Error("Invalid context");
  }

  // Special case for UNIVERSAL_SUBMIT_SELECTOR - simulate pressing Enter key
  // Use the environment variable or fall back to the default value
  const universalSubmitSelector = process.env.UNIVERSAL_SUBMIT_SELECTOR || DEFAULT_UNIVERSAL_SUBMIT_SELECTOR;
  
  // Make comparison more robust by checking for exact match or if action element contains the selector text
  if (ctx.action.element === universalSubmitSelector || 
      (typeof ctx.action.element === 'string' && 
       ctx.action.element.includes(universalSubmitSelector)) ||
      ctx.action.element === "Enter") {
    
    logger.browser.action('keypress', {
      key: 'Enter',
      url: ctx.page.url()
    });
    
    try {
      // Use Playwright's keyboard API to press Enter
      await ctx.page.keyboard.press('Enter');
      
      // Mark action as successful
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      ctx.successfulActions?.push(`keypress:Enter`);
      
      // Add to history
      ctx.history.push(`Pressed Enter key`);
      
      logger.info('Successfully executed Enter key press', {
        url: ctx.page.url()
      });
      
      return "getPageState";
    } catch (error) {
      logger.error('Error pressing Enter key', { error });
      ctx.lastActionSuccess = false;
      ctx.retries = (ctx.retries || 0) + 1;
      ctx.actionFeedback = "Submission failed. Please notify human handler.";
      return "handleFailure";
    }
  }

  // Continue with regular click handling for normal elements
  logger.browser.action('click', {
    element: ctx.action.element,
    url: ctx.page.url()
  });

  try {
    // Store previous URL for navigation detection
    const previousUrl = ctx.page.url();
    ctx.action.previousUrl = ctx.action.previousUrl || previousUrl;
    
    // Try with the original element selector first
    let elementHandle = await getElement(ctx.page, ctx.action);
    
    // If not found, try with fallbacks
    if (!elementHandle && ctx.action.element) {
      logger.info('Original selector failed, trying fallbacks', {
        original: ctx.action.element,
        url: ctx.page.url()
      });
      
      elementHandle = await SelectorFallbacks.tryFallbacks(ctx.page, ctx.action);
      
      // If we found an element, log the fallback success
      if (elementHandle) {
        logger.info('Found element using fallback mechanisms');
      }
    }
    
    // If still no element found, throw error
    if (!elementHandle) {
      throw new Error("Element not found " + ctx.action.element);
    }

    try {
      // Ensure element is visible before trying to click
      await ensureElementVisible(ctx.page, elementHandle);
      
      // Try the regular Playwright click first
      await elementHandle.click({ timeout: ctx.action.maxWait });
    } catch (error) {
      // If regular click fails, check if it's a link and navigate directly
      try {
        logger.info('Regular click failed, checking if element is a link', {
          element: ctx.action.element,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Check if it's an anchor tag with href
        const href = await elementHandle.evaluate((el: HTMLElement) => {
          if (el.tagName === 'A' && el.hasAttribute('href')) {
            return el.getAttribute('href');
          }
          return null;
        });
        
        // If it's a link with href, navigate directly instead of clicking
        if (href) {
          logger.info('Element is a link, navigating directly', { href });
          
          // Resolve relative URLs
          let fullUrl = href;
          if (href.startsWith('/')) {
            const baseUrl = new URL(ctx.page.url());
            fullUrl = `${baseUrl.origin}${href}`;
          }
          
          // Navigate directly to the URL
          await ctx.page.goto(fullUrl, { timeout: 10000 });
          
          // Navigation successful, no need for JavaScript click
          logger.info('Direct navigation successful', { url: fullUrl });
        } else {
          // Not a link, try JavaScript click as last resort
          logger.info('Element is not a link, trying JavaScript click');
          await ctx.page.evaluate((element: HTMLElement) => {
            if (element && typeof element.click === 'function') {
              element.click();
              return true;
            }
            return false;
          }, elementHandle as any);
        }
      } catch (fallbackError) {
        // Both methods failed
        logger.error('All click fallbacks failed', {
          element: ctx.action.element,
          originalError: error instanceof Error ? error.message : String(error),
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
        throw error; // Re-throw the original error
      }
    }

    const verified = await verifyAction(ctx.page, ctx.action);

    if (!verified) {
      throw new Error("Action verification failed after click");
    }

    // If we get here, the click was successful
    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    ctx.successfulActions?.push(`click:${ctx.action.element}`);

    const elementSelector = ctx.action.element;
    const description = ctx.action.description || elementSelector;

    logger.info('Click successful', {
      element: description,
      successCount: ctx.successCount
    });

    // Record in context that we used the last selector
    if (ctx.action.element) {
      ctx.lastSelector = ctx.action.element;
    }

    // Optionally record success patterns
    try {
      const domain = new URL(ctx.page.url()).hostname;
      const successPatternsInstance = new SuccessPatterns();
      successPatternsInstance.recordSuccess(ctx.action, domain);
    } catch (spError) {
      logger.error('Error recording success pattern', spError);
    }

    return "getPageState";
  } catch (error) {
    logger.browser.error('click', {
      error,
      element: ctx.action.element
    });
    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    return "handleFailure";
  }
}
