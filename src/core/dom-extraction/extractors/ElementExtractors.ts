import { Page } from 'playwright';
import { DOMElement, DOMExtractionConfig, DOMExtractorRegistry, DOMExtractorStrategy } from '../DOMExtractor.js';
import logger from '../../../utils/logger.js';

export class ButtonExtractor implements DOMExtractorStrategy {
  name = 'buttons';
  selector = 'button, [role="button"], input[type="button"], input[type="submit"], a.btn, a[href^="javascript:"], [class*="button"]';
  
  isApplicable(config: DOMExtractionConfig): boolean {
    return true; // Always applicable
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<DOMElement[]> {
    try {
      logger.debug('Running ButtonExtractor...');
      
      const buttons = await page.evaluate(() => {
        // More robust selector that finds more types of buttons
        const elements = document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"], a.btn, a[href^="javascript:"], [class*="button"]');
        console.log(`Found ${elements.length} button elements`);
        
        return Array.from(elements)
          .map(el => {
            const buttonElement = el as HTMLElement;
            const text = buttonElement.innerText?.trim() || buttonElement.getAttribute('value') || buttonElement.getAttribute('aria-label') || '';
            
            // Create attributes object with only defined values converted to strings
            const attributes: Record<string, string> = {};
            const type = buttonElement.getAttribute('type');
            const name = buttonElement.getAttribute('name');
            if (type) attributes.type = type;
            if (name) attributes.name = name;
            
            return {
              tagName: buttonElement.tagName.toLowerCase(),
              id: buttonElement.id || undefined,
              classes: buttonElement.className ? buttonElement.className.split(' ').filter(Boolean) : undefined,
              text: text.length > 100 ? text.substring(0, 100) + '...' : text,
              attributes,
              isVisible: window.getComputedStyle(buttonElement).display !== 'none',
              role: buttonElement.getAttribute('role') || 'button',
              selector: buttonElement.id ? `#${buttonElement.id}` : (buttonElement.className ? `.${buttonElement.className.replace(/\s+/g, '.')}` : buttonElement.tagName.toLowerCase())
            };
          })
          .filter(button => button.text); // Only keep buttons with text content
      });
      
      logger.debug(`ButtonExtractor found ${buttons.length} buttons`);
      return buttons;
    } catch (error) {
      logger.error('Error extracting buttons', { error });
      return [];
    }
  }
}

export class InputExtractor implements DOMExtractorStrategy {
  name = 'inputs';
  selector = 'input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select';
  
  isApplicable(config: DOMExtractionConfig): boolean {
    return true; // Always applicable
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<DOMElement[]> {
    try {
      logger.debug('Running InputExtractor...');
      
      const inputs = await page.evaluate(() => {
        const elements = document.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select');
        console.log(`Found ${elements.length} input elements`);
        
        return Array.from(elements)
          .map(el => {
            const inputElement = el as HTMLElement;
            const inputType = inputElement.getAttribute('type') || inputElement.tagName.toLowerCase();
            
            // Create attributes object with only defined values converted to strings
            const attributes: Record<string, string> = {};
            attributes.type = inputType; // This is guaranteed to be non-null by defaulting to tagName
            
            const name = inputElement.getAttribute('name');
            const placeholder = inputElement.getAttribute('placeholder');
            if (name) attributes.name = name;
            if (placeholder) attributes.placeholder = placeholder;
            
            return {
              tagName: inputElement.tagName.toLowerCase(),
              id: inputElement.id || undefined,
              classes: inputElement.className ? inputElement.className.split(' ').filter(Boolean) : undefined,
              attributes,
              isVisible: window.getComputedStyle(inputElement).display !== 'none',
              selector: inputElement.id ? `#${inputElement.id}` : (inputElement.getAttribute('name') ? `[name="${inputElement.getAttribute('name')}"]` : inputElement.tagName.toLowerCase())
            };
          });
      });
      
      logger.debug(`InputExtractor found ${inputs.length} inputs`);
      return inputs;
    } catch (error) {
      logger.error('Error extracting inputs', { error });
      return [];
    }
  }
}

export class LinkExtractor implements DOMExtractorStrategy {
  name = 'links';
  selector = 'a[href]:not([href^="javascript:"]):not([href="#"])';
  
