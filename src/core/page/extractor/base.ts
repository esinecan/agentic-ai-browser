import { Page } from 'playwright';
import { DOMExtractorStrategy, DOMExtractionConfig } from '../types.js';
import logger from '../../../utils/logger.js';
import { visibilityHelperScript } from '../utils/visibilityHelper.js';

export abstract class BaseExtractor implements DOMExtractorStrategy {
  constructor(
    public name: string,
    public selector: string,
  ) {}
  
  abstract extract(page: Page, config: DOMExtractionConfig): Promise<any>;
  
  isApplicable(config: DOMExtractionConfig): boolean {
    return true; // Override in child classes as needed
  }
  
  protected async safeEvaluate<T>(
    page: Page, 
    fn: (selector: string) => T,
    fallback: T
  ): Promise<T> {
    try {
      // Using Playwright's more reliable approach for function evaluation
      return await page.evaluate(
        ({ fnStr, selector, helperScript }) => {
          // First evaluate the helper script
          eval(helperScript);
          
          // Create a proper function wrapper
          const evaluatedFn = new Function('selector', `
            return (${fnStr})(selector);
          `);
          
          // Execute with the selector
          return evaluatedFn(selector);
        }, 
        { 
          fnStr: fn.toString(),
          selector: this.selector,
          helperScript: visibilityHelperScript
        }
      );
    } catch (error) {
      console.error('Error during evaluation:', error);
      return fallback;
    }
  }
  
  protected truncateText(text: string, maxLength?: number): string {
    if (!text) return '';
    const limit = maxLength || 1000;
    return text.length > limit ? text.substring(0, limit) + '...' : text;
  }
}
