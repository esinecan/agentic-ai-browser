import { Page, ElementHandle } from 'playwright';

// Configuration interface
export interface DOMExtractionConfig {
  maxTextLength?: number;
  includeHidden?: boolean;
  extractDepth?: 'minimal' | 'standard' | 'comprehensive';
  customSelectors?: Record<string, string>;
}

// Result interfaces
export interface DOMElement {
  tagName: string;
  id?: string;
  classes?: string[];
  text?: string;
  attributes?: Record<string, string>;
  selector?: string;
  role?: string;
  isVisible?: boolean;
  
  // Additional properties for specialized elements
  href?: string;        // For links
  method?: string;      // For forms
  submitText?: string;  // For forms
  inputs?: any[];       // For forms
  
  // Allow any additional properties
  [key: string]: any;
}

export interface DOMSnapshot {
  url: string;
  title: string;
  timestamp: number;
  metadata?: Record<string, any>;
  elements?: {
    [key: string]: DOMElement[];
  };
  content?: {
    [key: string]: any;
  };
  // Add diagnostic information for debugging purposes
  _diagnostic?: {
    extractorsRun: string[];
    extractorResults: {
      [extractorName: string]: {
        duration?: number;
        success?: boolean;
        resultType?: string;
        resultSize?: number | string;
        error?: string;
        stack?: string;
        selector?: string;
      };
    };
    extractionTime: number;
  };
}

// Core extractor interface
export interface DOMExtractorStrategy {
  name: string;
  selector: string;
  extract(page: Page, config: DOMExtractionConfig): Promise<any>;
  isApplicable(config: DOMExtractionConfig): boolean;
}

// Extractor registry system
export class DOMExtractorRegistry {
  private static extractors: Map<string, DOMExtractorStrategy> = new Map();
  
  static register(extractor: DOMExtractorStrategy): void {
    this.extractors.set(extractor.name, extractor);
  }
  
  static get(name: string): DOMExtractorStrategy | undefined {
    return this.extractors.get(name);
  }
  
  static getAll(): DOMExtractorStrategy[] {
    return Array.from(this.extractors.values());
  }
  
  static getApplicable(config: DOMExtractionConfig): DOMExtractorStrategy[] {
    return this.getAll().filter(extractor => extractor.isApplicable(config));
  }
}
