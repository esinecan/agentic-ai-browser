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
    // Default implementation - can be overridden by specific extractors
    const depth = config.extractDepth || 'standard';
    
    if (depth === 'minimal') {
      return ['title', 'meta', 'url'].includes(this.name);
    }
    
    return true;
  }
  
  protected async safeEvaluate<T>(
    page: Page, 
    fn: (selector: string) => T,
    fallback: T
  ): Promise<T> {
    try {
      return await page.evaluate(fn, this.selector);
    } catch (error) {
      logger.debug(`Error extracting ${this.name}`, { error, selector: this.selector });
      return fallback;
    }
  }
  
  protected truncateText(text: string, maxLength?: number): string {
    if (!maxLength || !text) return text || '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
}
