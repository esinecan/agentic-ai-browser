import { Page } from 'playwright';
import { BaseExtractor } from './base.js';
import { DOMExtractionConfig, DOMExtractorRegistry } from '../types.js';

export class TitleExtractor extends BaseExtractor {
  constructor() {
    super('title', 'title');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<string> {
    return await page.title().catch(() => '');
  }
  
  isApplicable(): boolean {
    return true; // Always extract title
  }
}

export class URLExtractor extends BaseExtractor {
  constructor() {
    super('url', '');
  }
  
  async extract(page: Page): Promise<string> {
    return page.url();
  }
  
  isApplicable(): boolean {
    return true; // Always extract URL
  }
}

export class MetaDescriptionExtractor extends BaseExtractor {
  constructor() {
    super('metaDescription', 'meta[name="description"]');
  }
  
  async extract(page: Page): Promise<string> {
    return this.safeEvaluate(
      page,
      (selector) => {
        const meta = document.querySelector(selector);
        return meta?.getAttribute('content')?.trim() || '';
      },
      ''
    );
  }
}
