import { Page } from 'playwright';
import { BaseExtractor } from './base.js';
import { DOMExtractionConfig } from '../types.js';
import logger from '../../../utils/logger.js';

// Define interfaces for type safety
interface LinkData {
  text: string;
  href: string;
  importance?: number;
}

export class NavigationExtractor extends BaseExtractor {
  constructor() {
    super('navigation', 'body');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<any> {
    const allLinks = await this.extractAllUsefulLinks(page);
    
    return [{
      type: 'content',
      links: allLinks
    }];
  }
  
  private async extractAllUsefulLinks(page: Page): Promise<LinkData[]> {
    return this.safeEvaluate(
      page,
      (): LinkData[] => {
        // STEP 1: Get all links on the page
        const allLinks = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
        
        // STEP 2: Define functions to categorize links
        function isNavigationUI(element: Element): boolean {
          return element.closest('nav, header, footer, [role="navigation"]') !== null;
        }
        
        function isLikelyContentLink(a: HTMLAnchorElement): boolean {
          // Content links typically have meaningful text and point somewhere useful
          const text = a.textContent?.trim();
          const href = a.href;
          
          if (!text || !href) return false;
          
          // Skip fragment links and javascript actions
          if (href.startsWith('#') || href.startsWith('javascript:')) return false;
          
          // Skip tiny text links like icons
          if (text.length < 2) return false;
          
          return true;
        }
        
        function getLinkImportance(a: HTMLAnchorElement): number {
          let score = 0;
          
          // Links in main content are more important
          if (a.closest('main, [role="main"], #main, article')) {
            score += 10;
          }
          
          // Links with longer text might be more informative
          const text = a.textContent?.trim() || '';
          if (text.length > 20) score += 5;
          
          // Links that are headers or in list items are often important
          if (a.closest('h1, h2, h3, li')) {
            score += 3;
          }
          
          // Links with images might be important visual navigation
          if (a.querySelector('img')) {
            score += 2;
          }
          
          // Links that are buttons might be calls to action
          if (a.matches('.button, [role="button"]') || 
              a.classList.toString().includes('btn')) {
            score += 2;
          }
          
          return score;
        }
        
        // STEP 3: Categorize all links
        const navigationLinks: LinkData[] = [];
        const contentLinks: LinkData[] = [];
        
        allLinks.forEach(a => {
          if (!isLikelyContentLink(a)) return;
          
          const link: LinkData = {
            text: a.textContent?.trim() || '',
            href: a.href,
            importance: getLinkImportance(a)
          };
          
          // Sort into appropriate category
          if (isNavigationUI(a)) {
            navigationLinks.push(link);
          } else {
            contentLinks.push(link);
          }
        });
        
        // STEP 4: Sort by importance and combine
        contentLinks.sort((a, b) => (b.importance || 0) - (a.importance || 0));
        
        // First return the most important content links, then navigation UI links
        return [...contentLinks, ...navigationLinks].map(link => {
          // Remove the importance score from final output
          const { importance, ...cleanLink } = link;
          return cleanLink;
        });
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
