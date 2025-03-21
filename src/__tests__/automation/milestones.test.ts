import { 
  initializeMilestones, 
  checkMilestones, 
  hasMilestone,
  getNextMilestone 
} from '../../core/automation/milestones.js';
import { GraphContext } from '../../browserExecutor.js';
import { Action } from '../../core/actions/types.js';

describe('Milestone Tracking', () => {
  describe('initializeMilestones', () => {
    test('initializes search-related milestones', () => {
      // Arrange
      const ctx = {
        userGoal: 'search for chocolate cake recipes'
      } as GraphContext;
      
      // Act
      initializeMilestones(ctx);
      
      // Assert
      expect(ctx.milestones).toContain('reach_search_page');
      expect(ctx.milestones).toContain('enter_search_query');
      expect(ctx.milestones).toContain('submit_search');
      expect(ctx.milestones).toContain('review_search_results');
      expect(ctx.recognizedMilestones).toEqual([]);
    });
    
    test('initializes login-related milestones', () => {
      // Arrange
      const ctx = {
        userGoal: 'login to my account'
      } as GraphContext;
      
      // Act
      initializeMilestones(ctx);
      
      // Assert
      expect(ctx.milestones).toContain('reach_login_page');
      expect(ctx.milestones).toContain('enter_credentials');
      expect(ctx.milestones).toContain('submit_login');
      expect(ctx.milestones).toContain('login_successful');
      expect(ctx.recognizedMilestones).toEqual([]);
    });
    
    test('includes generic milestones for any goal', () => {
      // Arrange
      const ctx = {
        userGoal: 'do something random'
      } as GraphContext;
      
      // Act
      initializeMilestones(ctx);
      
      // Assert
      expect(ctx.milestones).toContain('initial_navigation');
      expect(ctx.milestones).toContain('page_interaction');
      expect(ctx.milestones).toContain('goal_completion');
      expect(ctx.recognizedMilestones).toEqual([]);
    });
  });

  describe('checkMilestones', () => {
    test('recognizes search page milestone', () => {
      // Arrange
      const ctx = {
        milestones: ['reach_search_page'],
        recognizedMilestones: [],
        history: []
      } as GraphContext;
      
      const state = {
        url: 'https://example.com/search',
        title: 'Search Page'
      };
      
      // Act
      checkMilestones(ctx, state);
      
      // Assert
      expect(ctx.recognizedMilestones).toContain('reach_search_page');
      expect(ctx.actionFeedback).toContain('Milestone achieved');
    });
    
    test('recognizes login page milestone', () => {
      // Arrange
      const ctx = {
        milestones: ['reach_login_page'],
        recognizedMilestones: [],
        history: []
      } as GraphContext;
      
      const state = {
        url: 'https://example.com/login',
        title: 'Sign In'
      };
      
      // Act
      checkMilestones(ctx, state);
      
      // Assert
      expect(ctx.recognizedMilestones).toContain('reach_login_page');
      expect(ctx.actionFeedback).toContain('Milestone achieved');
    });
    
    test('recognizes search query milestone after search page', () => {
      // Arrange
      const ctx = {
        milestones: ['reach_search_page', 'enter_search_query'],
        recognizedMilestones: ['reach_search_page'],
        action: { type: 'input' } as Action,
        history: []
      } as GraphContext;
      
      const state = {
        url: 'https://example.com/search',
        title: 'Search Page'
      };
      
      // Act
      checkMilestones(ctx, state);
      
      // Assert
      expect(ctx.recognizedMilestones).toContain('enter_search_query');
      expect(ctx.actionFeedback).toContain('Milestone achieved');
    });
    
    test('milestones are sequential for search flow', () => {
      // Arrange
      const ctx = {
        milestones: ['reach_search_page', 'enter_search_query', 'submit_search'],
        recognizedMilestones: ['reach_search_page'],
        action: { type: 'input' } as Action,
        history: []
      } as GraphContext;
      
      const state = {
        url: 'https://example.com/search',
        title: 'Search Page'
      };
      
      // Act
      // First check for enter_search_query
      checkMilestones(ctx, state);
      
      // Update action to test submit_search
      ctx.action = { type: 'click' } as Action;
      checkMilestones(ctx, state);
      
      // Assert
      expect(ctx.recognizedMilestones).toContain('enter_search_query');
      expect(ctx.recognizedMilestones).toContain('submit_search');
    });
  });
  
  describe('hasMilestone', () => {
    test('returns true for achieved milestones', () => {
      // Arrange
      const ctx = {
        recognizedMilestones: ['reach_search_page', 'enter_search_query']
      } as GraphContext;
      
      // Act & Assert
      expect(hasMilestone(ctx, 'reach_search_page')).toBe(true);
      expect(hasMilestone(ctx, 'enter_search_query')).toBe(true);
      expect(hasMilestone(ctx, 'submit_search')).toBe(false);
    });
    
    test('returns false when no milestones exist', () => {
      // Arrange
      const ctx = {} as GraphContext;
      
      // Act & Assert
      expect(hasMilestone(ctx, 'any_milestone')).toBe(false);
    });
  });
  
  describe('getNextMilestone', () => {
    test('returns the next unachieved milestone', () => {
      // Arrange
      const ctx = {
        milestones: ['milestone1', 'milestone2', 'milestone3'],
        recognizedMilestones: ['milestone1']
      } as GraphContext;
      
      // Act
      const result = getNextMilestone(ctx);
      
      // Assert
      expect(result).toBe('milestone2');
    });
    
    test('returns null when all milestones are achieved', () => {
      // Arrange
      const ctx = {
        milestones: ['milestone1', 'milestone2'],
        recognizedMilestones: ['milestone1', 'milestone2']
      } as GraphContext;
      
      // Act
      const result = getNextMilestone(ctx);
      
      // Assert
      expect(result).toBeNull();
    });
    
    test('returns null when no milestones exist', () => {
      // Arrange
      const ctx = {} as GraphContext;
      
      // Act
      const result = getNextMilestone(ctx);
      
      // Assert
      expect(result).toBeNull();
    });
  });
});
