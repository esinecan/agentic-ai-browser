/**
 * Utility functions for checking element visibility
 */

/**
 * Determines if an element is visible on the page,
 * accounting for fixed-position elements
 * 
 * @param element The HTML element to check
 * @returns boolean indicating if the element is visible
 */
export function isElementVisible(element: HTMLElement): boolean {
  if (!element || !(element instanceof Element)) return false;
  try {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           (element.offsetParent !== null || style.position === 'fixed');
  } catch (e) {
    console.error('Error checking visibility:', e);
    return false;
  }
}

/**
 * Code to inject into page.evaluate() functions
 * for consistent visibility checking
 */
export const visibilityHelperScript = `
function isElementVisible(element) {
  if (!element || !(element instanceof Element)) return false;
  try {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           (element.offsetParent !== null || style.position === 'fixed');
  } catch (e) {
    console.error('Error checking visibility:', e);
    return false;
  }
}
`;
