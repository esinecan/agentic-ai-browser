import { chromium, Browser, Page, ElementHandle, BrowserContext } from "playwright";
import dotenv from "dotenv";
import { z } from "zod";
import logger from './utils/logger.js';
// Ensure DOM extractors are registered
import './core/page/initialize.js';
// Import the new DOM extraction system
import { PageAnalyzer } from './core/page/analyzer.js';
// Import the ContentExtractor
import { ContentExtractor } from './core/page/contentExtractor.js';
import type { ChildProcess } from 'child_process';

dotenv.config();

// Global Chrome process reference
let chromeProcess: ChildProcess | null = null;

// Add this to the exported items
export function getChromeProcess(): ChildProcess | null {
  return chromeProcess;
}

export const DEFAULT_NAVIGATION_TIMEOUT = 10000;
export const RETRY_DELAY_MS = 2000;
export const SIMILARITY_THRESHOLD = 0.7;

// Define and export the action schema and type.
export const ActionSchema = z.object({
  type: z.enum(["click", "input", "navigate", "wait", "sendHumanMessage", "notes", "scroll"]),
  element: z.string().optional(),
  value: z.string().optional(),
  description: z.string().optional(),
  selectorType: z.enum(["css", "xpath", "text"]).optional().default("css"),
  maxWait: z.number().optional().default(2000),
  question: z.string().optional(),
  previousUrl: z.string().optional(),
  operation: z.enum(["add", "read"]).optional(),
  note: z.string().optional(),
  direction: z.enum(["up", "down"]).optional(),
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
    userDataDir: process.env.DATA_DIR,
    executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH,
    headless: process.env.HEADLESS !== "false"
  });

  try {
    if (!process.env.DATA_DIR || !process.env.PLAYWRIGHT_BROWSERS_PATH) {
      throw new Error('DATA_DIR and PLAYWRIGHT_BROWSERS_PATH environment variables must be defined');
    }

    const { spawn } = await import('child_process');
    const { existsSync } = await import('fs');
    
    // Verify paths exist
    if (!existsSync(process.env.DATA_DIR)) {
      throw new Error(`User data directory not found: ${process.env.DATA_DIR}`);
    }
    
    // Kill any existing Chrome processes to avoid lock conflicts
    try {
      const { execSync } = await import('child_process');
      execSync('taskkill /F /IM chrome.exe', { stdio: 'ignore' });
      // Give time for file locks to be released
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      // Ignore if no processes were killed
    }
    
    // Launch Chrome with remote debugging enabled
    chromeProcess = spawn(
      process.env.PLAYWRIGHT_BROWSERS_PATH,
      [
        '--remote-debugging-port=9222',
        `--user-data-dir=${process.env.DATA_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-session-crashed-bubble',
        '--start-maximized',
        process.env.HEADLESS !== "false" ? '--headless=new' : ''
      ].filter(Boolean),
      { detached: true, stdio: 'ignore' }  // Use detached: true for better persistence
    );
    
    // Wait for Chrome to start properly by polling the DevTools endpoint
    await waitForChromeDevTools(30000); // 30-second timeout
    
    // Connect to Chrome via CDP
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    
    // Clean up Chrome process when browser is disconnected
    browser.on('disconnected', () => {
      try {
        if (chromeProcess && !chromeProcess.killed) {
          chromeProcess.kill();
        }
      } catch (err) {
        logger.error('Failed to kill Chrome process', err);
      }
    });

    return browser;
  } catch (error) {
    logger.browser.error('launch', error);
    throw error;
  }
}

// Add this helper function
async function waitForChromeDevTools(timeoutMs = 30000): Promise<void> {
  const startTime = Date.now();
  const { default: fetch } = await import('node-fetch');
  
  logger.info('Waiting for Chrome DevTools to become available...');
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch('http://localhost:9222/json/version');
      if (response.ok) {
        logger.info('Chrome DevTools ready!');
        return;
      }
    } catch (e) {
      // Ignore errors during polling
    }
    
    // Wait a bit before trying again
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error(`Chrome DevTools not available after ${timeoutMs}ms`);
}

// Import the new ElementFinder
import { elementFinder } from "./core/elements/finder.js";

// Import the setOverlayStatus function
import { setOverlayStatus } from './utils/uiEffects.js';

// Create a new page and navigate to the starting URL.
export async function createPage(browser: Browser): Promise<Page> {
  logger.browser.action('createPage', {
    startUrl: process.env.START_URL || "https://en.wikipedia.org/wiki/Main_Page"
  });

  try {
    const page = await browser.newPage();
    
    // Set up navigation listener to re-add overlay on page changes
    page.on('load', async () => {
      try {
        // Small delay to ensure DOM is ready
        setTimeout(async () => {
          await setOverlayStatus(page, "Agent is observing page...");
        }, 500);
      } catch (err) {
        // Ignore errors here
      }
    });
    
    await page.goto(process.env.START_URL || "https://en.wikipedia.org/wiki/Main_Page");
    
    // Initialize the overlay after the first page load
    await setOverlayStatus(page, "Agent is initialized and ready");
    
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
    // Fix: Use a more specific type that matches what elementFinder expects
    const mockAction = {
      type: "click" as "click", // Use a type assertion to specify exactly "click"
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

// Helper: Get an element based on the action's selector with improved error handling
export async function getElement(
  page: Page,
  action: Action
): Promise<ElementHandle | null> {
  if (!action.element) {
    logger.error('Undefined selector provided for action', { 
      actionType: action.type,
      action: JSON.stringify(action)
    });
    return null;
  }
  
  const selector = action.element;
  const selectorType = action.selectorType || 'css';
  const startTime = Date.now();
  
  try {
    logger.debug('Looking for element', {
      selector,
      selectorType,
      timeout: action.maxWait || 2000
    });
    
    // Check if element exists using evaluate for better diagnostics
    const elementInfo = await page.evaluate((sel) => {
      try {
        const elements = document.querySelectorAll(sel);
        if (elements.length === 0) return { found: false, count: 0 };
        
        const firstElement = elements[0] as HTMLElement;
        const style = window.getComputedStyle(firstElement);
        return { 
          found: true, 
          count: elements.length,
          isVisible: !!(style.display !== "none" && 
                      style.visibility !== "hidden" &&
                      (firstElement.offsetParent !== null || style.position === "fixed")),
          tagName: firstElement.tagName,
          text: firstElement.textContent?.substring(0, 100)
        };
      } catch (e) {
        return { found: false, error: String(e) };
      }
    }, selector).catch(e => ({ found: false, error: String(e) }));
    
    logger.debug('Element search result', {
      selector,
      result: elementInfo,
      duration: `${Date.now() - startTime}ms`
    });
    
    if (!elementInfo.found) {
      // If not found with regular selector, try alternative methods
      logger.warn(`Element not found with selector: ${selector}`, { elementInfo });
      
      // Check for partial matches or similar elements
      await captureCloseMatches(page, selector);
      return null;
    }
    
    // Element exists, but we still need to get a handle to it
    const elementHandle = await page.$(selector).catch(e => {
      logger.error(`Error getting handle for existing element: ${selector}`, { error: e });
      return null;
    });
    
    return elementHandle;
  } catch (error) {
    logger.error(`Error finding element: ${selector}`, { 
      error,
      selector,
      url: page.url()
    });
    return null;
  }
}

// New helper function to capture potential close matches
async function captureCloseMatches(page: Page, failedSelector: string): Promise<void> {
  try {
    // For failed CSS selectors like #something or .something, try to find similar elements
    const generalizedSelector = failedSelector.startsWith('#') ? 
      '[id*="' + failedSelector.substring(1) + '"]' : 
      failedSelector.startsWith('.') ? 
        '[class*="' + failedSelector.substring(1) + '"]' : null;
    
    if (generalizedSelector) {
      const similarElements = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        return Array.from(elements).slice(0, 5).map(el => ({
          tagName: el.tagName,
          id: el.id || undefined,
          classes: Array.from(el.classList),
          text: el.textContent?.substring(0, 50)
        }));
      }, generalizedSelector).catch(() => []);
      
      if (similarElements.length > 0) {
        logger.debug('Found similar elements', {
          originalSelector: failedSelector,
          generalizedSelector,
          similarElements
        });
      }
    }
    
    // For any selector type, list visible interactive elements as guidance
    const visibleButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, [role="button"], a.btn'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .slice(0, 10)
        .map(el => ({
          tagName: el.tagName,
          id: el.id || undefined,
          classes: Array.from(el.classList),
          text: el.textContent?.trim().substring(0, 50) || undefined,
          selector: el.id ? `#${el.id}` : 
                    el.classList.length ? `.${Array.from(el.classList)[0]}` : el.tagName
        }));
    }).catch(() => []);
    
    if (visibleButtons.length > 0) {
      logger.debug('Visible interactive elements on page that could be used instead', {
        visibleButtons
      });
    }
  } catch (error) {
    logger.error('Error capturing close matches', { error });
  }
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
  logger.debug('Getting page state', { url: page.url() });

  try {
    // Check for navigation state
    const isNavigating = await page.evaluate(() => document.readyState !== 'complete')
      .catch(() => true);
      
    if (isNavigating) {
      logger.info('Page is navigating, returning minimal state');
      return {
        url: page.url(),
        title: await page.title().catch(() => 'Loading...'),
        pageContent: "The page is currently loading. Please wait a moment before taking further action.",
        isNavigating: true
      };
    }
    
    // Test extractors to verify they're working
    const { testExtractors } = await import('./utils/extractorTester.js');
    await testExtractors(page);
    
    // Get a standard snapshot with our new system
    const domSnapshot = await PageAnalyzer.extractSnapshot(page);
    
    // Extract content with progressive loading via ContentExtractor
    const { content, truncated, scrolled } = await ContentExtractor.extract(page);
    
    // Use pageInterpreter to return unified page content
    const { generatePageSummary } = await import('./pageInterpreter.js');
    const pageSummary = await generatePageSummary(page, domSnapshot);

    logger.debug('Page state captured', {
      url: domSnapshot.url,
      title: domSnapshot.title,
      contentLength: content.length,
      contentTruncated: truncated,
      contentScrolled: scrolled,
      elementsFound: {
        buttons: domSnapshot.elements?.buttons?.length || 0,
        inputs: domSnapshot.elements?.inputs?.length || 0,
        links: domSnapshot.elements?.links?.length || 0,
        landmarks: domSnapshot.elements?.landmarks?.length || 0
      }
    });

    return {
      url: domSnapshot.url,
      title: domSnapshot.title,
      pageContent: content,
      pageSummary,
      contentTruncated: truncated,
      contentScrolled: scrolled,
      domSnapshot
    };
  } catch (error) {
    logger.browser.error('getState', error);
    return {
      url: page.url(),
      title: await page.title().catch(() => 'Unknown'),
      error: "Failed to extract page content",
      pageContent: "Unable to extract page content. The page might be loading or in an unexpected state.",
      isNavigating: true
    };
  }
}

