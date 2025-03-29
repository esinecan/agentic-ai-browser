import cssesc from 'cssesc';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { Page } from 'playwright';
// Import the new DOM extraction system
import { PageAnalyzer } from './core/page/analyzer.js';
import { DOMSnapshot, DOMElement } from './core/page/types.js';

/**
 * Returns a structured representation of the page content using the DOM extraction system.
 */
export async function generatePageSummary(page: Page, domSnapshot: any): Promise<string> {
  // Use our new DOM extraction system for more comprehensive data if not already provided
  const fullSnapshot: DOMSnapshot = domSnapshot && domSnapshot.url ? 
                                  domSnapshot : 
                                  await PageAnalyzer.extractComprehensiveSnapshot(page);
  
  let summary = '';
  
  // Page metadata
  summary += `PAGE TITLE: ${fullSnapshot.title}\n`;
  if (fullSnapshot.content?.metaDescription) {
    summary += `META DESCRIPTION: ${fullSnapshot.content.metaDescription}\n`;
  }
  summary += '\n';
  
  // Main content areas from landmarks - Add square brackets
  if (fullSnapshot.elements?.landmarks?.length) {
    summary += "MAIN CONTENT AREAS:\n";
    fullSnapshot.elements.landmarks.forEach((landmark: DOMElement) => {
      if (landmark.text?.trim()) {
        const cleanText = "[" + landmark.text.replace(/\t/g, '').trim() + "]"; // Remove tab characters but keep newlines
        summary += `[${landmark.role}] ${cleanText.substring(0, 600)}${cleanText.length > 600 ? '...' : ''}\n`; // Double limit from 300
      }
    });
    summary += "\n";
  }
  
  // Extract main content - Double content limit
  if (fullSnapshot.content?.mainContent) {
    summary += `PAGE CONTENT:\n${fullSnapshot.content.mainContent}\n\n`;
  } else {
    // Fallback to raw HTML content if needed
    const htmlContent = await page.content();
    const $ = cheerio.load(htmlContent);
    $('script, style, svg, noscript, iframe, meta, link').remove();
    const bodyText = "[" + $('body').text().replace(/\t/g, '').replace(/\n/g, '').trim() + "]"; // Remove tabs but keep newlines
    summary += `PAGE CONTENT:\n${bodyText.substring(0, 10000)}${bodyText.length > 20000 ? '...' : ''}\n\n`; // Double limit from 5000
  }
  
  // Interactive elements - Add square brackets
  summary += "INTERACTIVE ELEMENTS:\n";
  
  // Add inputs with square brackets for labels/placeholders
  if (fullSnapshot.elements?.inputs?.length) {
    fullSnapshot.elements.inputs.forEach(input => {
      const type = input.attributes?.type || input.tagName;
      const id = input.id ? `#${input.id}` : '';
      const name = input.attributes?.name;
      const nameSelector = name ? `[name="${name}"]` : '';
      const selector = id || (input.tagName + nameSelector);
      const placeholder = input.attributes?.placeholder || '';
      
      summary += `- INPUT: selector="${selector}", type="${type}"${placeholder ? `, placeholder="[${placeholder}]"` : ''}\n`;
    });
  }
  
  // Add forms from our advanced extractors
  if (fullSnapshot.elements?.forms?.length) {
    fullSnapshot.elements.forms.forEach((form: DOMElement) => {
      const id = form.id ? `#${form.id}` : 'form';
      const method = form.method || 'GET';
      const submitText = form.submitText || 'Submit';
      
      summary += `- FORM: selector="${id}", method="${method}", submit="${submitText}"\n`;
      
      if (form.inputs && Array.isArray(form.inputs)) {
        form.inputs.forEach((input: any) => {
          if (input.label || input.name) {
            summary += `  - field: ${input.label || input.name} (${input.type}${input.required ? ', required' : ''})\n`;
          }
        });
      }
    });
  }

  // Add buttons with square brackets
  if (fullSnapshot.elements?.buttons?.length) {
    fullSnapshot.elements.buttons.forEach(button => {
      if (button.text) {
        const id = button.id ? `#${button.id}` : '';
        const selector = id || (button.classes?.length ? `.${button.classes.join('.')}` : 'button');
        summary += `- BUTTON: selector="${selector}", text="[${button.text}]"\n`;
      }
    });
  }
  
  // Add links (limited to most important)
  const links = fullSnapshot.elements?.links || [];
  const navigationLinks = fullSnapshot. content?.navigation?.[0]?.links || [];
  
  // Prioritize navigation links
  if (navigationLinks.length) {
    summary += "\nNAVIGATION LINKS:\n";
    navigationLinks.slice(0, 100).forEach((link: any) => {
      if (link.text && link.href) {
        summary += `- ${link.text} -> ${link.href}\n`;
      }
    });
  }
  
  if (links.length && links.length <= 100) {
    summary += "\nOTHER LINKS:\n";
    links.forEach((link: DOMElement) => {
      const href = link.href || link.attributes?.href;
      if (link.text && href) {
        summary += `- ${link.text} -> ${href}\n`;
      }
    });
  }
  
  summary += "\n";
  return summary;
}
