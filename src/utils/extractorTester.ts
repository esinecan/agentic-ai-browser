import { Page } from 'playwright';
import logger from './logger.js';
import { DOMExtractorRegistry } from '../core/dom-extraction/DOMExtractor.js';
import { ButtonExtractor, InputExtractor, LinkExtractor } from '../core/dom-extraction/extractors/ElementExtractors.js';

/**
 * Test utility to directly check extractor functionality
 */
export async function testExtractors(page: Page): Promise<void> {
  logger.debug('Testing individual extractors...');
  
  try {
    // Get all registered extractors
    const extractors = DOMExtractorRegistry.getAll();
    logger.debug(`Found ${extractors.length} registered extractors`);
    
    // Test each extractor individually
    for (const extractor of extractors) {
      try {
        logger.debug(`Testing extractor: ${extractor.name}`);
        const results = await extractor.extract(page, {});
        
        if (Array.isArray(results)) {
          logger.debug(`${extractor.name} found ${results.length} elements`);
        } else {
          logger.debug(`${extractor.name} returned non-array result: ${typeof results}`);
        }
      } catch (err) {
        logger.error(`Error testing extractor ${extractor.name}`, { error: err });
      }
    }
    
    // Direct tests to verify the core extractors are working
    const buttonExtractor = new ButtonExtractor();
    const buttons = await buttonExtractor.extract(page, {});
    logger.debug(`Direct ButtonExtractor test: found ${buttons.length} buttons`, {
      firstFew: buttons.slice(0, 3).map(b => ({text: b.text, selector: b.selector}))
    });
    
    const inputExtractor = new InputExtractor();
    const inputs = await inputExtractor.extract(page, {});
    logger.debug(`Direct InputExtractor test: found ${inputs.length} inputs`, {
      firstFew: inputs.slice(0, 3).map(i => ({type: i.attributes?.type, selector: i.selector}))
    });
    
    const linkExtractor = new LinkExtractor();
    const links = await linkExtractor.extract(page, {});
    logger.debug(`Direct LinkExtractor test: found ${links.length} links`, {
      firstFew: links.slice(0, 3).map(l => ({text: l.text, href: l.href}))
    });
  } catch (error) {
    logger.error('Extractor test failed', { error });
  }
}
