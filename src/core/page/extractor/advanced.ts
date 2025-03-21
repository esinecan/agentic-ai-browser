import { Page } from 'playwright';
import { BaseExtractor } from './base.js';
import { DOMExtractionConfig, DOMExtractorRegistry } from '../types.js';

export class NavigationExtractor extends BaseExtractor {
  constructor() {
    super('navigation', 'nav, [role="navigation"], header menu');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<any> {
    return this.safeEvaluate(
      page,
      (selector) => {
        const navElements = Array.from(document.querySelectorAll(selector));
        return navElements.map(nav => {
          const links = Array.from(nav.querySelectorAll('a'))
            .filter(a => a.href && a.textContent?.trim())
            .map(a => ({
              text: a.textContent?.trim(),
              href: a.href,
              current: a.getAttribute('aria-current') === 'page'
            }));
            
          return {
            id: nav.id || undefined,
            links: links,
            location: determineLocation(nav)
          };
        });
        
        // Helper function to determine the position of an element
        function determineLocation(element: Element): string {
          const rect = element.getBoundingClientRect();
          const viewHeight = window.innerHeight;
          const viewWidth = window.innerWidth;
          
          if (rect.top < viewHeight * 0.2) return 'header';
          if (rect.left < viewWidth * 0.2) return 'sidebar-left';
          if (rect.right > viewWidth * 0.8) return 'sidebar-right';
          if (rect.bottom > viewHeight * 0.8) return 'footer';
          return 'main';
        }
      },
      []
    );
  }
}

export class FormExtractor extends BaseExtractor {
  constructor() {
    super('forms', 'form');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<any> {
    return this.safeEvaluate(
      page,
      (selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map(form => {
            const inputs = Array.from(form.querySelectorAll('input, select, textarea'))
              .map(input => ({
                type: input.getAttribute('type') || input.tagName.toLowerCase(),
                name: input.getAttribute('name'),
                id: input.id || undefined,
                placeholder: input.getAttribute('placeholder') || undefined,
                required: input.hasAttribute('required'),
                label: findLabel(input)
              }));
              
            const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
            
            return {
              id: form.id || undefined,
              action: form.getAttribute('action'),
              method: form.getAttribute('method')?.toUpperCase() || 'GET',
              inputs: inputs,
              submitText: submitButton?.textContent?.trim() || 
                          submitButton?.getAttribute('value') || 
                          'Submit'
            };
          });
          
        // Helper function to find associated label for an input
        function findLabel(input: Element): string | undefined {
          // Try to find a label by 'for' attribute
          if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label && label.textContent) {
              return label.textContent.trim();
            }
          }
          
          // Try to find a parent label
          let parent = input.parentElement;
          while (parent) {
            if (parent.tagName === 'LABEL' && parent.textContent) {
              return parent.textContent.trim().replace(input.textContent || '', '').trim();
            }
            parent = parent.parentElement;
          }
          
          return undefined;
        }
      },
      []
    );
  }
}
