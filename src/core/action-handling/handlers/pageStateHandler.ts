import { GraphContext, getPageState } from "../../../browserExecutor.js";
import { PageState, detectProgress } from "../../../core/automation/progress.js";
import { checkMilestones } from "../../../core/automation/milestones.js";
import logger from "../../../utils/logger.js";

export async function getPageStateHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page) throw new Error("Page not initialized");
  
  logger.browser.action('getPageState', {
    url: ctx.page.url()
  });

  try {
    const stateSnapshot = await getPageState(ctx.page) as PageState;
    
    // If page is navigating, we should wait and retry
    if (stateSnapshot.isNavigating) {
      logger.info("Page is navigating, waiting briefly before proceeding");
      
      // Add a brief delay before continuing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Store minimal state for now
      ctx.previousPageState = {
        ...ctx.previousPageState,
        url: stateSnapshot.url,
        title: stateSnapshot.title,
        isNavigating: true
      };
      
      return "chooseAction"; // Continue with the automation flow
    }
    
    // Regular flow for stable page
    detectProgress(ctx, ctx.previousPageState, stateSnapshot);
    ctx.previousPageState = stateSnapshot;
    checkMilestones(ctx, stateSnapshot);
    
    return "chooseAction";
  } catch (error) {
    logger.error("Error in pageStateHandler", { error });
    
    // Even if we fail, update minimal state to avoid getting stuck
    let currentUrl = "unknown";
    let currentTitle = "unknown";
    
    try {
      currentUrl = await ctx.page.url();
    } catch (e) {
      currentUrl = ctx.previousPageState?.url || "unknown";
    }
    
    try {
      currentTitle = await ctx.page.title();
    } catch (e) {
      currentTitle = ctx.previousPageState?.title || "unknown";
    }
    
    ctx.previousPageState = {
      ...ctx.previousPageState,
      url: currentUrl,
      title: currentTitle,
      error: error instanceof Error ? error.message : "Unknown error"
    };
    
    return "chooseAction";
  }
}
