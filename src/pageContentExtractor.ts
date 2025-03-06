import { Page } from 'playwright';

export async function extractPageContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    function extractStructuredContent(node: Node, depth = 0, maxDepth = 4): string {
      if (!node || depth > maxDepth) return '';
      
      // Skip invisible elements and script/style tags
      if (node instanceof Element) {
        try {
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || 
              ['SCRIPT', 'STYLE', 'META', 'LINK'].includes(node.tagName)) {
            return '';
          }
        } catch (e) {
          // Handle cases where getComputedStyle fails
          return '';
        }
      }
      
      let content = '';
      const indent = '  '.repeat(depth);
      
      // Handle text nodes
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() || '';
        return text ? `${text} ` : '';
      }
      
      // Handle element nodes
      if (node instanceof Element) {
        // Special handling for important elements
        const tagName = node.tagName.toLowerCase();
        const id = node.id ? `#${node.id}` : '';
        const className = typeof node.className === 'string' ? 
                         `.${node.className.split(' ')[0]}` : '';
        
        // Track if we've added a label for this element
        let elementLabeled = false;
        
        // Headings get special treatment
        if (/^h[1-6]$/.test(tagName)) {
          content += `${indent}<${tagName}${id}${className}>${node.textContent?.trim()}</${tagName}>\n`;
          elementLabeled = true;
        } 
        // Special handling for structural elements
        else if (['main', 'section', 'article', 'nav', 'aside', 'header', 'footer'].includes(tagName) || id) {
          content += `${indent}<${tagName}${id}${className}>\n`;
          
          // Process children with increased depth
          for (const child of node.childNodes) {
            content += extractStructuredContent(child, depth + 1, maxDepth);
          }
          
          content += `${indent}</${tagName}>\n`;
          return content;
        }
        // Special handling for interactive elements
        else if (['a', 'button', 'input', 'select', 'textarea'].includes(tagName)) {
          // Extract useful attributes
          const href = node.getAttribute('href') ? ` href="${node.getAttribute('href')}"` : '';
          const type = node.getAttribute('type') ? ` type="${node.getAttribute('type')}"` : '';
          const placeholder = node.getAttribute('placeholder') ? ` placeholder="${node.getAttribute('placeholder')}"` : '';
          let value = '';
          
          // Type-safe value extraction
          if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
            value = node.value ? ` value="${node.value}"` : '';
          }
          
          content += `${indent}<${tagName}${id}${className}${type}${href}${placeholder}${value}>`;
          
          // Add text content if available
          const text = node.textContent?.trim();
          if (text) {
            content += text;
          }
          
          content += `</${tagName}>\n`;
          elementLabeled = true;
        }
        // Special handling for lists
        else if (tagName === 'ul' || tagName === 'ol') {
          content += `${indent}<${tagName}${id}${className}>\n`;
          const items = Array.from(node.children).filter(el => el.tagName.toLowerCase() === 'li');
          for (const item of items) {
            content += `${indent}  • ${item.textContent?.trim()}\n`;
          }
          content += `${indent}</${tagName}>\n`;
          elementLabeled = true;
        }
        // Special handling for tables
        else if (tagName === 'table') {
          content += `${indent}<table${id}${className}>\n`;
          const rows = Array.from(node.querySelectorAll('tr'));
          for (const row of rows) {
            content += `${indent}  |`;
            const cells = Array.from(row.querySelectorAll('td, th'));
            for (const cell of cells) {
              content += ` ${cell.textContent?.trim()} |`;
            }
            content += '\n';
          }
          content += `${indent}</table>\n`;
          elementLabeled = true;
        }
        
        // For elements we haven't specifically labeled, process children
        if (!elementLabeled) {
          for (const child of node.childNodes) {
            content += extractStructuredContent(child, depth, maxDepth);
          }
        }
      }
      
      return content;
    }
    
    // Start extraction from body with fallback
    const body = document.body || document.documentElement;
    if (!body) return 'Failed to extract page content - no body element found';
    
    const content = extractStructuredContent(body);
    return content.trim().replace(/\n{3,}/g, '\n\n'); // Clean up excessive newlines
  });
}