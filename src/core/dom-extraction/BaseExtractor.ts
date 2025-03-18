import { Page } from 'playwright';
import { DOMExtractorStrategy, DOMExtractionConfig } from './DOMExtractor.js';
import logger from '../../utils/logger.js';

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
      // Log extraction attempt
      logger.debug(`${this.name}: Attempting DOM evaluation with selector "${this.selector}"`);
      
      // Verify selector exists before proceeding
      const selectorExists = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        return {
          exists: elements.length > 0,
          count: elements.length
        };
      }, this.selector).catch(() => ({ exists: false, count: 0 }));
      
      if (!selectorExists.exists) {
        logger.warn(`${this.name}: Selector "${this.selector}" returned no elements`);
        return fallback;
      }
      
      logger.debug(`${this.name}: Found ${selectorExists.count} elements matching selector`);
      
      // Set execution timeout to prevent hanging evaluations
      const timeoutMs = 5000;
      let timeoutId: NodeJS.Timeout;
      
      const result = await Promise.race([
        page.evaluate(fn, this.selector),
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${this.name} extractor timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        })
      ]).finally(() => clearTimeout(timeoutId!));
      
      // Log extraction success
      logger.debug(`${this.name}: Extraction successful`, {
        resultType: Array.isArray(result) ? 'array' : typeof result,
        resultLength: Array.isArray(result) ? result.length : 
                     (typeof result === 'string' ? result.length : 'n/a')
      });
      
      return result as T;
    } catch (error) {
      logger.error(`${this.name}: Error during evaluation`, { 
        error, 
        selector: this.selector
      });
      
      // Try to capture DOM snapshot near the error for debugging
      try {
        const htmlSnapshot = await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          if (elements.length > 0) {
            return elements[0].outerHTML.substring(0, 1000);
          }
          // If specific selector fails, capture surrounding context
          const parent = document.querySelector('body');
          return parent ? parent.innerHTML.substring(0, 1000) : 'No content';
        }, this.selector).catch(() => 'Error capturing HTML');
        
        logger.debug(`${this.name}: HTML context near selector`, {
          selector: this.selector,
          htmlSnippet: htmlSnapshot
        });
      } catch (htmlError) {
        logger.error(`${this.name}: Failed to capture HTML context`, { error: htmlError });
      }
      
      return fallback;
    }
  }
  
  protected truncateText(text: string, maxLength?: number): string {
    if (!text) return '';
    const limit = maxLength || 1000;
    return text.length > limit ? text.substring(0, limit) + '...' : text;
  }
}
