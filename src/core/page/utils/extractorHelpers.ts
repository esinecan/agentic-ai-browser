import { Page } from 'playwright';
import { visibilityHelperScript } from './visibilityHelper.js';
import logger from '../../../utils/logger.js';

/**
 * Safe evaluate function that includes the visibility helper
 * and provides error handling
 */
export async function safeEvaluateWithVisibility<T>(
  page: Page,
  fn: string | Function,
  fallback: T
): Promise<T> {
  try {
    // If function is passed as string, use it directly
    if (typeof fn === 'string') {
      return await page.evaluate(`
        ${visibilityHelperScript}
        ${fn}
      `) as T;
    }
    
    // Otherwise, serialize the function and inject the helper
    const fnStr = fn.toString();
    const wrappedFn = `
      ${visibilityHelperScript}
      (${fnStr})()
    `;
    
    return await page.evaluate(wrappedFn) as T;
  } catch (error) {
    logger.error('Error in safeEvaluateWithVisibility', { error });
    return fallback;
  }
}

/**
 * Common DOM utilities that can be injected into page.evaluate calls
 */
export const domUtilities = `
  function getTextContent(element) {
    return (element.innerText || element.textContent || '').trim();
  }
  
  function getAttributeSafe(element, attrName) {
    try {
      return element.getAttribute(attrName) || undefined;
    } catch (e) {
      return undefined;
    }
  }
  
  function getClassNames(element) {
    if (typeof element.className === 'string') {
      return element.className.split(' ').filter(Boolean);
    } 
    
    // Handle SVGAnimatedString
    if (element.className && element.className.baseVal !== undefined) {
      return element.className.baseVal.split(' ').filter(Boolean);
    }
    
    // Fallback to class attribute
    const classAttr = element.getAttribute('class');
    return classAttr ? classAttr.split(' ').filter(Boolean) : undefined;
  }
`;

/**
 * Utility for extracting the most relevant selector for an element
 */
export function buildSelectorScript(): string {
  return `
    function buildSelector(element) {
      // Try ID first as it's most specific
      if (element.id) {
        return \`#\${element.id}\`;
      }
      
      // Try data attributes which are often stable
      for (const attr of ['data-testid', 'data-id', 'data-automation']) {
        const value = element.getAttribute(attr);
        if (value) {
          return \`[\${attr}="\${value}"]\`;
        }
      }
      
      // For inputs, use name attribute
      if (element.tagName === 'INPUT' && element.getAttribute('name')) {
        return \`input[name="\${element.getAttribute('name')}"]\`;
      }
      
      // For links with href
      if (element.tagName === 'A' && element.getAttribute('href')) {
        return \`a[href="\${element.getAttribute('href')}"]\`;
      }
      
      // Use tag name with class as fallback
      const classNames = getClassNames(element);
      if (classNames && classNames.length) {
        return \`\${element.tagName.toLowerCase()}.\${classNames[0]}\`;
      }
      
      // Last resort, just use tag name
      return element.tagName.toLowerCase();
    }
  `;
}
