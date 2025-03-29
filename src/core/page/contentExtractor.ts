import { Page } from 'playwright';
import logger from '../../utils/logger.js';

/**
 * Extracts content from pages progressively, handling both text-heavy pages
 * and dynamically loaded content
 */
export class ContentExtractor {
  private static readonly MAX_CONTENT_LENGTH = 10000;
  private static readonly SCROLL_STEP = 800;
  private static readonly MAX_SCROLLS = 5;
  
  /**
   * Extract content from a page, potentially scrolling to reveal more content
   */
  static async extract(page: Page, options: { 
    maxLength?: number, 
    maxScrolls?: number,
    shouldScroll?: boolean
  } = {}): Promise<{
    content: string,
    truncated: boolean,
    scrolled: boolean,
    contentLength: number,
    originalLength: number
  }> {
    const maxLength = options.maxLength || this.MAX_CONTENT_LENGTH;
    const maxScrolls = options.maxScrolls || this.MAX_SCROLLS;
    const shouldScroll = options.shouldScroll !== undefined ? options.shouldScroll : true;
    
    let content = '';
    let truncated = false;
    let scrolled = false;
    let originalLength = 0;
    
    try {
      // Get initial content
      content = await this.extractVisibleContent(page);
      originalLength = content.length;
      
      logger.debug('Initial content extraction', {
        contentLength: content.length,
        url: page.url()
      });
      
      // If content is short and scrolling is enabled, try to load more
      if (shouldScroll && content.length < maxLength && 
          await this.mightHaveMoreContent(page)) {
        
        scrolled = true;
        // Scroll to reveal more content
        for (let i = 0; i < maxScrolls; i++) {
          // Check if we already have enough content
          if (content.length >= maxLength) break;
          
          // Scroll down
          await page.evaluate(`window.scrollBy(0, ${this.SCROLL_STEP})`);
          // Wait for potential dynamic content to load
          await page.waitForTimeout(300);
          
          // Extract content again after scrolling
          const newContent = await this.extractVisibleContent(page);
          
          // If content didn't change significantly, stop scrolling
          if (newContent.length <= content.length * 1.05) {
            logger.debug('No significant new content after scroll', {
              scrollIndex: i,
              previousLength: content.length,
              newLength: newContent.length
            });
            break;
          }
          
          content = newContent;
          logger.debug('Content after scroll', {
            scrollIndex: i,
            contentLength: content.length
          });
        }
        
        // Scroll back to top
        await page.evaluate('window.scrollTo(0, 0)');
      }
      
      // Truncate if still too large
      if (content.length > maxLength) {
        // Keep first third and last two thirds to maintain context from both parts
        const firstPart = content.substring(0, maxLength / 3);
        const lastPart = content.substring(content.length - (maxLength * 2 / 3));
        content = firstPart + "\n...[Content truncated due to length]...\n" + lastPart;
        truncated = true;
        
        logger.debug('Content truncated', {
          originalLength: originalLength,
          finalLength: content.length
        });
      }
    } catch (error) {
      logger.error('Error extracting page content', { error });
      content = `Error extracting content: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
    
    return {
      content,
      truncated,
      scrolled,
      contentLength: content.length,
      originalLength
    };
  }
  
  /**
   * Extract visible content from the current viewport
   */
  private static async extractVisibleContent(page: Page): Promise<string> {
    return page.evaluate(() => {
      // Clone body to avoid modifying the actual page
      const clone = document.body.cloneNode(true) as HTMLElement;
      
      // Remove scripts, styles, and hidden elements
      const elementsToRemove = clone.querySelectorAll('script, style, noscript, [style*="display:none"], [style*="display: none"], [hidden]');
      elementsToRemove.forEach(el => el.remove());
      
      // Get all visible text
      return clone.innerText || clone.textContent || '';
    });
  }
  
  /**
   * Check if page might have more content below the fold
   */
  private static async mightHaveMoreContent(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const windowHeight = window.innerHeight;
      const documentHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      
      // If document is significantly taller than window, there's likely more content
      return documentHeight > windowHeight * 1.3;
    });
  }
}
