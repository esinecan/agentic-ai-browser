import { jest, describe, test, expect, beforeEach } from '@jest/globals';
// Mock the DOMExtractorRegistry
jest.mock('../../core/dom-extraction/DOMExtractor.js', () => {
    // ✅ Declare mockExtractors outside to persist across test cases
    const mockExtractors = new Map<string, ExtractorType>();

    interface ExtractorType {
      name: string;
      selector: string;
      extract: (page: Page) => Promise<any>;
      isApplicable: (config: DOMExtractionConfig) => boolean;
    }

    // ✅ Create Mock Registry
    const MockRegistry = {
      register: jest.fn((extractor: ExtractorType) => {
        mockExtractors.set(extractor.name, extractor);
      }),
      get: jest.fn((name: string) => mockExtractors.get(name)),
      getAll: jest.fn(() => Array.from(mockExtractors.values())),
      getApplicable: jest.fn((config: DOMExtractionConfig) => Array.from(mockExtractors.values())),
    };

    return {
      DOMExtractorRegistry: MockRegistry,
      mockExtractors, // ✅ Expose mockExtractors for manipulation in tests
      __esModule: true,
    };
});
import { Page } from 'playwright';
import { PageAnalyzer } from '../../core/dom-extraction/PageAnalyzer.js';
import { 
  DOMExtractorRegistry, 
  DOMExtractorStrategy,
  DOMExtractionConfig, 
} from '../../core/dom-extraction/DOMExtractor.js';

let mockExtractors: Map<string, DOMExtractorStrategy>; // ✅ Declare outside beforeEach()

beforeEach(() => {
    jest.clearAllMocks();

    // ✅ Create a fresh extractors map for each test
    mockExtractors = new Map<string, DOMExtractorStrategy>();

    // ✅ Ensure Jest recognizes the registry as mocked
    jest.spyOn(DOMExtractorRegistry, 'getApplicable').mockImplementation(
        jest.fn<(config: DOMExtractionConfig) => DOMExtractorStrategy[]>(() => Array.from(mockExtractors.values()))
    );
    jest.spyOn(DOMExtractorRegistry, 'get').mockImplementation(
        jest.fn<(name: string) => DOMExtractorStrategy | undefined>((name) => mockExtractors.get(name))
    );

    // ✅ Register mock extractors before each test
    const titleExtractor = createMockExtractor('title', 'Example Page');
    const urlExtractor = createMockExtractor('url', 'https://example.com');

    mockExtractors.set('title', titleExtractor);
    mockExtractors.set('url', urlExtractor);
});

// Mock logger
jest.mock('../../utils/logger.js', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Create mock extractors
const createMockExtractor = (name: string, value: any): DOMExtractorStrategy => ({
  name,
  selector: `selector-for-${name}`,
  extract: jest.fn(async () => value),
  isApplicable: jest.fn(() => true),
});

// Mock Page object
const createMockPage = (htmlContent: string = '<html><body>Test</body></html>') => {
  return {
    url: jest.fn(() => 'https://example.com'),
    title: jest.fn(() => Promise.resolve('Example Page')),
    evaluate: jest.fn().mockImplementation(() => ({})), // Ensure this gets called
    content: jest.fn(() => Promise.resolve(htmlContent)),
    $eval: jest.fn(),
    $$eval: jest.fn(),
  } as unknown as Page;
};

describe('PageAnalyzer', () => {
  let mockPage: Page;
  
  beforeEach(() => {
    mockPage = createMockPage();
    jest.clearAllMocks();
    
    // Register mock extractors
    const titleExtractor = createMockExtractor('title', 'Example Page');
    const urlExtractor = createMockExtractor('url', 'https://example.com');
    const metaExtractor = createMockExtractor('metaDescription', 'Page description');
    const buttonsExtractor = createMockExtractor('buttons', [{text: 'Click me', tagName: 'button'}]);
    
    DOMExtractorRegistry.register(titleExtractor);
    DOMExtractorRegistry.register(urlExtractor);
    DOMExtractorRegistry.register(metaExtractor);
    DOMExtractorRegistry.register(buttonsExtractor);
  });
  
  test('extractLiteSnapshot returns basic page data', async () => {
    const snapshot = await PageAnalyzer.extractLiteSnapshot(mockPage);
    
    expect(snapshot).toHaveProperty('url', 'https://example.com');
    expect(snapshot).toHaveProperty('title', 'Example Page');
    expect(snapshot).toHaveProperty('timestamp');
  });
  
  test('extractSnapshot returns standard page data', async () => {
    const snapshot = await PageAnalyzer.extractSnapshot(mockPage);
    
    expect(snapshot).toHaveProperty('url', 'https://example.com');
    expect(snapshot).toHaveProperty('title', 'Example Page');
    expect(snapshot).toHaveProperty('timestamp');
    // Verify that page.evaluate was called - now it should be through our extractors
    expect(DOMExtractorRegistry.getApplicable).toHaveBeenCalled();
  });
  
  test('extractComprehensiveSnapshot includes hidden elements', async () => {
    await PageAnalyzer.extractComprehensiveSnapshot(mockPage);
    
    // Check that the registry was queried with the right config
    expect(DOMExtractorRegistry.getApplicable).toHaveBeenCalledWith(
      expect.objectContaining({ 
        extractDepth: 'comprehensive',
        includeHidden: true 
      })
    );
  });
  
  test('extractSpecific returns only requested extractors', async () => {
    const snapshot = await PageAnalyzer.extractSpecific(mockPage, ['title', 'url']);
    
    expect(snapshot).toHaveProperty('url', 'https://example.com');
    expect(snapshot).toHaveProperty('timestamp');
    
    // Specific extractors should have been requested
    expect(DOMExtractorRegistry.get).toHaveBeenCalledWith('title');
    expect(DOMExtractorRegistry.get).toHaveBeenCalledWith('url');
    
    // Content should include the title since we registered it
    expect(snapshot.content).toBeDefined();
    expect(Object.keys(snapshot.content || {})).toContain('title');
  });
});
