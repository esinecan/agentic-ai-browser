import { 
  registerState, 
  states, 
  isRedundantAction, 
  generateActionFeedback,
  shuffleArray,
  StateHandler
} from '../../core/automation/machine.js';
import { Action } from '../../core/actions/types.js';
import { GraphContext } from '../../browserExecutor.js';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { createMockStateHandler } from '../utils/mocks.js';

describe('State Machine', () => {
  beforeEach(() => {
    // Clear any previously registered states to start fresh
    Object.keys(states).forEach(key => {
      delete states[key];
    });
  });
  
  test('registerState registers handler in states map', async () => {
    // Arrange
    const stateName = 'testState';
    const handler = jest.fn().mockImplementation(async () => 'nextState');
    
    // Act
    registerState(stateName, handler as StateHandler);
    
    // Assert
    expect(states).toHaveProperty(stateName);
    expect(states[stateName]).toEqual(handler);
  });
  
  test('state handler can be executed', async () => {
    // Arrange
    const stateName = 'testState';
    const nextState = 'nextState';
    const handler = jest.fn().mockImplementation(async () => nextState);
    registerState(stateName, handler as StateHandler);
    const mockContext = {} as GraphContext;
    
    // Act
    const result = await states[stateName](mockContext);
    
    // Assert
    expect(result).toBe(nextState);
    expect(handler).toHaveBeenCalledWith(mockContext);
  });
});

describe('Action Redundancy Detection', () => {
  test('detects redundant click actions', () => {
    // Arrange
    const currentAction: Action = {
      type: 'click',
      element: '#submit-button',
      selectorType: 'css',
      maxWait: 1000
    };
    
    const history: Action[] = [
      { type: 'click', element: '#submit-button', selectorType: 'css', maxWait: 1000 },
      { type: 'click', element: '#submit-button', selectorType: 'css', maxWait: 1000 }
    ];
    
    // Act
    const result = isRedundantAction(currentAction, history);
    
    // Assert
    expect(result).toBe(true);
  });
  
  test('detects redundant input actions', () => {
    // Arrange
    const currentAction: Action = {
      type: 'input',
      element: '#search',
      value: 'test query',
      selectorType: 'css',
      maxWait: 1000
    };
    
    const history: Action[] = [
      { type: 'input', element: '#search', value: 'test query', selectorType: 'css', maxWait: 1000 },
      { type: 'input', element: '#search', value: 'test query', selectorType: 'css', maxWait: 1000 }
    ];
    
    // Act
    const result = isRedundantAction(currentAction, history);
    
    // Assert
    expect(result).toBe(true);
  });
  
  test('does not flag different actions as redundant', () => {
    // Arrange
    const currentAction: Action = {
      type: 'click',
      element: '#submit-button',
      selectorType: 'css',
      maxWait: 1000
    };
    
    const history: Action[] = [
      { type: 'click', element: '#other-button', selectorType: 'css', maxWait: 1000 },
      { type: 'navigate', value: 'https://example.com', selectorType: 'css', maxWait: 1000 }
    ];
    
    // Act
    const result = isRedundantAction(currentAction, history);
    
    // Assert
    expect(result).toBe(false);
  });
  
  test('generates feedback for redundant actions', () => {
    // Arrange
    const mockContext = {
      actionHistory: [
        { type: 'click', element: '#submit-button', selectorType: 'css', maxWait: 1000 },
        { type: 'click', element: '#submit-button', selectorType: 'css', maxWait: 1000 },
        { type: 'click', element: '#submit-button', selectorType: 'css', maxWait: 1000 }
      ]
    } as GraphContext;
    
    // Act
    const feedback = generateActionFeedback(mockContext);
    
    // Assert
    expect(feedback).toContain('NOTICE:');
    expect(feedback).toContain('#submit-button');
  });
  
  test('shuffleArray randomizes array order', () => {
    // Arrange
    const originalArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    // Act
    const shuffledArray = shuffleArray([...originalArray]);
    
    // Assert
    expect(shuffledArray).toHaveLength(originalArray.length);
    expect(shuffledArray).toContain(originalArray[0]); // All elements should be preserved
    
    // The probability of the shuffled array being identical to the original is extremely low
    // This is a probabilistic test, but with 10 elements, it's very unlikely to fail
    const isIdentical = originalArray.every((val, idx) => val === shuffledArray[idx]);
    expect(isIdentical).toBe(false);
  });
});
