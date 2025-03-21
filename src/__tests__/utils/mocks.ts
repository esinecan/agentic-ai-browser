/**
 * UTILITY FILE - NOT A TEST
 * This file contains mock utilities for testing
 */

import { jest } from '@jest/globals';
import { StateHandler } from '../../core/automation/machine.js';
import { GraphContext } from '../../browserExecutor.js';

/**
 * Create a mock state handler with proper typing
 */
export function createMockStateHandler(returnValue: string): StateHandler {
  // Use a regular function first, then cast it to StateHandler
  // This avoids the TypeScript error with jest.fn()
  const handler = async (ctx: GraphContext): Promise<string> => {
    return returnValue;
  };
  
  // Spy on the function to enable jest assertions
  const spyHandler = jest.fn(handler);
  
  // Return with the correct type
  return spyHandler as unknown as StateHandler;
}
