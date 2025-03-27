import { GraphContext } from "../../../browserExecutor.js";
import { getElement, verifyAction } from "../../../browserExecutor.js";
import { SelectorFallbacks } from "../../elements/strategies/SelectorFallbacks.js";
import { SuccessPatterns } from "../../../successPatterns.js";
import logger from "../../../utils/logger.js";

export async function inputHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action) throw new Error("Invalid context");

  logger.browser.action('input', {
    element: ctx.action.element,
    value: ctx.action.value,
    url: ctx.page.url()
  });

  try {
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
    if (!elementHandle) throw new Error("Element not found");
    
    // FOCUS-FIRST APPROACH: Click to focus before filling
    await elementHandle.click({ timeout: ctx.action.maxWait / 2 });
    
    // Then fill the value
    await elementHandle.fill(ctx.action.value!, { timeout: ctx.action.maxWait });
    
    const verified = await verifyAction(ctx.page, ctx.action);
    if (!verified) throw new Error("Action verification failed after input");
    
    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    const elementSelector = ctx.action.element;
    const value = ctx.action.value;
    const description = ctx.action.description || elementSelector;
    
    ctx.successfulActions?.push(`input:${elementSelector}`);
    
    ctx.actionFeedback = `✅ Successfully entered "${value}" into ${description}!` + 
      (ctx.successCount > 1 ? ` You're doing great! ${ctx.successCount} successful actions in a row.` : '');
    
    ctx.history.push(`Input '${ctx.action.value}' to ${ctx.action.element}`);
    
    try {
      const domain = new URL(ctx.page.url()).hostname;
      const successPatternsInstance = new SuccessPatterns();
      successPatternsInstance.recordSuccess(ctx.action, domain);
    } catch (error) {
      logger.error("Error recording success pattern", error);
    }
    
    logger.info("Input successful", {
      element: ctx.action.element,
      value: ctx.action.value,
      successCount: ctx.successCount
    });

    return "chooseAction";
  } catch (error) {
    logger.browser.error("input", {
      error,
      element: ctx.action.element,
      value: ctx.action.value
    });

    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.history.push(`Input failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return "handleFailure";
  }
}
