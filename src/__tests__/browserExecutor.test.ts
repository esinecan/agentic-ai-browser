import { jest } from '@jest/globals';
import { 
  textSimilarity, 
  compressHistory, 
  ActionSchema,
  doRetry
} from '../browserExecutor.js';
import logger from '../utils/logger.js';

// Mock the logger
jest.mock('../utils/logger.js', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    browser: {
      action: jest.fn(),
      error: jest.fn()
    }
  }
}));

// We'll avoid directly mocking Playwright to prevent TypeScript errors
jest.mock('playwright', () => {
  return {
    chromium: {
      launch: jest.fn().mockImplementation(() => Promise.resolve({}))
    }
  };
});

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

describe('browserExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HEADLESS = 'false';
    process.env.START_URL = 'https://example.com';
  });

  describe('Pure functions', () => {
    describe('textSimilarity', () => {
      test('should return 1 for identical strings', () => {
        const result = textSimilarity('test', 'test');
        expect(result).toBe(1);
      });
      
      test('should return 0 for different strings', () => {
        const result = textSimilarity('test', 'different');
        expect(result).toBe(0);
      });
    });

    describe('compressHistory', () => {
      test('should not modify history if it is shorter than max items', () => {
        const history = ['Action 1', 'Action 2', 'Action 3'];
        const result = compressHistory(history, 5);
        expect(result).toEqual(history);
      });
      
      test('should compress history when it exceeds max items', () => {
        const history = [
          'Navigated to: https://example.com',
          'Clicked button#submit successfully',
          'Clicked button#submit successfully',
          'Clicked button#submit successfully',
          'Input \'test\' to input#search',
          'Input \'test\' to input#search',
          'Navigated to: https://example.com/result'
        ];
        
        const result = compressHistory(history, 5);
        
        // General checks
        expect(result[0]).toBe('Navigated to: https://example.com');
        expect(result).toContain('Navigated to: https://example.com/result');
      });

      test('should return empty array if history is empty', () => {
        const result = compressHistory([], 5);
        expect(result).toEqual([]);
      });
      
    });

    describe('ActionSchema', () => {
      test('should validate valid action', () => {
        const validAction = {
          type: 'click',
          element: '#button',
          selectorType: 'css',
          maxWait: 5000
        };
        
        const result = ActionSchema.safeParse(validAction);
        expect(result.success).toBe(true);
      });
      
      test('should reject invalid action type', () => {
        const invalidAction = {
          // @ts-ignore - intentionally using an invalid type for testing
          type: 'invalid',
          element: '#button'
        };
        
        const result = ActionSchema.safeParse(invalidAction);
        expect(result.success).toBe(false);
      });
      
      test('should apply default values', () => {
        const minimalAction = {
          type: 'click',
          element: '#button'
        };
        
        const result = ActionSchema.safeParse(minimalAction);
        
        if (result.success) {
          expect(result.data.selectorType).toBe('css');
          expect(result.data.maxWait).toBe(2000);
        } else {
          fail('Action schema validation failed');
        }
      });
    });
  });

  describe('doRetry', () => {
    test('should retry failed function', async () => {
      let attempts = 0;
      const testFn = async () => {
        attempts++;
        if (attempts < 3) throw new Error(`Fail ${attempts}`);
        return 'success';
      };
      
      const result = await doRetry(testFn, 3, 10);
      
      expect(attempts).toBe(3);
      expect(result).toBe('success');
    });
    
    test('should throw if all retries fail', async () => {
      const testFn = async () => {
        throw new Error('Persistent failure');
      };
      
      await expect(doRetry(testFn, 2, 10)).rejects.toThrow('Persistent failure');
    });

    test('should retry failed API call', async () => {
        let attempts = 0;
        const mockApiCall = async () => {
          attempts++;
          if (attempts < 2) throw new Error(`Timeout on attempt ${attempts}`);
          return 'API Success';
        };
      
        const result = await doRetry(mockApiCall, 3, 10);
      
        expect(attempts).toBe(2);
        expect(result).toBe('API Success');
      });      
  });
});