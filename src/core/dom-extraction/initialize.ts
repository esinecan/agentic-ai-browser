import { DOMExtractorRegistry } from './DOMExtractor.js';
import { ButtonExtractor, InputExtractor, LinkExtractor, LandmarkExtractor } from './extractors/ElementExtractors.js';
import { TitleExtractor, URLExtractor, MetaDescriptionExtractor } from './extractors/BasicExtractors.js';
import { HeadingsExtractor, MainContentExtractor } from './extractors/ContentExtractors.js';
import { NavigationExtractor, FormExtractor } from './extractors/AdvancedExtractors.js';
import logger from '../../utils/logger.js';

// Register all extractors
const extractors = [
  // Basic extractors
  new TitleExtractor(),
  new URLExtractor(),
  new MetaDescriptionExtractor(),
  
  // Element extractors - most important for interactive elements
  new ButtonExtractor(),
  new InputExtractor(),
  new LinkExtractor(),
  new LandmarkExtractor(),
  
  // Content extractors
  new HeadingsExtractor(),
  new MainContentExtractor(),
  
  // Advanced extractors
  new NavigationExtractor(),
  new FormExtractor()
];

// Register all extractors
extractors.forEach(extractor => {
  DOMExtractorRegistry.register(extractor);
});

logger.debug('DOM extraction system initialized with extractors', {
  count: extractors.length,
  names: extractors.map(e => e.name)
});

export default DOMExtractorRegistry;
