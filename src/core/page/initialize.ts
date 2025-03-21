import { DOMExtractorRegistry } from './types.js';
import { ButtonExtractor, InputExtractor, LinkExtractor, LandmarkExtractor } from './extractor/elements.js';
import { TitleExtractor, URLExtractor, MetaDescriptionExtractor } from './extractor/basic.js';
import { HeadingsExtractor, MainContentExtractor, TableExtractor, ListExtractor } from './extractor/content.js';
import { NavigationExtractor, FormExtractor } from './extractor/advanced.js';
import { ImageExtractor, FrameExtractor } from './extractor/media.js';
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
  new TableExtractor(),
  new ListExtractor(),
  
  // Media extractors
  new ImageExtractor(),
  new FrameExtractor(),
  
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
