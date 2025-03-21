/**
 * Helper script for checking element visibility
 * This is injected into page.evaluate calls
 */
export const visibilityHelperScript = `
  function isElementVisible(element) {
    if (!element) return false;
    
    try {
      const style = window.getComputedStyle(element);
      
      // Check for basic visibility
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      
      // Check if element has dimensions
      if (element.offsetWidth === 0 || element.offsetHeight === 0) {
        return false;
      }
      
      // Check if element is positioned in viewport
      // Make an exception for fixed position elements
      if (style.position !== 'fixed' && element.offsetParent === null) {
        return false;
      }
      
      // Check if element is within viewport
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      
      return true;
    } catch (e) {
      console.error('Error checking visibility:', e);
      return false;
    }
  }
`;
