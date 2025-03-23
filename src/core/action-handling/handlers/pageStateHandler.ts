import { GraphContext, getPageState } from "../../../browserExecutor.js";
import { PageState, detectProgress } from "../../../core/automation/progress.js";
import { checkMilestones } from "../../../core/automation/milestones.js";
import logger from "../../../utils/logger.js";

export async function getPageStateHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page) throw new Error("Page not initialized");
  
  logger.browser.action('getPageState', {
    url: ctx.page.url()
  });

  const stateSnapshot = await getPageState(ctx.page) as PageState;
  detectProgress(ctx, ctx.previousPageState, stateSnapshot);
  ctx.previousPageState = stateSnapshot;
  checkMilestones(ctx, stateSnapshot);

  return "chooseAction";
}
