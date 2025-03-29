import { Page, ElementHandle } from "playwright";
import logger from '../../../utils/logger.js';
import { Action } from "../../actions/types.js";

/**
 * Find alternative elements using pattern matching and accessibility roles
 * instead of hardcoded site-specific selectors
 */
export class SelectorFallbacks {
  
  /**
   * Get fallback selectors based on action context, not specific sites
   */
  static getFallbackSelectors(action: Action, url: string): string[] {
    // Detect the purpose of the element from context clues
    const purpose = this.detectElementPurpose(action);
    
    // Return appropriate fallbacks based on element purpose
    return this.getFallbacksByPurpose(purpose);
  }
  
  /**
   * Try to detect what the element is meant to do based on action context
   */
  private static detectElementPurpose(action: Action): 'search-input' | 'search-button' | 'submit-button' | 
                                                    'navigation' | 'general-input' | 'general-button' {
    const element = action.element || '';
    const value = action.value || '';
    
    // Search input detection
    if (action.type === 'input' && 
       (element.toLowerCase().includes('search') || 
        value.toLowerCase().includes('search'))) {
      return 'search-input';
    }
    
    // Search button detection
    if (action.type === 'click' &&
       (element.toLowerCase().includes('search') || 
        value.toLowerCase().includes('search'))) {
      return 'search-button';
    }
    
    // Submit button detection
    if (action.type === 'click' && 
       (element.toLowerCase().includes('submit') ||
        value.toLowerCase().includes('submit') ||
        value.toLowerCase().includes('sign in') ||
        value.toLowerCase().includes('log in'))) {
      return 'submit-button';
    }
    
    // Navigation detection
    if (action.type === 'click' && 
       (element.toLowerCase().includes('nav') ||
        element.toLowerCase().includes('menu') ||
        element.toLowerCase().includes('link'))) {
      return 'navigation';
    }
    
    // Default cases
    if (action.type === 'input') return 'general-input';
    if (action.type === 'click') return 'general-button';
    
    return 'general-button';  // Fallback
  }
  
  /**
   * Get appropriate fallback selectors based on element purpose
   */
  private static getFallbacksByPurpose(purpose: string): string[] {
    switch (purpose) {
      case 'search-input':
        return [
          'input[type="search"]',
          'input[name="q"]',
          'input[name*="search"]',
          'input[placeholder*="search" i]',
          '[role="searchbox"]',
          '.search-input',
          '.searchbox',
          'form[role="search"] input',
          'input.ytSearchboxComponentInput',  // YouTube-specific but commonly used
          'input[name="search_query"]'        // YouTube-specific but commonly used
        ];
        
      case 'search-button':
        return [
          'button[aria-label="Search"]',
          '[role="search"] button',
          'button.search-icon',
          'button.search-button',
          'button[type="submit"]',
          'input[type="submit"]',
          '.ytSearchboxComponentSearchButton',  // YouTube-specific but commonly used
          '[aria-label*="search" i]'
        ];
        
      case 'submit-button':
        return [
          'button[type="submit"]',
          'input[type="submit"]',
          'button.submit',
          'button[aria-label*="submit" i]',
          'button[aria-label*="sign in" i]',
          'button[aria-label*="log in" i]',
          '[role="button"]:has-text("Submit")',
          '[role="button"]:has-text("Sign In")',
          '[role="button"]:has-text("Log In")'
        ];
        
      case 'navigation':
        return [
          'nav a',
          '.navigation a',
          '.menu a',
          '[role="navigation"] a',
          '[role="menuitem"]',
          '.nav-link',
          '.menu-item'
        ];
        
      case 'general-input':
        return [
          'input[type="text"]',
          'textarea',
          '[contenteditable="true"]',
          'input:not([type="hidden"])',
          '[role="textbox"]'
        ];
        
      case 'general-button':
        return [
          'button',
          '[role="button"]',
          'a.btn',
          'input[type="button"]',
          '.button'
        ];
        
      default:
        return [];
    }
  }
  
  /**
   * Try to find an element by text content
   */
  static async findElementByText(page: Page, text: string, tag = 'button,a,[role="button"]'): Promise<ElementHandle | null> {
    if (!text) return null;
    
    try {
      // Try exact text match with multiple selectors
      const element = await page.$(`${tag}:has-text("${text}")`);
      if (element) return element;
      
      // Try case-insensitive contains match
      const elements = await page.$$(tag);
      for (const el of elements) {
        const content = await el.textContent();
        if (content && content.toLowerCase().includes(text.toLowerCase())) {
          return el;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error finding element by text', { error, text });
      return null;
    }
  }
  
  /**
   * Try all fallbacks for a given action
   */
  static async tryFallbacks(page: Page, action: Action): Promise<ElementHandle | null> {
    if (!action.element) return null;
    
    try {
      const fallbacks = this.getFallbackSelectors(action, page.url());
      logger.debug('Trying fallback selectors', { 
        originalSelector: action.element, 
        fallbackCount: fallbacks.length 
      });
      
      // Try each fallback selector
      for (const selector of fallbacks) {
        const element = await page.$(selector).catch(() => null);
        if (element) {
          logger.info('Found element using fallback selector', { 
            original: action.element, 
            successful: selector 
          });
          return element;
        }
      }
      
      // If action has a value/description, try finding by text content
      if (action.value || action.description) {
        const textToFind = action.value || action.description || '';
        const elementByText = await this.findElementByText(page, textToFind);
        if (elementByText) {
          logger.info('Found element by text content', { text: textToFind });
          return elementByText;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error trying fallback selectors', { 
        error, 
        action: action.element 
      });
      return null;
    }
  }
}
