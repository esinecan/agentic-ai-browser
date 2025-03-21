import { GraphContext } from "../../../browserExecutor.js";
import { getAgentState } from "../../../utils/agentState.js";
import logger from "../../../utils/logger.js";

export async function terminateHandler(ctx: GraphContext): Promise<string> {
  logger.info('Terminating session', {
    metrics: {
      totalActions: ctx.actionHistory?.length,
      successfulActions: ctx.successfulActions?.length,
      duration: Date.now() - (ctx.startTime || Date.now())
    },
    milestones: ctx.recognizedMilestones
  });

  const agentState = getAgentState();
  agentState.clearStop();

  if (ctx.browser) {
    await ctx.browser.close();
  }
  return "terminated";
}
