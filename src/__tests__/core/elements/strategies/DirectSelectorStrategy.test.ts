import { DirectSelectorStrategy } from '../../../../core/elements/strategies/DirectSelectorStrategy.js';
import { ElementContext } from '../../../../core/elements/types.js';
import { Action } from '../../../../core/actions/types.js';
import { Page } from 'playwright';

describe('DirectSelectorStrategy', () => {
  // Create a mock page with appropriate responses
  const createMockPage = () => {
    const mockPage = {
      locator: jest.fn().mockReturnValue({
        first: jest.fn().mockReturnValue({
          elementHandle: jest.fn().mockImplementation((options) => {
            // Simulate finding element for "#submit-button" but not for "#nonexistent"
            if (mockSelector === '#submit-button') {
              return Promise.resolve({
                // Mock methods that might be called on element handles
                evaluate: jest.fn()
              });
            } else {
              return Promise.reject(new Error('Element not found'));
            }
          })
        })
      }),
      $: jest.fn().mockImplementation(selector => {
        if (selector === '#submit-button') {
          return Promise.resolve({});
        }
        return Promise.resolve(null);
      })
    };
    
    let mockSelector = '';
    // Capture the selector being looked for
    const originalLocator = mockPage.locator;
    mockPage.locator = jest.fn().mockImplementation((selector) => {
      mockSelector = selector;
      return originalLocator(selector);
    });
    
    return mockPage as unknown as Page;
  };
  
  // Create context for tests
  const createContext = (): ElementContext => ({
    previousAttempts: [],
    startTime: Date.now(),
    timeoutPerStrategy: 1000
  });
  
  test('canHandle returns true for any element', async () => {
    // Arrange
    const strategy = new DirectSelectorStrategy();
    const mockPage = createMockPage();
    const action: Action = {
      type: 'click',
      element: '#submit-button',
      selectorType: 'css',
      maxWait: 1000
    };
    
    // Act
    const result = await strategy.canHandle(mockPage, action);
    
    // Assert
    expect(result).toBe(true);
  });
  
  test('findElement returns ElementHandle for existing element', async () => {
    // Arrange
    const strategy = new DirectSelectorStrategy();
    const mockPage = createMockPage();
    const action: Action = {
      type: 'click',
      element: '#submit-button',
      selectorType: 'css',
      maxWait: 1000
    };
    const context = createContext();
    
    // Act
    const result = await strategy.findElement(mockPage, action, context);
    
    // Assert
    expect(result).toBeTruthy();
    expect(mockPage.locator).toHaveBeenCalledWith('#submit-button');
  });
  
  test('findElement returns null for non-existent element', async () => {
    // Arrange
    const strategy = new DirectSelectorStrategy();
    const mockPage = createMockPage();
    const action: Action = {
      type: 'click',
      element: '#nonexistent',
      selectorType: 'css',
      maxWait: 1000
    };
    const context = createContext();
    
    // Act & Assert
    // The test will use the mock implementation that rejects for #nonexistent
    await expect(strategy.findElement(mockPage, action, context)).resolves.toBeNull();
  });
  
  test('findElement handles missing element in action', async () => {
    // Arrange
    const strategy = new DirectSelectorStrategy();
    const mockPage = createMockPage();
    const action: Action = {
      type: 'click',
      selectorType: 'css',
      maxWait: 1000
    };
    const context = createContext();
    
    // Act
    const result = await strategy.findElement(mockPage, action, context);
    
    // Assert
    expect(result).toBeNull();
  });
});
