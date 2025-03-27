import { Page } from 'playwright';
import logger from './logger.js';
import { DOMExtractorRegistry } from '../core/page/types.js';
import { ButtonExtractor, InputExtractor, LinkExtractor } from '../core/page/extractor/elements.js';

export async function testExtractors(page: Page): Promise<void> {
  try {
    // Check if the page is currently navigating
    const isNavigating = await page.evaluate(() => document.readyState !== 'complete')
      .catch(() => true); // If this fails, assume navigation is in progress
      
    if (isNavigating) {
      logger.debug('Page is navigating, deferring extractor tests');
      return; // Exit early if navigation is in progress
    }
    
    logger.debug('Running extractors on page', { url: page.url() });

    // Test some extractors directly
    const buttonExtractor = new ButtonExtractor();
    const inputExtractor = new InputExtractor();
    const linkExtractor = new LinkExtractor();
    
    // Sample how many extractors we have available
    const allExtractors = DOMExtractorRegistry.getAll();
    
    logger.debug(`Testing extractors (${allExtractors.length} available)`, {
      url: page.url(),
      extractors: allExtractors.map(e => e.name)
    });
    
    // Run the extractors with proper error handling
    const results = await Promise.allSettled([
      buttonExtractor.extract(page, { maxTextLength: 200 }),
      inputExtractor.extract(page, { maxTextLength: 200 }),
      linkExtractor.extract(page, { maxTextLength: 200 }),
    ]);
    
    // Process results safely
    const [buttonResult, inputResult, linkResult] = results;
    
    const buttons = buttonResult.status === 'fulfilled' ? buttonResult.value : [];
    const inputs = inputResult.status === 'fulfilled' ? inputResult.value : [];
    const links = linkResult.status === 'fulfilled' ? linkResult.value : [];
    
    // Log extraction results
    logger.debug('Button extractor test', { 
      count: buttons.length,
      firstFew: buttons.slice(0, 3).map((b: any) => ({text: b.text, selector: b.selector}))
    });
    
    logger.debug('Input extractor test', { 
      count: inputs.length,
      firstFew: inputs.slice(0, 3).map((i: any) => ({type: i.attributes?.type, selector: i.selector}))
    });
    
    logger.debug('Link extractor test', { 
      count: links.length,
      firstFew: links.slice(0, 3).map((l: any) => ({text: l.text, href: l.href}))
    });
  } catch (error) {
    logger.error('Error testing extractors', { error });
  }
}
