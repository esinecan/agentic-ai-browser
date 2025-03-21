import { GraphContext } from '../../browserExecutor.js';
import logger from '../../utils/logger.js';

// Initialize milestones based on the user goal
export function initializeMilestones(ctx: GraphContext): void {
  if (!ctx.milestones) {
    ctx.milestones = [];
    ctx.recognizedMilestones = [];
    
    // Example milestone detection based on common goals
    if (ctx.userGoal?.toLowerCase().includes('search')) {
      ctx.milestones.push(
        'reach_search_page',
        'enter_search_query',
        'submit_search',
        'review_search_results'
      );
    } else if (ctx.userGoal?.toLowerCase().includes('login') || ctx.userGoal?.toLowerCase().includes('sign in')) {
      ctx.milestones.push(
        'reach_login_page',
        'enter_credentials',
        'submit_login',
        'login_successful'
      );
    } else if (ctx.userGoal?.toLowerCase().includes('purchase') || ctx.userGoal?.toLowerCase().includes('buy')) {
      ctx.milestones.push(
        'reach_product',
        'add_to_cart',
        'proceed_to_checkout',
        'enter_payment_info',
        'complete_purchase'
      );
    } else if (ctx.userGoal?.toLowerCase().includes('form')) {
      ctx.milestones.push(
        'find_form',
        'fill_form_fields',
        'submit_form',
        'form_submission_successful'
      );
    }
    
    // Add generic milestones for any goal
    ctx.milestones.push(
      'initial_navigation',
      'page_interaction',
      'goal_completion'
    );
    
    logger.debug('Milestones initialized', { milestones: ctx.milestones });
  }
}

// Check for milestone completion after each page state update
export function checkMilestones(ctx: GraphContext, state: any): void {
  if (!ctx.milestones || !ctx.recognizedMilestones) return;
  
  // Check for search-related milestones
  if (ctx.milestones.includes('reach_search_page') && 
      !ctx.recognizedMilestones.includes('reach_search_page')) {
    
    if (state.url?.includes('search') || 
        state.title?.toLowerCase().includes('search') || 
        state.domSnapshot?.inputs?.some((input: any) => 
          typeof input === 'string' && 
          (input.includes('search') || input.includes('query'))
        )) {
      ctx.recognizedMilestones.push('reach_search_page');
      ctx.actionFeedback = `🏆 Milestone achieved: You've successfully reached the search page! Great job!`;
      logger.info('Milestone achieved: reach_search_page');
    }
  }
  
  if (ctx.milestones.includes('enter_search_query') && 
      !ctx.recognizedMilestones.includes('enter_search_query') &&
      ctx.recognizedMilestones.includes('reach_search_page') &&
      ctx.action?.type === 'input') {
    
    ctx.recognizedMilestones.push('enter_search_query');
    ctx.actionFeedback = `🏆 Milestone achieved: You've entered a search query! Moving right along!`;
    logger.info('Milestone achieved: enter_search_query');
  }
  
  if (ctx.milestones.includes('submit_search') && 
      !ctx.recognizedMilestones.includes('submit_search') &&
      ctx.recognizedMilestones.includes('enter_search_query') &&
      (ctx.action?.type === 'click' || ctx.action?.type === 'navigate')) {
    
    ctx.recognizedMilestones.push('submit_search');
    ctx.actionFeedback = `🏆 Milestone achieved: You've submitted your search! Let's see what we find!`;
    logger.info('Milestone achieved: submit_search');
  }
  
  // Check for login-related milestones
  if (ctx.milestones.includes('reach_login_page') && 
      !ctx.recognizedMilestones.includes('reach_login_page')) {
    
    if (state.url?.includes('login') || 
        state.url?.includes('signin') ||
        state.title?.toLowerCase().includes('login') || 
        state.title?.toLowerCase().includes('sign in')) {
      
      ctx.recognizedMilestones.push('reach_login_page');
      ctx.actionFeedback = `🏆 Milestone achieved: You've successfully reached the login page!`;
      logger.info('Milestone achieved: reach_login_page');
    }
  }
  
  // Check for form-related milestones
  if (ctx.milestones.includes('find_form') && 
      !ctx.recognizedMilestones.includes('find_form')) {
    
    const hasForm = state.domSnapshot?.elements?.forms?.length > 0;
    if (hasForm) {
      ctx.recognizedMilestones.push('find_form');
      ctx.actionFeedback = `🏆 Milestone achieved: You've found a form to fill out!`;
      logger.info('Milestone achieved: find_form');
    }
  }
  
  // Check for generic milestones
  if (ctx.milestones.includes('initial_navigation') && 
      !ctx.recognizedMilestones.includes('initial_navigation')) {
    
    if (ctx.action?.type === 'navigate' || ctx.history?.length > 3) {
      ctx.recognizedMilestones.push('initial_navigation');
      ctx.actionFeedback = `🏆 Milestone achieved: Initial navigation complete! You're on your way!`;
      logger.info('Milestone achieved: initial_navigation');
    }
  }
  
  if (ctx.milestones.includes('page_interaction') && 
      !ctx.recognizedMilestones.includes('page_interaction')) {
    
    if ((ctx.action?.type === 'click' || ctx.action?.type === 'input') && ctx.lastActionSuccess) {
      ctx.recognizedMilestones.push('page_interaction');
      ctx.actionFeedback = `🏆 Milestone achieved: Successful page interaction! You're making progress!`;
      logger.info('Milestone achieved: page_interaction');
    }
  }
}

/**
 * Check if a specific milestone has been achieved
 */
export function hasMilestone(ctx: GraphContext, milestone: string): boolean {
  if (!ctx.recognizedMilestones) return false;
  return ctx.recognizedMilestones.includes(milestone);
}

/**
 * Get the next milestone to achieve
 */
export function getNextMilestone(ctx: GraphContext): string | null {
  if (!ctx.milestones || !ctx.recognizedMilestones) return null;
  
  for (const milestone of ctx.milestones) {
    if (!ctx.recognizedMilestones.includes(milestone)) {
      return milestone;
    }
  }
  
  return null;
}
