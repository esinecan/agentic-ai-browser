import { Page } from 'playwright';
import {
  DOMExtractorRegistry,
  DOMExtractionConfig,
  DOMSnapshot
} from './types.js';
import logger from '../../utils/logger.js';

export class PageAnalyzer {
  // Update default configuration with doubled text length
  private static defaultConfig: DOMExtractionConfig = {
    maxTextLength: 10000,  // Double from 5000
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
    
    // Capture original HTML before extraction for debug purposes
    const htmlSnapshot = await page.content().catch(err => {
      logger.error('Failed to capture HTML snapshot', { error: err });
      return '<error capturing HTML>';
    });
    
    logger.debug('Original HTML snapshot', { 
      htmlSnippet: htmlSnapshot.substring(0, 500) + '...',
      fullLength: htmlSnapshot.length
    });
    
    // Add this logging to verify extractors are registered
    const allExtractors = DOMExtractorRegistry.getAll();
    logger.debug(`Available extractors in registry: ${allExtractors.length}`, {
      names: allExtractors.map(e => e.name)
    });
    
    // Get all applicable extractors for this config
    const extractors = DOMExtractorRegistry.getApplicable(mergedConfig);
    
    if (!extractors || extractors.length === 0) {
      logger.warn('No applicable DOM extractors found', { 
        config: mergedConfig,
        registeredExtractors: allExtractors.map(e => e.name)
      });
    }
    
    logger.debug(`Running ${extractors.length} DOM extractors`, {
      names: extractors.map(e => e.name),
      config: mergedConfig
    });
    
    // Prepare result with properly initialized arrays
    const snapshot: DOMSnapshot = {
      url: page.url(),
      title: await page.title().catch(() => 'Error getting title'),
      timestamp: Date.now(),
      elements: {
        buttons: [],
        inputs: [],
        links: [],
        landmarks: []
      },
      content: {},
      // Add diagnostic information
      _diagnostic: {
        extractorsRun: extractors.map(e => e.name),
        extractorResults: {},
        extractionTime: 0
      }
    };
    
    // Process each extractor individually with proper error handling
    for (const extractor of extractors) {
      try {
        const extractorStartTime = Date.now();
        logger.debug(`Running extractor: ${extractor.name}`);
        
        const extractorTimeout = setTimeout(() => {
          logger.warn(`Extractor ${extractor.name} is taking too long`);
        }, 4000); // Warning only
        
        const result = await extractor.extract(page, mergedConfig);
        clearTimeout(extractorTimeout);
        
        const extractorDuration = Date.now() - extractorStartTime;
        snapshot._diagnostic!.extractorResults[extractor.name] = {
          duration: extractorDuration,
          success: !!result,
          resultType: result ? (Array.isArray(result) ? 'array' : typeof result) : 'none',
          resultSize: result ? (Array.isArray(result) ? result.length : 
                              (typeof result === 'string' ? result.length : 'n/a')) : 0
        };
        
        logger.debug(`Extractor ${extractor.name} completed in ${extractorDuration}ms`, {
          resultType: result ? (Array.isArray(result) ? 'array' : typeof result) : 'none',
          resultSize: result ? (Array.isArray(result) ? result.length : 
                             (typeof result === 'string' ? result.length : 'n/a')) : 0
        });
        
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
          // Handle non-array results (strings, objects, etc.)
          if (!snapshot.content) snapshot.content = {};
          snapshot.content[extractor.name] = result;
          
          if (!result) {
            logger.warn(`Empty or invalid result from ${extractor.name} extractor`);
          }
        }
      } catch (error) {
        logger.error(`Error in ${extractor.name} extractor`, { 
          error, 
          extractorName: extractor.name,
          selector: extractor.selector
        });
        
        // Capture diagnostic info
        if (snapshot._diagnostic?.extractorResults) {
          snapshot._diagnostic.extractorResults[extractor.name] = {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            selector: extractor.selector
          };
        }
      }
    }
    
    const totalDuration = Date.now() - startTime;
    snapshot._diagnostic!.extractionTime = totalDuration;
    
    // Check for empty results
    if (snapshot.elements && 
        (!snapshot.elements.buttons?.length && 
         !snapshot.elements.inputs?.length && 
         !snapshot.elements.links?.length)) {
      
      logger.warn('No interactive elements extracted', {
        url: page.url(),
        title: snapshot.title,
        possibleIssue: 'DOM might be in iframe, dynamic loading, or heavy JS framework'
      });
      
      // Try to diagnose the issue
      try {
        const iframeCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
        const shadowRoots = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('*'))
            .filter(el => el.shadowRoot)
            .map(el => ({
              tag: el.tagName,
              id: el.id || undefined,
              class: el.className || undefined
            }));
        });
        
        logger.debug('DOM structure diagnostics', {
          iframeCount,
          shadowRoots: shadowRoots.length ? shadowRoots : 'none',
          bodyChildren: await page.evaluate(() => document.body?.childElementCount || 0)
        });
      } catch (diagError) {
        logger.error('Error during DOM diagnostics', { error: diagError });
      }
    }
    
    logger.debug('DOM extraction completed', {
      duration: totalDuration,
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
