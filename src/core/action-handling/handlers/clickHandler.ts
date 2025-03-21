import { Page, ElementHandle } from "playwright";
import { GraphContext } from "../../../browserExecutor.js";
import { getElement, verifyAction } from "../../../browserExecutor.js";
import { SuccessPatterns } from "../../../successPatterns.js";
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
       ctx.action.element.includes(universalSubmitSelector))) {
    
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
    const elementHandle = await getElement(ctx.page, ctx.action);

    if (!elementHandle) {
      throw new Error("Element not found " + ctx.action.element);
    }

    // Try the click
    await elementHandle.click({ timeout: ctx.action.maxWait });
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
