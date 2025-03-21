import { Page } from 'playwright';
import { BaseExtractor } from './base.js';
import { DOMExtractionConfig } from '../types.js';
import logger from '../../../utils/logger.js';

export class ImageExtractor extends BaseExtractor {
  constructor() {
    super('images', 'img[src]:not([src=""]), [role="img"][aria-label]');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<any> {
    try {
      return this.safeEvaluate(
        page,
        (selector) => {
          return Array.from(document.querySelectorAll(selector))
            .filter(img => {
              // Basic visibility check
              const rect = img.getBoundingClientRect();
              const style = window.getComputedStyle(img);
              return rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' && 
                style.visibility !== 'hidden';
            })
            .map(img => ({
              src: img.getAttribute('src'),
              alt: img.getAttribute('alt') || undefined,
              title: img.getAttribute('title') || undefined,
              width: (img as HTMLImageElement).width || undefined,
              height: (img as HTMLImageElement).height || undefined,
              ariaLabel: img.getAttribute('aria-label') || undefined
            }))
            .filter(img => img.src || img.ariaLabel);
        },
        []
      );
    } catch (error) {
      logger.error('Error extracting images', { error });
      return [];
    }
  }
}

export class FrameExtractor extends BaseExtractor {
  constructor() {
    super('frames', 'iframe');
  }
  
  async extract(page: Page, config: DOMExtractionConfig): Promise<any> {
    return this.safeEvaluate(
      page,
      (selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map(frame => {
            // Cast to HTMLIFrameElement to access properties like width and height
            const iframeElement = frame as HTMLIFrameElement;
            return {
              src: frame.getAttribute('src') || undefined,
              title: frame.getAttribute('title') || undefined,
              width: iframeElement.width || frame.getAttribute('width') || undefined,
              height: iframeElement.height || frame.getAttribute('height') || undefined,
              isVisible: iframeElement.offsetWidth > 0 && iframeElement.offsetHeight > 0
            };
          });
      },
      []
    );
  }
}
