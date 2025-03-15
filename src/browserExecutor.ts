import { chromium, Browser, Page, ElementHandle, BrowserContext } from "playwright";
import dotenv from "dotenv";
import { z } from "zod";
import logger from './utils/logger.js';

dotenv.config();

export const DEFAULT_NAVIGATION_TIMEOUT = 30000;
export const RETRY_DELAY_MS = 2000;
export const SIMILARITY_THRESHOLD = 0.7;

// Define and export the action schema and type.
export const ActionSchema = z.object({
  type: z.enum(["click", "input", "navigate", "wait", "sendHumanMessage"]),
  element: z.string().optional(),
  value: z.string().optional(),
  description: z.string().optional(),
  selectorType: z.enum(["css", "xpath", "text"]).optional().default("css"),
  maxWait: z.number().optional().default(2000),
  question: z.string().optional(),
  previousUrl: z.string().optional(),
});
export type Action = z.infer<typeof ActionSchema>;

// Graph context interface shared with your state machine.
export interface GraphContext {
  browser?: Browser;
  page?: Page;
  action?: Action;
  retries?: number;
  history: string[];
  actionHistory?: Action[];   // Added to track actions for redundancy detection
  actionFeedback?: string;    // Added to provide feedback to LLMs about repetitive actions
  startTime?: number;
  lastScreenshot?: string;
  userGoal?: string;  
  
  // Success tracking fields
  successfulActions?: string[];  // Track successful actions
  lastActionSuccess?: boolean;   // Was the last action successful?
  successCount?: number;         // Count of consecutive successes
  previousPageState?: any;       // Store previous page state for comparison
  milestones?: string[];         // Milestones based on goal
  recognizedMilestones?: string[]; // Milestones achieved
  
  // Page content fields
  pageContent?: string;         // Structured content from page
  pageSummary?: string;        // Summary of the page content for LLM context
  lastSelector?: string;        // Last selector that was attempted
  compressedHistory?: string[]; // Compressed version of action history
}

export async function launchBrowser(): Promise<Browser> {
  logger.browser.action('launch', {
    executable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: process.env.HEADLESS !== "false"
  });

  try {
    const browser = await chromium.launch({
      headless: process.env.HEADLESS !== "false",
      timeout: DEFAULT_NAVIGATION_TIMEOUT,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    });

    logger.info('Browser launched successfully');
    return browser;
  } catch (error) {
    logger.browser.error('launch', error);
    throw error;
  }
}

// Create a new page and navigate to the starting URL.
export async function createPage(browser: Browser): Promise<Page> {
  logger.browser.action('createPage', {
    startUrl: process.env.START_URL || "https://online.bonjourr.fr/"
  });

  try {
    const page = await browser.newPage();
    await page.goto(process.env.START_URL || "https://online.bonjourr.fr/");
    
    logger.info('Page created and navigated to start URL', {
      url: await page.url(),
      title: await page.title()
    });
    
    return page;
  } catch (error) {
    logger.browser.error('createPage', error);
    throw error;
  }
}

