import { Page } from 'playwright';
import { DOMElement, DOMExtractionConfig, DOMExtractorStrategy } from '../types.js';
import { BaseExtractor } from './base.js';
import logger from '../../../utils/logger.js';
import { visibilityHelperScript } from '../utils/visibilityHelper.js';

export class ButtonExtractor extends BaseExtractor implements DOMExtractorStrategy {
  constructor() {
    super('buttons', 'button, [role="button"], input[type="button"], input[type="submit"], a.btn, a[href^="javascript:"], [class*="button"]');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<DOMElement[]> {
    try {
      logger.debug('Running ButtonExtractor...');
      
      // Replace separate evaluation with safeEvaluate
      return this.safeEvaluate(
        page,
        (selector) => {
          const elements = document.querySelectorAll(selector);
          
          // Inline visibility check to replace the helper
          function isElementVisible(element: Element): boolean {
            if (!element) return false;
            
            try {
              const style = window.getComputedStyle(element);
              const htmlElement = element as HTMLElement;
              return style.display !== 'none' && 
                    style.visibility !== 'hidden' && 
                    (htmlElement.offsetParent !== null || style.position === 'fixed');
            } catch (e) {
              console.error('Error checking visibility:', e);
              return false;
            }
          }
          
          return Array.from(elements)
            .map(el => {
              const buttonElement = el as HTMLElement;
              
              const text = buttonElement.textContent?.trim() || 
                          buttonElement.getAttribute('value') || 
                          buttonElement.getAttribute('aria-label') || '';
              
              const attributes: Record<string, string> = {};
              const type = buttonElement.getAttribute('type');
              const name = buttonElement.getAttribute('name');
              
              if (type) attributes['type'] = type;
              if (name) attributes['name'] = name;
              
              let classNames: string[] = [];
              if (buttonElement.classList) {
                classNames = Array.from(buttonElement.classList);
              } else {
                const className = buttonElement.getAttribute('class');
                if (className) {
                  classNames = className.split(' ').filter(Boolean);
                }
              }
              
              return {
                tagName: buttonElement.tagName.toLowerCase(),
                id: buttonElement.id || undefined,
                classes: classNames,
                text,
                attributes,
                isVisible: isElementVisible(buttonElement),
                role: buttonElement.getAttribute('role') || 'button',
                selector: buttonElement.id ? `#${buttonElement.id}` : 
                        (classNames.length > 0 ? `.${classNames[0]}` : 
                        buttonElement.tagName.toLowerCase())
              };
            })
            .filter(button => button.text);
        },
        []
      );
    } catch (error) {
      logger.error('Error extracting buttons', { error });
      return [];
    }
  }
}

export class InputExtractor extends BaseExtractor implements DOMExtractorStrategy {
  constructor() {
    super('inputs', 'input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<DOMElement[]> {
    try {
      logger.debug('Running InputExtractor...');
      
      // Instead of directly evaluating the script, use the safer method from BaseExtractor
      return this.safeEvaluate(
        page,
        (selector) => {
          function isElementVisible(element: Element): boolean {
            if (!element) return false;
            
            try {
              const style = window.getComputedStyle(element);
              const htmlElement = element as HTMLElement;
              return style.display !== 'none' && 
                    style.visibility !== 'hidden' && 
                    (htmlElement.offsetParent !== null || style.position === 'fixed');
            } catch (e) {
              console.error('Error checking visibility:', e);
              return false;
            }
          }
          
          return Array.from(document.querySelectorAll(selector))
            .map(el => {
              const inputElement = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
              
              const attributes: Record<string, string> = {};
              const type = inputElement.getAttribute('type');
              const name = inputElement.getAttribute('name');
              const placeholder = inputElement.getAttribute('placeholder');
              
              if (type) attributes['type'] = type;
              if (name) attributes['name'] = name;
              if (placeholder) attributes['placeholder'] = placeholder;
              
              let label = '';
              if (inputElement.id) {
                const labelEl = document.querySelector(`label[for="${inputElement.id}"]`);
                if (labelEl) label = labelEl.textContent?.trim() || '';
              }
              
              return {
                tagName: inputElement.tagName.toLowerCase(),
                id: inputElement.id || undefined,
                type: type || inputElement.tagName.toLowerCase(),
                name: name || undefined,
                placeholder: placeholder || undefined,
                label,
                attributes,
                isVisible: isElementVisible(inputElement),
                value: inputElement.value || undefined
              };
            });
        },
        [] // Default empty array if evaluation fails
      );
    } catch (error) {
      logger.error('Error extracting inputs', { error });
      return [];
    }
  }
}

export class LinkExtractor extends BaseExtractor implements DOMExtractorStrategy {
  constructor() {
    super('links', 'a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"])');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<DOMElement[]> {
    try {
      logger.debug('Running LinkExtractor...');
      
      // Use safeEvaluate to handle navigation events gracefully
      return this.safeEvaluate(
        page,
        (selector) => {
          function isElementVisible(element: Element): boolean {
            if (!element) return false;
            
            try {
              const style = window.getComputedStyle(element);
              const htmlElement = element as HTMLElement;
              return style.display !== 'none' && 
                    style.visibility !== 'hidden' && 
                    (htmlElement.offsetParent !== null || style.position === 'fixed');
            } catch (e) {
              console.error('Error checking visibility:', e);
              return false;
            }
          }
          
          return Array.from(document.querySelectorAll(selector))
            .map(el => {
              const linkElement = el as HTMLAnchorElement;
              const text = linkElement.textContent?.trim() || '';
              const href = linkElement.href || '';
              
              return {
                tagName: 'a',
                text: text.length > 100 ? text.substring(0, 100) + '...' : text,
                href,
                isVisible: isElementVisible(linkElement),
                isExternal: linkElement.hostname !== window.location.hostname,
                attributes: {
                  href
                }
              };
            })
            .filter(link => link.text && link.href);
        },
        [] // Default empty array if evaluation fails
      );
    } catch (error) {
      logger.error('Error extracting links', { error });
      return [];
    }
  }
}

export class LandmarkExtractor extends BaseExtractor implements DOMExtractorStrategy {
  constructor() {
    super('landmarks', '[role="main"], [role="navigation"], [role="search"], main, nav, article');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<DOMElement[]> {
    try {
      logger.debug('Running LandmarkExtractor...');
      
      // Use safeEvaluate pattern instead of direct page.evaluate
      return this.safeEvaluate(
        page,
        (selector) => {
          function isElementVisible(element: Element): boolean {
            if (!element) return false;
            
            try {
              const style = window.getComputedStyle(element);
              const htmlElement = element as HTMLElement;
              return style.display !== 'none' && 
                    style.visibility !== 'hidden' && 
                    (htmlElement.offsetParent !== null || style.position === 'fixed');
            } catch (e) {
              console.error('Error checking visibility:', e);
              return false;
            }
          }
          
          return Array.from(document.querySelectorAll(selector))
            .map(el => {
              const element = el as HTMLElement;
              const role = element.getAttribute('role') || element.tagName.toLowerCase();
              
              return {
                tagName: element.tagName.toLowerCase(),
                role,
                id: element.id || undefined,
                isVisible: isElementVisible(element),
                content: element.textContent?.trim().substring(0, 150) || ''
              };
            });
        },
        [] // Default empty array as fallback
      );
    } catch (error) {
      logger.error('Error extracting landmarks', { error });
      return [];
    }
  }
}
