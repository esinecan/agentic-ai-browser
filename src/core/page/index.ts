// First import the initializer to ensure registration
import './initialize.js';

// Then export other components
export * from './types.js';
export * from './analyzer.js';

// Re-export the PageAnalyzer as the default export for convenience
import { PageAnalyzer } from './analyzer.js';
export default PageAnalyzer;
