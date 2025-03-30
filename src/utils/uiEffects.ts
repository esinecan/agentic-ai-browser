import { ElementHandle, Page } from "playwright";
import logger from "./logger.js";

/**
 * Highlight an element with a temporary red border
 */
export async function highlightElement(elementHandle: ElementHandle | null): Promise<void> {
  if (!elementHandle) return;
  
  try {
    await elementHandle.evaluate((node) => {
      // Cast Node to HTMLElement to access style properties
      const el = node as HTMLElement;
      
      // Store original outline to restore later
      const originalOutline = el.style.outline;
      el.setAttribute('data-original-outline', originalOutline);
      
      // Add our highlight
      el.style.outline = '2px solid red';
      el.style.outlineOffset = '1px';
      
      // Optional: Remove highlight after a few seconds
      setTimeout(() => {
        el.style.outline = originalOutline;
      }, 2000);
    });
  } catch (error) {
    // Don't let highlighting errors break core functionality
    logger.debug('Error highlighting element', { error });
  }
}

/**
 * Set or update a status overlay in the bottom-left corner of the page
 */
export async function setOverlayStatus(page: Page, statusText: string): Promise<void> {
  try {
    await page.evaluate((text) => {
      // Check if overlay exists
      let overlay = document.querySelector('#agent-overlay') as HTMLElement;
      if (!overlay) {
        // Create overlay if it doesn't exist
        overlay = document.createElement('div');
        overlay.id = 'agent-overlay';
        
        // Style the overlay
        overlay.style.position = 'fixed';
        overlay.style.bottom = '10px';
        overlay.style.left = '10px';
        overlay.style.zIndex = '999999'; // Ensure it's on top
        overlay.style.background = 'rgba(0, 0, 0, 0.7)';
        overlay.style.color = 'white';
        overlay.style.padding = '8px 12px';
        overlay.style.fontFamily = 'Arial, sans-serif';
        overlay.style.fontSize = '14px';
        overlay.style.borderRadius = '4px';
        overlay.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        overlay.style.transition = 'opacity 0.3s';
        overlay.style.pointerEvents = 'none'; // Ensure it doesn't interfere with clicking
        
        document.body.appendChild(overlay);
      }
      
      // Update text with a small animation effect
      overlay.style.opacity = '0.8';
      overlay.innerText = text;
      
      // Flash effect
      setTimeout(() => {
        overlay.style.opacity = '0.6';
      }, 100);
      
      setTimeout(() => {
        overlay.style.opacity = '0.8';
      }, 300);
    }, statusText);
  } catch (error) {
    // Don't let overlay errors break core functionality
    logger.debug('Error setting overlay status', { error });
  }
}

/**
 * Clear the highlight from all elements
 */
export async function clearHighlights(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[data-original-outline]').forEach((node: Node) => {
        // Cast Node to HTMLElement
        const el = node as HTMLElement;
        const originalOutline = el.getAttribute('data-original-outline');
        el.style.outline = originalOutline || '';
        el.removeAttribute('data-original-outline');
      });
    });
  } catch (error) {
    logger.debug('Error clearing highlights', { error });
  }
}
