import { GraphContext } from "../../../browserExecutor.js";
import logger from "../../../utils/logger.js";

// Maximum allowed retries before giving up
const MAX_RETRIES = 7;

export async function handleFailureHandler(ctx: GraphContext): Promise<string> {
  logger.error('Action failure', {
    retries: ctx.retries,
    lastAction: ctx.action,
    url: ctx.page?.url()
  });

  ctx.lastActionSuccess = false;
  ctx.successCount = 0;
  ctx.retries = (ctx.retries || 0) + 1;

  if (ctx.retries > MAX_RETRIES) {
    logger.error('Max retries exceeded', {
      maxRetries: MAX_RETRIES,
      totalActions: ctx.actionHistory?.length
    });
    return "terminate";
  }

  return "chooseAction";
}
