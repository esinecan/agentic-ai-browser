import { GraphContext } from "../../../browserExecutor.js";
import { verifyAction } from "../../../browserExecutor.js";
import { SuccessPatterns } from "../../../successPatterns.js";
import { setOverlayStatus } from "../../../utils/uiEffects.js";
import logger from "../../../utils/logger.js";

export async function navigateHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action?.value) throw new Error("Invalid context");

  // Set overlay status
  await setOverlayStatus(ctx.page, `Agent is navigating to: ${ctx.action.value}`);

  logger.debug('Navigation details', { 
    from: ctx.page.url(),
    to: ctx.action.value,
    options: { timeout: 10000, waitUntil: "domcontentloaded" }
  });

  logger.info('Browser Action: navigate', {
    url: ctx.action.value,
    currentUrl: ctx.page.url()
  });

  try {
    const url = new URL(ctx.action.value);
    await ctx.page.goto(url.toString(), { 
      timeout: 10000,
      waitUntil: "domcontentloaded"
    });
    
    // First try standard verification
    const verified = await verifyAction(ctx.page, ctx.action);
    
    // If standard verification fails, do a more flexible URL comparison
    if (!verified) {
      const currentUrl = new URL(ctx.page.url());
      const targetUrl = new URL(ctx.action.value);
      
      // Consider navigation successful if:
      // 1. Hostnames match when ignoring www. prefix
      // 2. Pathnames are functionally equivalent (accounting for trailing slash)
      const currentHostname = currentUrl.hostname.replace(/^www\./, '');
      const targetHostname = targetUrl.hostname.replace(/^www\./, '');
      
      const currentPathname = currentUrl.pathname === '/' ? '/' : currentUrl.pathname.replace(/\/$/, '');
      const targetPathname = targetUrl.pathname === '/' ? '/' : targetUrl.pathname.replace(/\/$/, '');
      
      const hostnameMatches = currentHostname === targetHostname;
      const pathnameMatches = currentPathname === targetPathname;
      
      if (!hostnameMatches || !pathnameMatches) {
        logger.debug(`Flexible URL verification`, {
          currentUrl: ctx.page.url(),
          targetUrl: ctx.action.value,
          hostnameMatches,
          pathnameMatches
        });
        throw new Error("Navigation verification failed - URLs don't match even with flexible comparison");
      }
      
      logger.debug(`Navigation succeeded with flexible URL verification`, {
        currentUrl: ctx.page.url(),
        targetUrl: ctx.action.value
      });
    }
    
    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    ctx.successfulActions?.push(`navigate:${url}`);
    
    // Update overlay with success message
    await setOverlayStatus(ctx.page, `✅ Successfully navigated to ${url}!`);
    
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
    // Update overlay with error message
    if (ctx.page) {
      await setOverlayStatus(ctx.page, `❌ Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
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
