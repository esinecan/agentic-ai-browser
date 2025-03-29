import { GraphContext } from '../../browserExecutor.js';
import logger from '../../utils/logger.js';

/**
 * Interface representing a page state
 */
export interface PageState {
  url: string;
  title: string;
  domSnapshot?: any;
  isNavigating?: boolean;  // Add this property
}

/**
 * Detect progress between page states
 */
export function detectProgress(ctx: GraphContext, previousState: PageState | null, currentState: PageState | null): void {
  // No previous state to compare against
  if (!previousState || !currentState) return;
  
  // Check for meaningful changes that indicate progress
  const indicators: string[] = [];
  
  // URL changed - significant progress
  if (previousState.url !== currentState.url) {
    indicators.push(`navigated from ${previousState.url} to ${currentState.url}`);
  }
  
  // Title changed - likely progress
  if (previousState.title !== currentState.title) {
    indicators.push(`page title changed from "${previousState.title}" to "${currentState.title}"`);
  }
  
  // New elements appeared
  const prevInputCount = previousState.domSnapshot?.inputs?.length || 0;
  const currentInputCount = currentState.domSnapshot?.inputs?.length || 0;
  if (currentInputCount > prevInputCount) {
    indicators.push(`new input fields appeared`);
  }
  
  // Check for new buttons
  const prevButtonCount = previousState.domSnapshot?.buttons?.length || 0;
  const currentButtonCount = currentState.domSnapshot?.buttons?.length || 0;
  if (currentButtonCount > prevButtonCount) {
    indicators.push(`new buttons appeared`);
  }
  
  // Check for new links
  const prevLinkCount = previousState.domSnapshot?.links?.length || 0;
  const currentLinkCount = currentState.domSnapshot?.links?.length || 0;
  if (currentLinkCount > prevLinkCount) {
    indicators.push(`new links appeared`);
  }
  
  if (indicators.length > 0) {
    ctx.actionFeedback = `🎉 Great progress! You've ${indicators.join(' and ')}. You're moving closer to the goal!`;
    logger.info('Progress detected', { indicators });
  }
}

/**
 * Calculate progress percentage toward goal completion
 */
export function calculateProgressPercentage(ctx: GraphContext): number {
  if (!ctx.milestones || !ctx.recognizedMilestones || ctx.milestones.length === 0) {
    return 0;
  }
  
  const completedCount = ctx.recognizedMilestones.length;
  const totalMilestones = ctx.milestones.length;
  
  return Math.min(100, Math.round((completedCount / totalMilestones) * 100));
}

/**
 * Check if we're making progress or getting stuck
 */
export function isStuck(ctx: GraphContext): boolean {
  const recentFailures = ctx.retries || 0;
  // Ensure hasManyRepeatActions is always a boolean by using !! 
  const hasManyRepeatActions = !!(
    ctx.actionHistory && 
    ctx.actionHistory.length >= 5 && 
    new Set(ctx.actionHistory.slice(-5).map(a => `${a.type}:${a.element || a.value}`)).size <= 2
  );
  
  return recentFailures >= 3 || hasManyRepeatActions;
}

/**
 * Get a summary of progress so far
 */
export function getProgressSummary(ctx: GraphContext): string {
  const percentage = calculateProgressPercentage(ctx);
  const completedMilestones = ctx.recognizedMilestones?.length || 0;
  const totalMilestones = ctx.milestones?.length || 0;
  
  return `Progress: ${percentage}% (${completedMilestones}/${totalMilestones} milestones)`;
}
