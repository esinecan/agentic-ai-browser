// First import the initializer to ensure registration
import './initialize.js';

// Then export other components
export * from './DOMExtractor.js';
export * from './BaseExtractor.js';
export * from './PageAnalyzer.js';

// Re-export the PageAnalyzer as the default export for convenience
import { PageAnalyzer } from './PageAnalyzer.js';
export default PageAnalyzer;