// Simple manual retry function.
export async function doRetry<T>(
  fn: () => Promise<T>,
  retries: number = 2,
  delayMs: number = 1000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (++attempt > retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Verify if an element exists on the page
 */
export async function verifyElementExists(
  page: Page, 
  selector: string, 
  selectorType: string = "css"
): Promise<{exists: boolean, count: number, suggestion: string | null}> {
  logger.browser.action('verifyElement', {
    selector,
    selectorType
  });

  try {
    // Create a mock action to use with the elementFinder
    const mockAction: Action = {
      type: "click",
      element: selector,
      selectorType: selectorType as "css" | "xpath" | "text",
      maxWait: 2000
    };
    
    // Try to find the element
    const element = await elementFinder.findElement(page, mockAction);
    
    if (element) {
      // Count elements
      let count = 1;
      try {
        if (selectorType === "css") {
          count = await page.$$eval(selector, elements => elements.length);
        } else if (selectorType === "xpath") {
          count = await page.$$eval(`xpath=${selector}`, elements => elements.length);
        } else {
          count = await page.$$eval(`text=${selector}`, elements => elements.length);
        }
      } catch (e) {
        // Keep count as 1 if we couldn't determine actual count
      }
      
      return {
        exists: true,
        count,
        suggestion: null
      };
    }
    
    // Get alternative suggestions
    const alternatives = await elementFinder.getAlternativeSuggestions(page, selector);
    const suggestion = alternatives.length > 0 ? `Try instead: ${alternatives.join(', ')}` : null;
    
    return { exists: false, count: 0, suggestion };
  } catch (e) {
    logger.browser.error('verifyElement', {
      error: e,
      selector,
      selectorType
    });
    logger.error("Error in verifyElementExists:", e);
    return { exists: false, count: 0, suggestion: null };
  }
}

// Import the new ElementFinder
import { elementFinder } from "./core/element-selection/ElementFinder.js";

// Helper: Get an element based on the action's selector.
export async function getElement(
  page: Page,
  action: Action
): Promise<ElementHandle | null> {
  logger.browser.action('getElement', {
    selector: action.element,
    type: action.type,
    selectorType: action.selectorType
  });

  return doRetry(async () => {
    const element = await elementFinder.findElement(page, action);
    if (element) return element;
    
    throw new Error(`No matching element found for ${action.type} action with selector: ${action.element}`);
  }, 2);
}

// Dummy text similarity function (replace with a proper implementation as needed).
export function textSimilarity(a: string, b: string): number {
  return a === b ? 1 : 0;
}

// Search the DOM for the best matching element based on a reference string.
export async function findBestMatch(
  page: Page,
  reference: string
): Promise<string | null> {
  logger.debug('Finding best match', {
    reference,
    currentUrl: page.url()
  });

  try {
    // First try exact match
    const exactMatch = await page.$(reference);
    if (exactMatch) {
      return reference;
    }

    // Common patterns and their alternatives (moved from verbose logging to direct checks)
    const patternMatches: {[key: string]: string[]} = {
      'input[type=text]': [
        'textarea',
        '[role=searchbox]',
        '[role=search] input',
        'input[name=q]'
      ],
      'button[type=submit]': [
        '[role=button][aria-label*="search" i]',
        'button.search-button',
        'input[type=submit]',
        '[role=search] button'
      ]
    };

    // Check pattern matches first
    for (const [pattern, alternatives] of Object.entries(patternMatches)) {
      if (reference.includes(pattern)) {
        for (const alt of alternatives) {
          const exists = await page.$(alt);
          if (exists) {
            logger.debug('Found alternative selector', {
              original: reference,
              match: alt
            });
            return alt;
          }
        }
      }
    }

    // If no pattern match, try DOM search with minimal logging
    const bestElement = await page.evaluate((ref) => {
      const elements = document.querySelectorAll('*');
      let bestMatch = null;
      let bestScore = 0;

      for (const el of elements) {
        let score = 0;
        // Prioritize matching attributes
        if (el.id && el.id.includes(ref)) score += 3;
        if (el.getAttribute('name') === ref) score += 2;
        if (el.getAttribute('role') === ref) score += 2;
        if (el.textContent?.toLowerCase().includes(ref.toLowerCase())) score += 1;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            name: el.getAttribute('name'),
            role: el.getAttribute('role')
          };
        }
      }
      return bestScore > 0 ? bestMatch : null;
    }, reference);

    if (bestElement) {
      // Build selector from best match
      const selector = buildSelectorFromMatch(bestElement);
      
      logger.debug('Found best element match', {
        original: reference,
        match: selector
      });
      
      return selector;
    }

    logger.debug('No match found', { reference });
    return null;
  } catch (error) {
    logger.error('Error finding best match', {
      error,
      reference
    });
    return null;
  }
}

// Helper function to build a selector from element properties
function buildSelectorFromMatch(match: any): string {
  if (match.id) return `#${match.id}`;
  if (match.name) return `${match.tag}[name="${match.name}"]`;
  if (match.role) return `[role="${match.role}"]`;
  return match.tag;
}

// Capture a snapshot of the current page state and save a screenshot locally.
export async function getPageState(page: Page): Promise<object> {
  logger.browser.action('getState', { url: page.url() });

  try {
    const url = page.url();
    const title = await page.title();

    // Extract DOM snapshot with retry for navigation errors
    let domSnapshot;
    try {
      domSnapshot = await extractDOMSnapshot(page);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Execution context was destroyed')) {
        logger.warn('Context destroyed during snapshot, waiting for navigation to complete');
        // Wait for navigation to complete
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        // Try again with a more lightweight extraction
        domSnapshot = await extractDOMSnapshotLite(page);
      } else {
        throw err;
      }
    }

    // Use pageInterpreter to return unified page content
    const { generatePageSummary } = await import('./pageInterpreter.js');
    const pageContent = await generatePageSummary(page, domSnapshot);

    logger.debug('Page state captured', {
      url,
      title,
      pageContentLength: pageContent.length
    });

    return {
      url,
      title,
      pageContent
    };
  } catch (error) {
    logger.browser.error('getState', error);
    return {
      url: page.url(),
      title: await page.title(),
      error: "Failed to extract page content",
      pageContent: ""
    };
  }
}

