import { GraphContext } from "../../../browserExecutor.js";
import { setOverlayStatus } from "../../../utils/uiEffects.js";
import logger from "../../../utils/logger.js";

// Default scroll amount in pixels if not specified by MCP
const DEFAULT_SCROLL_AMOUNT = 800;

export async function scrollHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action) {
    logger.error("Invalid context for scrollHandler");
    return "handleFailure"; // Or another appropriate error state
  }

  // Get direction and amount from action, use defaults if needed
  const direction = ctx.action.direction || "down";
  const customAmount = ctx.action.amount; // Amount from MCP call
  const amountToScroll = customAmount ?? DEFAULT_SCROLL_AMOUNT;
  const scrollPixels = (direction === "down" ? 1 : -1) * amountToScroll;

  // Set overlay status
  await setOverlayStatus(ctx.page, `Agent is scrolling ${direction}${customAmount ? ` by ${customAmount} pixels` : ''}...`);

  logger.browser.action('scroll', {
    direction,
    amount: amountToScroll,
    url: ctx.page.url()
  });

  try {
    // Check if we've reached the scroll limit before scrolling
    const canScroll = await ctx.page.evaluate((pixels) => {
      const currentPosition = window.scrollY;
      const maxPosition = Math.max(
        document.body.scrollHeight, 
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.body.clientHeight,
        document.documentElement.clientHeight
      ) - window.innerHeight;
      
      if (pixels > 0 && currentPosition >= maxPosition - 1) { // Added tolerance
        return false; // Can't scroll down further
      }
      
      if (pixels < 0 && currentPosition <= 0) {
        return false; // Can't scroll up further
      }
      
      return true;
    }, scrollPixels).catch(e => {
      logger.warn("Could not evaluate scroll limit", { error: e });
      return true; // Assume we can scroll if evaluation fails
    });
    
    if (!canScroll) {
      const limitReachedMsg = `⚠️ Can't scroll ${direction} anymore - already at the ${direction === "down" ? "bottom" : "top"} of the page.`;
      await setOverlayStatus(ctx.page, limitReachedMsg);
      
      ctx.lastActionSuccess = true; // Reaching limit isn't a failure
      ctx.actionFeedback = limitReachedMsg;
      ctx.history.push(`Attempted to scroll ${direction} but reached the ${direction === "down" ? "bottom" : "top"} limit.`);
      
      logger.info(`Scroll limit reached for ${direction} direction`, {
        direction,
        amount: amountToScroll,
        url: ctx.page.url()
      });
      
      // Even if limit reached, get page state as content might have changed slightly
      return "getPageState"; 
    }

    // Store position before scroll
    const previousScrollY = await ctx.page.evaluate(() => window.scrollY);

    // Perform the scroll
    await ctx.page.evaluate((pixels) => {
      window.scrollBy(0, pixels);
    }, scrollPixels);

    // Wait briefly for content to load/render after scroll
    await ctx.page.waitForTimeout(300); 

    // Check how much we actually scrolled
    const currentScrollY = await ctx.page.evaluate(() => window.scrollY);
    const actualScroll = Math.abs(currentScrollY - previousScrollY);

    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    ctx.successfulActions?.push(`scroll:${direction}:${amountToScroll}`); // Add amount
    
    const successMsg = `✅ Successfully scrolled ${direction}${actualScroll > 0 ? ` by ${Math.round(actualScroll)} pixels` : ' (no position change)'}.`;
    await setOverlayStatus(ctx.page, successMsg);
    
    ctx.actionFeedback = successMsg + (ctx.successCount > 1 ? ` (${ctx.successCount} successful actions in a row)` : '');
    ctx.history.push(`Scrolled ${direction} by ${Math.round(actualScroll)} pixels (requested ${amountToScroll})`);
    
    logger.info(`Scroll ${direction} successful`, {
      direction,
      requestedAmount: amountToScroll,
      actualScroll: Math.round(actualScroll),
      successCount: ctx.successCount
    });

    // Return to page state to extract new content after scrolling
    return "getPageState";
  } catch (error) {
    const errorMsg = `❌ Scroll failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    if (ctx.page && !ctx.page.isClosed()) {
      try {
        await setOverlayStatus(ctx.page, errorMsg);
      } catch (overlayError) {
        logger.error("Failed to set overlay status on scroll error", { overlayError });
      }
    } else {
        logger.warn("Page closed or invalid, cannot set overlay for scroll error");
    }
    
    logger.browser.error("scroll", {
      error,
      direction,
      amount: amountToScroll
    });

    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.history.push(`Scroll ${direction} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return "handleFailure";
  }
}
