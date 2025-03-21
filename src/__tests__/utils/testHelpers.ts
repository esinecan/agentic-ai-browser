/**
 * UTILITY FILE - NOT A TEST
 * This file contains helper utilities for testing
 */

import { Page, Browser, ElementHandle, Keyboard } from 'playwright';
import { GraphContext } from '../../browserExecutor.js';
import { Action } from '../../core/actions/types.js';

/**
 * Create a mock Page object for testing
 */
export function createMockPage(options: {
  url?: string;
  title?: string;
  content?: string;
  selectors?: Record<string, any>;
} = {}): Page {
  // Default values
  const url = options.url || 'https://example.com';
  const title = options.title || 'Example Page';
  const content = options.content || '<html><body><h1>Example</h1></body></html>';
  const selectors = options.selectors || {};
  
  // Create a complete mock keyboard
  const mockKeyboard: Partial<Keyboard> = {
    press: jest.fn().mockResolvedValue(undefined),
    type: jest.fn().mockResolvedValue(undefined),
    down: jest.fn().mockResolvedValue(undefined),
    up: jest.fn().mockResolvedValue(undefined),
    insertText: jest.fn().mockResolvedValue(undefined)
  };
  
  // Create mock page
  const mockPage: Partial<Page> = {
    url: jest.fn().mockReturnValue(url),
    title: jest.fn().mockResolvedValue(title),
    content: jest.fn().mockResolvedValue(content),
    goto: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue({}),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
    keyboard: mockKeyboard as Keyboard,
    
    // Element selection
    $: jest.fn().mockImplementation(selector => {
      if (selectors[selector] || selector === '#exist') {
        return Promise.resolve({
          evaluate: jest.fn(),
          click: jest.fn().mockResolvedValue(undefined),
          fill: jest.fn().mockResolvedValue(undefined),
          inputValue: jest.fn().mockResolvedValue('test'),
          getAttribute: jest.fn().mockImplementation(attr => attr === 'href' ? 'https://example.com' : '')
        } as unknown as ElementHandle);
      }
      return Promise.resolve(null);
    }),
    
    // Multiple element selection
    $$: jest.fn().mockImplementation(selector => {
      if (selector.includes('exist')) {
        return Promise.resolve([
          { evaluate: jest.fn() } as unknown as ElementHandle,
          { evaluate: jest.fn() } as unknown as ElementHandle
        ]);
      }
      return Promise.resolve([]);
    }),
    
    // Evaluation in page context
    evaluate: jest.fn().mockImplementation((fn, ...args) => {
      // If function is passed, simulate executing it
      if (typeof fn === 'function') {
        try {
          return fn(...args);
        } catch (e) {
          return null;
        }
      }
      // Otherwise return some default data
      return { found: true, count: 1 };
    }),
    
    // Locators
    locator: jest.fn().mockReturnValue({
      first: jest.fn().mockReturnValue({
        elementHandle: jest.fn().mockResolvedValue({
          click: jest.fn().mockResolvedValue(undefined)
        }),
        click: jest.fn().mockResolvedValue(undefined)
      }),
      count: jest.fn().mockResolvedValue(1)
    }),
    
    // Role-based selectors
    getByRole: jest.fn().mockReturnValue({
      first: jest.fn().mockReturnValue({
        elementHandle: jest.fn().mockResolvedValue({})
      }),
      count: jest.fn().mockResolvedValue(1)
    })
  };
  
  return mockPage as unknown as Page;
}

/**
 * Create a mock Browser object for testing
 */
export function createMockBrowser(mockPage?: Page): Browser {
  const page = mockPage || createMockPage();
  
  const mockBrowser: Partial<Browser> = {
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true)
  };
  
  return mockBrowser as unknown as Browser;
}

/**
 * Create a GraphContext for testing
 */
export function createTestContext(options: {
  userGoal?: string;
  history?: string[];
  page?: Page;
  browser?: Browser;
  action?: Action;
} = {}): GraphContext {
  const mockPage = options.page || createMockPage();
  const mockBrowser = options.browser || createMockBrowser(mockPage);
  
  return {
    userGoal: options.userGoal || 'Test the application',
    history: options.history || [],
    page: mockPage,
    browser: mockBrowser,
    action: options.action,
    actionHistory: [],
    successfulActions: [],
    lastActionSuccess: false,
    successCount: 0,
    retries: 0,
    milestones: [],
    recognizedMilestones: [],
    startTime: Date.now()
  };
}

/**
 * Wait for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