// The functions below are no longer needed as they're replaced by PageAnalyzer
// Lightweight version of DOM snapshot for recovery situations
async function extractDOMSnapshotLite(page: Page): Promise<any> {
  // This function is replaced by PageAnalyzer.extractLiteSnapshot
  return PageAnalyzer.extractLiteSnapshot(page);
}

// Split the original extractDOMSnapshot into smaller parts
async function extractDOMSnapshot(page: Page): Promise<any> {
  // This function is replaced by PageAnalyzer.extractSnapshot
  return PageAnalyzer.extractSnapshot(page);
}

// Enhanced verify action function with better diagnostics
export async function verifyAction(page: Page, action: Action): Promise<boolean> {
  if (!action) {
    logger.error('Undefined action in verifyAction');
    return false;
  }
  
  const startTime = Date.now();
  let success = false;

  try {
    await doRetry(async () => {
      switch (action.type) {
        case "click": {
          if (!action.element) {
            logger.error('Undefined element for click action', { action });
            return false;
          }
          
          const elementExists = await page.$(action.element) !== null;
          if (!elementExists) {
            logger.debug('Element no longer exists after click (might be expected)', {
              selector: action.element
            });
            
            // If it's a button that caused navigation, this might be expected
            const urlChanged = page.url() !== action.previousUrl;
            if (urlChanged) {
              logger.debug('URL changed after click, considering successful', {
                from: action.previousUrl,
                to: page.url()
              });
              success = true;
              return true;
            }
          }
          
          // For clicks, we often don't have a great way to verify success other than checking
          // URL changes or DOM mutations. Log additional info to help diagnose.
          success = true;
          return true;
        }
        case "input": {
          if (!action.element) {
            logger.error('Undefined element for input action', { action });
            return false;
          }
          
          const element = await getElement(page, action);
          if (!element) return false;
          
          const value = await element.inputValue();
          success = value === action.value;
          
          if (!success) {
            logger.warn('Input verification failed', {
              expected: action.value,
              actual: value,
              selector: action.element
            });
          }
          
          return success;
        }
        case "navigate": {
          const currentUrl = page.url();
          const targetUrl = action.value || '';
          
          // Smarter URL comparison
          const currentUrlObj = new URL(currentUrl);
          let targetUrlObj: URL;
          
          try {
            targetUrlObj = new URL(targetUrl);
            
            // Compare hostname and pathname for meaningful comparison
            success = currentUrlObj.hostname === targetUrlObj.hostname &&
                     (currentUrlObj.pathname === targetUrlObj.pathname || 
                      currentUrl.includes(targetUrl));
            
            logger.debug('Navigation verification', {
              success,
              current: {
                full: currentUrl,
                hostname: currentUrlObj.hostname,
                pathname: currentUrlObj.pathname
              },
              target: {
                full: targetUrl,
                hostname: targetUrlObj.hostname,
                pathname: targetUrlObj.pathname
              }
            });
          } catch (e) {
            // If can't parse as URL, fall back to simple inclusion check
            success = currentUrl.includes(targetUrl);
            logger.debug('Navigation verification (simple)', {
              success,
              current: currentUrl,
              target: targetUrl,
              parseError: String(e)
            });
          }
          
          return success;
        }
        case "sendHumanMessage": // Always consider human interaction successful
          success = true;
          return true;
        case "wait":
          success = true;
          return true;
        case "notes": // Notes actions are verified separately by the notes handler
          success = true;
          return true;
        default:
          logger.warn(`Unknown action type: ${action.type}`);
          return false;
      }
    }, 2);

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
    //logger.error(`Navigation failed: ${error}`);
    return false;
  }
}