// Lightweight version of DOM snapshot for recovery situations
async function extractDOMSnapshotLite(page: Page): Promise<any> {
  // Breaking the extraction into smaller chunks to avoid long-running evaluations
  const title = await page.title().catch(() => "");
  
  // Get raw content separately with a short timeout
  const rawContent = await page.evaluate(() => document.body.innerHTML.substring(0, 5000))
    .catch(() => "Content extraction failed");
  
  // Get headings in a separate evaluation
  const headings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => ({
        tag: h.tagName.toLowerCase(),
        text: h.textContent?.trim() || ''
      }));
  }).catch(() => []);
  
  // Get basic link information
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .slice(0, 20) // Limit to first 20 links for speed
      .map(a => ({
        text: a.textContent?.trim() || '',
        url: a.href || ''
      }));
  }).catch(() => []);
  
  return {
    title,
    headings,
    links,
    rawContent
  };
}

// Split the original extractDOMSnapshot into smaller parts
async function extractDOMSnapshot(page: Page): Promise<any> {
  // Use Promise.all to run these extractions in parallel for speed
  const [title, rawContent, headings, links, buttons, inputs, landmarks] = await Promise.all([
    page.title().catch(() => ""),
    
    page.evaluate(() => document.body.innerHTML.substring(0, 5000))
      .catch(() => "Failed to get content"),
    
    page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(h => ({
          tag: h.tagName.toLowerCase(),
          text: h.textContent?.trim() || ''
        }));
    }).catch(() => []),
    
    page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .slice(0, 30) // Limit to reduce execution time
        .map(a => ({
          text: a.textContent?.trim() || '',
          url: a.href || '',
          title: a.getAttribute('title') || null,
          aria: a.getAttribute('aria-label') || null
        }));
    }).catch(() => []),
    
    page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, [role="button"]'))
        .slice(0, 20)
        .map(b => b.textContent?.trim() || b.getAttribute('aria-label') || b.getAttribute('title') || '');
    }).catch(() => []),
    
    page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, select'))
        .slice(0, 20)
        .map(input => {
          if (input instanceof HTMLInputElement) {
            return {
              type: input.type,
              name: input.name,
              id: input.id,
              placeholder: input.placeholder || null
            };
          }
          return { id: input.id || input.getAttribute('name') || 'input field' };
        });
    }).catch(() => []),
    
    page.evaluate(() => {
      return Array.from(
        document.querySelectorAll('[role="main"], [role="navigation"], [role="search"], main, nav, article')
      ).slice(0, 10)
      .map(l => ({
        role: l.getAttribute('role') || l.tagName.toLowerCase(),
        text: l.textContent?.substring(0, 100)?.trim() || null
      }));
    }).catch(() => [])
  ]);
  
  return {
    title,
    headings,
    links,
    buttons,
    inputs,
    landmarks,
    rawContent
  };
}

