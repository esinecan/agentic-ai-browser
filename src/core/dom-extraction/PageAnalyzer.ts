import { Page } from 'playwright';
import {
  DOMExtractorRegistry,
  DOMExtractionConfig,
  DOMSnapshot
} from './DOMExtractor.js';
import logger from '../../utils/logger.js';

export class PageAnalyzer {
  // Default configuration
  private static defaultConfig: DOMExtractionConfig = {
    maxTextLength: 5000,
    includeHidden: false,
    extractDepth: 'standard'
  };
  
  /**
   * Extract a complete DOM snapshot using all applicable extractors
   */
  static async extractSnapshot(
    page: Page, 
    config: Partial<DOMExtractionConfig> = {}
  ): Promise<DOMSnapshot> {
    const startTime = Date.now();
    const mergedConfig = { ...this.defaultConfig, ...config };
    
    // Add this logging to verify extractors are registered
    const allExtractors = DOMExtractorRegistry.getAll();
    logger.debug(`Available extractors in registry: ${allExtractors.length}`, {
      names: allExtractors.map(e => e.name)
    });
    
    // Get all applicable extractors for this config
    const extractors = DOMExtractorRegistry.getApplicable(mergedConfig);
    
    if (!extractors || extractors.length === 0) {
      logger.warn('No applicable DOM extractors found', { config: mergedConfig });
    }
    
    logger.debug(`Running ${extractors.length} DOM extractors`, {
      names: extractors.map(e => e.name),
      config: mergedConfig
    });
    
    // Prepare result with properly initialized arrays
    const snapshot: DOMSnapshot = {
      url: page.url(),
      title: await page.title().catch(() => ''),
      timestamp: Date.now(),
      elements: {
        buttons: [],
        inputs: [],
        links: [],
        landmarks: []
      },
      content: {},
    };
    
    // Process each extractor individually with proper error handling
    for (const extractor of extractors) {
      try {
        logger.debug(`Running extractor: ${extractor.name}`);
        const extractorTimeout = setTimeout(() => {
          logger.warn(`Extractor ${extractor.name} is taking too long`);
        }, 4000); // Warning only
        
        const result = await extractor.extract(page, mergedConfig);
        clearTimeout(extractorTimeout);
        
        // Explicitly check result type and assign to appropriate category
        if (result && Array.isArray(result)) {
          if (['buttons', 'inputs', 'links', 'landmarks'].includes(extractor.name)) {
            logger.debug(`Adding ${result.length} items to elements.${extractor.name}`);
            if (snapshot.elements) {
              snapshot.elements[extractor.name] = result;
            }
          } else {
            logger.debug(`Adding result to content.${extractor.name}`);
            if (!snapshot.content) snapshot.content = {};
            snapshot.content[extractor.name] = result;
          }
        } else {
          logger.warn(`Empty or invalid result from ${extractor.name} extractor`);
        }
      } catch (error) {
        logger.error(`Error in ${extractor.name} extractor`, { error });
      }
    }
    
    logger.debug('DOM extraction completed', {
      duration: Date.now() - startTime,
      extractorsRun: extractors.length,
      elementsExtracted: snapshot.elements ? Object.values(snapshot.elements)
        .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : 0,
      snapshotSize: JSON.stringify(snapshot).length
    });
    
    return snapshot;
  }
  
  /**
   * Extract a minimal snapshot containing just essential information
   */
  static async extractLiteSnapshot(page: Page): Promise<DOMSnapshot> {
    return this.extractSnapshot(page, { extractDepth: 'minimal' });
  }
  
  /**
   * Extract a comprehensive snapshot with all possible data
   */
  static async extractComprehensiveSnapshot(page: Page): Promise<DOMSnapshot> {
    return this.extractSnapshot(page, { 
      extractDepth: 'comprehensive',
      includeHidden: true
    });
  }
  
  /**
   * Extract just specific elements or content
   */
  static async extractSpecific(
    page: Page, 
    extractorNames: string[]
  ): Promise<Partial<DOMSnapshot>> {
    const snapshot: Partial<DOMSnapshot> = {
      url: page.url(),
      timestamp: Date.now(),
      elements: {},
      content: {},
    };
    
    await Promise.all(extractorNames.map(async name => {
      const extractor = DOMExtractorRegistry.get(name);
      if (!extractor) {
        logger.warn(`Extractor '${name}' not found`);
        return;
      }
      
      try {
        const result = await extractor.extract(page, this.defaultConfig);
        
        if (['buttons', 'inputs', 'links', 'landmarks'].includes(name)) {
          snapshot.elements![name] = result;
        } else {
          snapshot.content![name] = result;
        }
      } catch (error) {
        logger.error(`Error in ${name} extractor`, { error });
      }
    }));
    
    return snapshot;
  }
}
