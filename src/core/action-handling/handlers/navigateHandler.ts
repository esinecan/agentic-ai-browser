import { GraphContext } from "../../../browserExecutor.js";
import { verifyAction } from "../../../browserExecutor.js";
import { SuccessPatterns } from "../../../successPatterns.js";
import logger from "../../../utils/logger.js";

export async function navigateHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action?.value) throw new Error("Invalid context");

  logger.browser.action('navigate', {
    url: ctx.action.value,
    currentUrl: ctx.page.url()
  });

  try {
    const url = new URL(ctx.action.value);
    await ctx.page.goto(url.toString(), { 
      timeout: 10000,
      waitUntil: "domcontentloaded"
    });
    
    const verified = await verifyAction(ctx.page, ctx.action);
    if (!verified) throw new Error("Action verification failed after navigation");
    
    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    ctx.successfulActions?.push(`navigate:${url}`);
    
    ctx.actionFeedback = `✅ Successfully navigated to ${url}!` +
      (ctx.successCount > 1 ? ` You're on a roll with ${ctx.successCount} successful actions in a row!` : '');
    
    ctx.history.push(`Navigated to: ${url}`);
    
    try {
      const domain = url.hostname;
      const successPatternsInstance = new SuccessPatterns();
      successPatternsInstance.recordSuccess(ctx.action, domain);
    } catch (error) {
      logger.error("Error recording success pattern", error);
    }
    
    logger.info("Navigation successful", {
      url: ctx.action.value,
      successCount: ctx.successCount
    });

    return "chooseAction";
  } catch (error) {
    logger.browser.error("navigation", {
      error,
      url: ctx.action.value
    });

    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.history.push(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return "handleFailure";
  }
}
