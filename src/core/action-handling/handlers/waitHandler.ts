import { GraphContext } from "../../../browserExecutor.js";
import logger from "../../../utils/logger.js";

export async function waitHandler(ctx: GraphContext): Promise<string> {
  const waitTime = ctx.action?.maxWait || 3000;

  logger.browser.action('wait', {
    duration: waitTime
  });

  try {
    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    ctx.successfulActions?.push(`wait:${waitTime}ms`);
    
    ctx.actionFeedback = `✅ Successfully waited for ${waitTime}ms.` +
      (ctx.successCount > 1 ? ` You've had ${ctx.successCount} successful actions in a row.` : '');
    
    ctx.history.push(`Waiting for ${waitTime}ms`);
    
    await new Promise(resolve => setTimeout(resolve, waitTime));

    logger.info("Wait completed", {
      duration: waitTime,
      successCount: ctx.successCount
    });

    return "chooseAction";
  } catch (error) {
    logger.browser.error("wait", {
      error,
      duration: waitTime
    });

    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.history.push(`Wait failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return "handleFailure";
  }
}