// Verify that an action succeeded based on its type.
export async function verifyAction(page: Page, action: Action): Promise<boolean> {
  // Add INFO level logging here with full action object
  logger.info('Verifying action', {
    actionType: action.type,
    actionDetails: action,  // Log the entire action object
    url: page.url()
  });

  logger.browser.action('verifyAction', {
    type: action.type,
    element: action.element,
    value: action.value
  });

  const startTime = Date.now();
  let success = false;
  
  try {
    success = await doRetry(async () => {
      switch (action.type) {
        case "click": {
          const element = await getElement(page, action);
          if (!element) return false;
          try {
            await Promise.race([
              element.waitForElementState("hidden", { timeout: action.maxWait / 2 }),
              element.waitForElementState("disabled", {
                timeout: action.maxWait / 2,
              }),
            ]);
            return true;
          } catch {
            return false;
          }
        }
        case "input": {
          const element = await getElement(page, action);
          if (!element) return false;
          const value = await element.inputValue();
          return value === action.value;
        }
        case "navigate": {
          const currentUrl = page.url();
          return currentUrl.includes(action.value || "");
        }
        case "sendHumanMessage": // Always consider human interaction successful
          return true;
        case "wait":
          return true;
        default:
          return false;
      }
    }, 2);

    logger.debug('Action verification result', {
      type: action.type,
      success,
      url: page.url()
    });

    // Add completion INFO log
    logger.info(`Action verification ${success ? 'succeeded' : 'failed'}`, {
      type: action.type,
      element: action.element,
      duration: `${Date.now() - startTime}ms`
    });

    return success;
  } catch (error) {
    logger.browser.error('verifyAction', {
      error,
      action
    });
    return false;
  } finally {
    const duration = Date.now() - startTime;
    logger.debug(`Action verification ${success ? 'passed' : 'failed'}`, { 
      type: action.type,
      duration: `${duration}ms`,
      element: action.element,
      value: action.value
    });
  }
}

/**
 * Compress history to make it more manageable for LLMs
 */
export function compressHistory(history: string[], maxItems: number = 5): string[] {
  if (history.length <= maxItems) return history;
  
  // Keep the first action (initial navigation)
  const compressed: string[] = [history[0]];
  
  // Find repeated patterns
  const patternCounts = findRepeatedPatterns(history);
  
  // Add information about repeated patterns
  for (const pattern of patternCounts) {
    if (pattern.count > 2) {
      compressed.push(`Tried ${pattern.pattern} ${pattern.count} times ${pattern.success ? 'successfully' : 'without success'}`);
    }
  }
  
  // Add the most recent actions
  const recentItems = Math.min(3, maxItems - compressed.length);
  if (recentItems > 0) {
    compressed.push(...history.slice(-recentItems));
  }
  
  return compressed;
}

/**
 * Find repeated patterns in the history
 */
function findRepeatedPatterns(history: string[]): { pattern: string, count: number, success: boolean }[] {
  const patterns: Map<string, { count: number, success: boolean }> = new Map();
  
  for (const item of history) {
    // Look for common action patterns
    let matched = false;
    
    // Click pattern
    const clickMatch = item.match(/Clicked (.+?)( successfully)?/);
    if (clickMatch) {
      const key = `clicking ${clickMatch[1]}`;
      const success = !!clickMatch[2];
      const current = patterns.get(key) || { count: 0, success };
      patterns.set(key, { count: current.count + 1, success });
      matched = true;
    }
    
    // Input pattern
    const inputMatch = item.match(/Input '(.+?)' to (.+)/);
    if (inputMatch) {
      const key = `inputting text to ${inputMatch[2]}`;
      const current = patterns.get(key) || { count: 0, success: true };
      patterns.set(key, { count: current.count + 1, success: current.success });
      matched = true;
    }
    
    // Navigation pattern
    const navMatch = item.match(/Navigated to: (.+)/);
    if (navMatch) {
      const key = `navigating`;
      const current = patterns.get(key) || { count: 0, success: true };
      patterns.set(key, { count: current.count + 1, success: current.success });
      matched = true;
    }
  }
  
  // Convert to array and sort by count
  return Array.from(patterns.entries())
    .map(([pattern, stats]) => ({ pattern, count: stats.count, success: stats.success }))
    .filter(p => p.count > 1) // Only return patterns that occurred more than once
    .sort((a, b) => b.count - a.count);
}

// In the navigate action handler function
export async function navigate(page: Page, url: string): Promise<boolean> {
  try {
    // Check if the URL is relative and make it absolute if necessary
    if (url.startsWith('/') && page.url()) {
      try {
        const currentUrl = new URL(page.url());
        url = `${currentUrl.origin}${url}`;
        logger.debug('Converted relative URL to absolute', { 
          relative: url,
          absolute: `${currentUrl.origin}${url}`
        });
      } catch (err) {
        logger.error("Failed to parse current URL:", err);
      }
    }
    
    // Validate URL before navigation
    try {
      new URL(url);
    } catch (e) {
      logger.error(`Invalid URL: ${url}`);
      return false;
    }
    
    // Now proceed with the navigation
    await page.goto(url, { timeout: DEFAULT_NAVIGATION_TIMEOUT });
    return true;
  } catch (error) {
    logger.error(`Navigation failed: ${error}`);
    return false;
  }
}