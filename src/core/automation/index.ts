// Export main components from the automation framework

// State machine exports
export { 
  runStateMachine, 
  registerState, 
  isRedundantAction, 
  generateActionFeedback,
  shuffleArray,
  StateHandler
} from './machine.js';

// Context management
export { ContextManager } from './context.js';

// Milestone tracking
export { 
  initializeMilestones, 
  checkMilestones,
  hasMilestone,
  getNextMilestone 
} from './milestones.js';

// Progress tracking
export { 
  detectProgress,
  calculateProgressPercentage,
  isStuck,
  getProgressSummary,
  PageState
} from './progress.js';
