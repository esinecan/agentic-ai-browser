import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { Page } from 'playwright';

/**
 * Returns a structured representation of the page content using Cheerio.
 */
export async function generatePageSummary(page: Page, domSnapshot: any): Promise<string> {
  const htmlContent = await page.content();
  const $: cheerio.CheerioAPI = cheerio.load(htmlContent);

  $('script, style, svg, noscript').remove();

  let summary = '';

  // Page metadata
  summary += `PAGE TITLE: ${domSnapshot.title || 'No title'}\n\n`;

  // Major content sections from landmarks
  if (domSnapshot.landmarks?.length) {
    summary += "MAIN CONTENT AREAS:\n";
    domSnapshot.landmarks.forEach((landmark: any) => {
      if (landmark.text?.trim()) {
        const cleanText = landmark.text.replace(/\s+/g, ' ').trim();
        summary += `[${landmark.role}] ${cleanText.substring(0, 300)}${cleanText.length > 300 ? '...' : ''}\n`;
      }
    });
    summary += "\n";
  }

  // Headings
  if (domSnapshot.headings?.length) {
    summary += "HEADINGS:\n";
    domSnapshot.headings.forEach((heading: any) => {
      const cleanHeadingText = heading.text.replace(/\s+/g, ' ').trim();
      summary += `${heading.tag.toUpperCase()}: ${cleanHeadingText}\n`;
    });
    summary += "\n";
  }

  // Interactive elements (buttons, links, inputs)
  summary += "INTERACTIVE ELEMENTS:\n";

  $('a, button, input, select, textarea').each((_: number, elem: Element) => {
    const tag = elem.tagName.toLowerCase();
    const id = $(elem).attr('id');
    const classes = $(elem).attr('class');
    const text = ($(elem).text().trim() || $(elem).attr('placeholder') || '').replace(/\s+/g, ' ').trim();
  
    let selector = tag;
    if (id) selector = `#${id}`;
    else if (classes) selector = `${tag}.${classes.split(' ').join('.')}`;
  
    summary += `- ${tag.toUpperCase()}: selector="${selector}", text="${text}"\n`;
  });
  

  // Extract clean text
  const meaningfulText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 1000);
  summary += `\nPAGE CONTENT:\n${meaningfulText}${meaningfulText.length >= 1000 ? '...' : ''}`;

  return summary;
}
