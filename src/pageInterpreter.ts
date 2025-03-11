import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { Page } from 'playwright';

/**
 * Returns a structured representation of the page content using Cheerio.
 */
export async function generatePageSummary(page: Page, domSnapshot: any): Promise<string> {
  const htmlContent = await page.content();
  const $ = cheerio.load(htmlContent);

  // Remove irrelevant elements.
  $('script, style, svg, noscript, iframe, meta, link').remove();

  let summary = '';

  // Page metadata.
  const title = $('title').text().trim() || domSnapshot.title || 'No title';
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';
  summary += `PAGE TITLE: ${title}\n`;
  if (metaDescription) {
    summary += `META DESCRIPTION: ${metaDescription}\n`;
  }
  summary += '\n';

  // Major content sections from landmarks.
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

   // Extract a snippet of body text.
   const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
   summary += `PAGE CONTENT:\n${bodyText.substring(0, 5000)}${bodyText.length > 5000 ? '...' : ''}\n`;

  // Interactive elements.
  summary += "INTERACTIVE ELEMENTS:\n";
  $('a, button, input, select, textarea').each((_, el) => {
    const element = el as Element;
    const tag = element.tagName ? element.tagName.toLowerCase() : 'unknown';
    const id = $(el).attr('id');
    const classes = $(el).attr('class');
    const href = $(el).attr('href');
    const text = (($(el).text().trim() || $(el).attr('placeholder') || '').replace(/\s+/g, ' ')).trim();
  
    if(text && text.length > 0) {
      let selector = tag;
      if (id) {
        selector = `#${id}`;
      } else if (classes) {
        selector = `${tag}.${classes.split(' ').join('.')}`;
      } else if (href) {
        selector = `${tag}.${href}`;
      }
    
      summary += `- ${tag.toUpperCase()}: selector="${selector}", text="${text}"\n`;
    }
  });
  summary += "\n";
  return summary;
}
