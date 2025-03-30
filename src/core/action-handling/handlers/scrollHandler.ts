import { GraphContext } from "../../../browserExecutor.js";
import { setOverlayStatus } from "../../../utils/uiEffects.js";
import logger from "../../../utils/logger.js";

// Default scroll amount in pixels
const DEFAULT_SCROLL_AMOUNT = 800;

export async function scrollHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action) throw new Error("Invalid context");

  // Get direction, defaulting to "down" if not specified
  const direction = ctx.action.direction || "down";
  
  // Set overlay status
  await setOverlayStatus(ctx.page, `Agent is scrolling ${direction}`);
  
  // Amount to scroll (positive for down, negative for up)
  const scrollAmount = direction === "down" ? DEFAULT_SCROLL_AMOUNT : -DEFAULT_SCROLL_AMOUNT;

  logger.browser.action('scroll', {
    direction,
    amount: Math.abs(scrollAmount),
    url: ctx.page.url()
  });

  try {
    // Check if we've reached the scroll limit before scrolling
    const canScroll = await ctx.page.evaluate((amt) => {
      const currentPosition = window.scrollY;
      const maxPosition = Math.max(
        document.body.scrollHeight, 
        document.documentElement.scrollHeight
      ) - window.innerHeight;
      
      if (amt > 0 && currentPosition >= maxPosition) {
        return false; // Can't scroll down further
      }
      
      if (amt < 0 && currentPosition <= 0) {
        return false; // Can't scroll up further
      }
      
      return true;
    }, scrollAmount);
    
    if (!canScroll) {
      // Update overlay with the limit message
      await setOverlayStatus(ctx.page, `⚠️ Can't scroll ${direction} anymore - already at the ${direction === "down" ? "bottom" : "top"} of the page.`);
      
      ctx.lastActionSuccess = true; // Not really a failure
      ctx.actionFeedback = `⚠️ Can't scroll ${direction} anymore - already at the ${direction === "down" ? "bottom" : "top"} of the page.`;
      ctx.history.push(`Attempted to scroll ${direction} but reached the ${direction === "down" ? "bottom" : "top"} of the page`);
      
      logger.info(`Scroll limit reached for ${direction} direction`, {
        direction,
        url: ctx.page.url()
      });
      
      return "chooseAction";
    }

    // Perform the scroll
    await ctx.page.evaluate((amt) => {
      window.scrollBy(0, amt);
    }, scrollAmount);

    // Wait briefly for content to load/render
    await ctx.page.waitForTimeout(300);

    // Check how much we actually scrolled
    const actualScroll = await ctx.page.evaluate((amt) => {
      const oldPosition = window.scrollY - amt; // Approximate previous position
      const currentPosition = window.scrollY;
      return Math.abs(currentPosition - oldPosition);
    }, scrollAmount);

    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    ctx.successfulActions?.push(`scroll:${direction}`);
    
    // Update overlay with success message
    await setOverlayStatus(ctx.page, `✅ Successfully scrolled ${direction} by ${actualScroll} pixels.`);
    
    ctx.actionFeedback = `✅ Successfully scrolled ${direction} by ${actualScroll} pixels.` +
      (ctx.successCount > 1 ? ` You've had ${ctx.successCount} successful actions in a row.` : '');
    
    ctx.history.push(`Scrolled ${direction} by ${actualScroll} pixels`);
    
    logger.info(`Scroll ${direction} successful`, {
      direction,
      amount: scrollAmount,
      actualScroll,
      successCount: ctx.successCount
    });

    // Return to page state to extract new content after scrolling
    return "getPageState";
  } catch (error) {
    // Update overlay with error message
    if (ctx.page) {
      await setOverlayStatus(ctx.page, `❌ Scroll failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    logger.browser.error("scroll", {
      error,
      direction
    });

    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.history.push(`Scroll ${direction} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return "handleFailure";
  }
}
