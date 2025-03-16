import { Page } from 'playwright';
import { BaseExtractor } from '../BaseExtractor.js';
import { DOMExtractionConfig, DOMExtractorRegistry } from '../DOMExtractor.js';

export class HeadingsExtractor extends BaseExtractor {
  constructor() {
    super('headings', 'h1, h2, h3, h4, h5, h6');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<{level: number, text: string}[]> {
    return this.safeEvaluate(
      page,
      (selector) => {
        const maxLength = 200;
        return Array.from(document.querySelectorAll(selector))
          .map(el => {
            const level = parseInt(el.tagName.substring(1), 10);
            let text = el.textContent?.trim() || '';
            text = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
            
            return { level, text };
          })
          .filter(h => h.text.length > 0);
      },
      []
    );
  }
}

export class MainContentExtractor extends BaseExtractor {
  constructor() {
    super('mainContent', 'main, [role="main"], article, .content, #content');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<string> {
    const maxLength = config.maxTextLength || 5000;
    
    return this.safeEvaluate(
      page,
      (selector) => {
        // Try to find the main content element
        const mainEl = document.querySelector(selector);
        if (!mainEl) return '';
        
        // Clone to avoid modifying the actual DOM
        const clone = mainEl.cloneNode(true) as HTMLElement;
        
        // Remove script, style elements
        Array.from(clone.querySelectorAll('script, style, noscript')).forEach(el => el.remove());
        
        // Get text content and clean up whitespace
        let text = clone.textContent?.replace(/\s+/g, ' ').trim() || '';
        
        // Truncate if necessary
        return text;
      },
      ''
    ).then(text => this.truncateText(text, maxLength));
  }
}

// Register extractors
DOMExtractorRegistry.register(new HeadingsExtractor());
DOMExtractorRegistry.register(new MainContentExtractor());