  isApplicable(config: DOMExtractionConfig): boolean {
    return true; // Always applicable
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<DOMElement[]> {
    try {
      logger.debug('Running LinkExtractor...');
      
      const links = await page.evaluate(() => {
        const elements = document.querySelectorAll('a[href]:not([href^="javascript:"]):not([href="#"])');
        console.log(`Found ${elements.length} link elements`);
        
        return Array.from(elements)
          .slice(0, 50) // Limit to 50 links to prevent performance issues
          .map(el => {
            const linkElement = el as HTMLAnchorElement;
            const text = linkElement.innerText?.trim() || linkElement.getAttribute('aria-label') || '';
            const href = linkElement.href || linkElement.getAttribute('href') || '#';
            
            // Create attributes object with only defined values converted to strings
            const attributes: Record<string, string> = {
              href: linkElement.getAttribute('href') || '#'
            };
            
            const title = linkElement.getAttribute('title');
            const ariaLabel = linkElement.getAttribute('aria-label');
            if (title) attributes.title = title;
            if (ariaLabel) attributes['aria-label'] = ariaLabel;
            
            return {
              tagName: 'a',
              id: linkElement.id || undefined,
              classes: linkElement.className ? linkElement.className.split(' ').filter(Boolean) : undefined,
              text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
              attributes,
              isVisible: window.getComputedStyle(linkElement).display !== 'none',
              href, // Store as a direct property for easier access
              selector: linkElement.id ? `#${linkElement.id}` : (linkElement.innerText ? `a:contains("${linkElement.innerText.substring(0, 20)}")` : 'a')
            };
          })
          .filter(link => link.text || link.href); // Only keep links with text or href
      });
      
      logger.debug(`LinkExtractor found ${links.length} links`);
      return links;
    } catch (error) {
      logger.error('Error extracting links', { error });
      return [];
    }
  }
}

export class LandmarkExtractor implements DOMExtractorStrategy {
  name = 'landmarks';
  selector = '[role="main"], [role="navigation"], [role="search"], main, nav, article';
  
  isApplicable(config: DOMExtractionConfig): boolean {
    return true; // Always applicable
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<DOMElement[]> {
    try {
      logger.debug('Running LandmarkExtractor...');
      
      const landmarks = await page.evaluate(() => {
        const elements = document.querySelectorAll('[role="main"], [role="navigation"], [role="search"], main, nav, article');
        console.log(`Found ${elements.length} landmark elements`);
        
        return Array.from(elements)
          .map(el => {
            const landmarkElement = el as HTMLElement;
            return {
              tagName: landmarkElement.tagName.toLowerCase(),
              role: landmarkElement.getAttribute('role') || landmarkElement.tagName.toLowerCase(),
              text: landmarkElement.innerText?.substring(0, 300)?.trim() || '',
              id: landmarkElement.id || undefined,
              selector: landmarkElement.id ? `#${landmarkElement.id}` : (landmarkElement.getAttribute('role') ? `[role="${landmarkElement.getAttribute('role')}"]` : landmarkElement.tagName.toLowerCase())
            };
          });
      });
      
      logger.debug(`LandmarkExtractor found ${landmarks.length} landmarks`);
      return landmarks;
    } catch (error) {
      logger.error('Error extracting landmarks', { error });
      return [];
    }
  }
}

// Register extractors
DOMExtractorRegistry.register(new ButtonExtractor());
DOMExtractorRegistry.register(new InputExtractor());
DOMExtractorRegistry.register(new LinkExtractor());
DOMExtractorRegistry.register(new LandmarkExtractor());
