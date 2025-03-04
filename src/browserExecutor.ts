import { chromium, Browser, Page, ElementHandle, BrowserContext } from "playwright";
import dotenv from "dotenv";
import { z } from "zod";
import fs from "fs";
import path from "path";

dotenv.config();

export const DEFAULT_NAVIGATION_TIMEOUT = 30000;
export const RETRY_DELAY_MS = 2000;
export const SIMILARITY_THRESHOLD = 0.7;

// Define and export the action schema and type.
export const ActionSchema = z.object({
  type: z.enum(["click", "input", "scroll", "navigate", "extract", "wait", "askHuman"]), // Added askHuman
  element: z.string().optional(),
  value: z.string().optional(),
  description: z.string().optional(),
  selectorType: z.enum(["css", "xpath", "text"]).optional().default("css"),
  maxWait: z.number().optional().default(5000),
  question: z.string().optional(), // New field for human questions
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
  
  // New page understanding fields
  pageSummary?: string;          // AI-generated summary of the page
  interactiveElements?: string[]; // List of interactive elements on the page
  lastSelector?: string;        // Last selector that was attempted
  compressedHistory?: string[];  // Compressed version of action history
}

export async function launchBrowser(): Promise<Browser> {
  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 
    "C:\\Users\\yepis\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe";
    
  // Launch browser first, then create persistent context
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
    timeout: DEFAULT_NAVIGATION_TIMEOUT,
    executablePath: chromiumPath,
  });
  
  // Create user data directory if it doesn't exist
  const userDataDir = path.join(process.cwd(), "user-data");
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  
  // Create a persistent context using the storage state approach
  await browser.newContext({
    storageState: fs.existsSync(path.join(userDataDir, "state.json")) 
      ? path.join(userDataDir, "state.json") 
      : undefined
  });
  
  // Set up state saving when browser closes
  browser.on('disconnected', async () => {
    try {
      // Get the first context
      const contexts = browser.contexts();
      if (contexts.length > 0) {
        const state = await contexts[0].storageState();
        fs.writeFileSync(path.join(userDataDir, "state.json"), JSON.stringify(state, null, 2));
        console.log("Saved browser session state");
      }
    } catch (e) {
      console.error("Failed to save browser state:", e);
    }
  });
  
  return browser;
}

// Create a new page and navigate to the starting URL.
export async function createPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  const startUrl = process.env.START_URL || "https://google.com";
  await page.goto(startUrl);
  return page;
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
  try {
    let fullSelector: string;
    switch (selectorType) {
      case "xpath":
        fullSelector = `xpath=${selector}`;
        break;
      case "text":
        fullSelector = `text=${selector}`;
        break;
      default:
        fullSelector = selector;
    }
    
    // For common search patterns, check alternative selectors first
    if (selector === 'input[type=text]' || selector === 'input[type="text"]') {
      // Check for textarea as alternative
      const textareaCount = await page.$$eval('textarea', elements => elements.length);
      if (textareaCount > 0) {
        return {
          exists: true,
          count: textareaCount,
          suggestion: 'Try instead: textarea'
        };
      }
      
      // Check for search role elements
      const searchboxCount = await page.$$eval('[role=searchbox], [role=search] input, [role=search] textarea', 
        elements => elements.length);
      if (searchboxCount > 0) {
        return {
          exists: true,
          count: searchboxCount,
          suggestion: 'Try instead: [role=searchbox], [role=search] input, or [role=search] textarea'
        };
      }
    }
    
    // For search button verification
    if (selector.includes('search') && selector.includes('button')) {
      // Check for various search button implementations
      const searchButtonSelectors = [
        'button[type=submit]',
        '[role=button][aria-label*="search" i]',
        'button.search-button',
        'input[type=submit]',
        '[role=search] button'
      ];
      
      for (const searchSelector of searchButtonSelectors) {
        const count = await page.$$eval(searchSelector, elements => elements.length);
        if (count > 0) {
          return {
            exists: true,
            count,
            suggestion: `Try instead: ${searchSelector}`
          };
        }
      }
    }
    
    // Continue with regular verification
    const count = await page.$$eval(fullSelector, elements => elements.length);
    
    let suggestion: string | null = null;
    if (count === 0) {
      // If no elements found, try to find alternative selectors
      suggestion = await findAlternativeSelector(page, selector);
    }
    
    return {
      exists: count > 0,
      count,
      suggestion
    };
  } catch (e) {
    console.error("Error in verifyElementExists:", e);
    return { exists: false, count: 0, suggestion: null };
  }
}

/**
 * Try to find alternative selectors if the original one doesn't work
 */
async function findAlternativeSelector(page: Page, originalSelector: string): Promise<string | null> {
  try {
    // Try to find elements with similar attributes
    const similarElements = await page.evaluate((selector) => {
      // This function runs in the browser context
      const results = [];
      
      // Try to parse selector to understand what it was targeting
      let tagName = '';
      let attrName = '';
      let attrValue = '';
      
      // Simple attribute selector parser
      const attrMatch = selector.match(/(\w+)\[([^=]+)=["']?([^"'\]]+)["']?\]/);
      if (attrMatch) {
        tagName = attrMatch[1];
        attrName = attrMatch[2];
        attrValue = attrMatch[3];
        
        // Find elements with partial attribute match
        const elements = document.querySelectorAll(tagName);
        for (const el of elements) {
          const attr = el.getAttribute(attrName);
          if (attr && attr.includes(attrValue.substring(0, Math.min(5, attrValue.length)))) {
            results.push({
              tagName,
              selector: `${tagName}[${attrName}="${attr}"]`,
              text: el.textContent?.trim().substring(0, 30) || ''
            });
          }
        }
      } else {
        // For simple element selectors like 'button', 'input', etc.
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length === 0) {
            // Get all elements of this type without specific attributes
            const tagMatch = selector.match(/^(\w+)/);
            if (tagMatch) {
              tagName = tagMatch[1];
              const baseElements = document.querySelectorAll(tagName);
              for (const el of baseElements) {
                results.push({
                  tagName,
                  selector: tagName + (el.id ? `#${el.id}` : ''),
                  text: el.textContent?.trim().substring(0, 30) || ''
                });
              }
            }
          }
        } catch (e) {
          // Ignore errors in selector syntax
        }
      }
      
      return results.slice(0, 3); // Return at most 3 suggestions
    }, originalSelector);
    
    if (similarElements && similarElements.length > 0) {
      return `Try instead: ${similarElements.map(e => e.selector).join(', ')}`;
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// Helper: Get an element based on the action's selector.
export async function getElement(
    page: Page,
    action: Action
  ): Promise<ElementHandle | null> {
    return doRetry(async () => {
      if (!action.element) return null;

      // Define alternative selectors for common search patterns
      let possibleSelectors: string[] = [action.element];
      
      // If we're looking for a text input, also check for textarea and common search box patterns
      if (action.element === 'input[type=text]' || action.element === 'input[type="text"]') {
        possibleSelectors = [
          action.element,
          'textarea',
          '[role=searchbox]', 
          '[role=search] input', 
          '[role=search] textarea',
          'textarea.gLFyf', // Google search specific
          'input[name=q]',  // Common search parameter name
          'input[placeholder*="search" i]', // Inputs with search in placeholder
          'textarea[placeholder*="search" i]' // Textareas with search in placeholder
        ];
      }
      
      // Try each selector in order until one works
      for (const selector of possibleSelectors) {
        try {
          const selectorToUse = action.selectorType === "css" ? selector : action.element;
          
          switch (action.selectorType) {
            case "css":
              await page.waitForSelector(selectorToUse, { 
                timeout: Math.min(action.maxWait / possibleSelectors.length, 2000) // Don't wait too long for each try
              });
              const element = await page.$(selectorToUse);
              if (element) {
                if (selector !== action.element) {
                  console.log(`Found alternative selector: ${selector} instead of ${action.element}`);
                }
                return element;
              }
              break;
  
            case "xpath":
              await page.waitForSelector(`xpath=${action.element}`, { timeout: action.maxWait });
              return page.$(`xpath=${action.element}`);
  
            case "text":
              await page.waitForSelector(`text=${action.element}`, { timeout: action.maxWait });
              return page.$(`text=${action.element}`);
          }
        } catch (e) {
          // Continue to the next selector
          continue;
        }
      }
      
      // If we've tried all selectors and none worked, throw an error
      throw new Error(`No matching element found with selectors: ${possibleSelectors.join(', ')}`);
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
  // Special handling for common patterns
  if (reference === 'input[type=text]' || reference === 'input[type="text"]') {
    // For search boxes, try these in order
    const candidates = [
      'textarea', 
      '[role=searchbox]', 
      '[role=search] input', 
      '[role=search] textarea',
      'textarea.gLFyf', // Google search specific
      'input[name=q]',  // Common search parameter name
      'input[placeholder*="search" i]', // Inputs with search in placeholder
      'textarea[placeholder*="search" i]' // Textareas with search in placeholder
    ];
    
    for (const candidate of candidates) {
      try {
        const exists = await page.$(candidate);
        if (exists) {
          console.log(`Found alternative search input: ${candidate}`);
          return candidate;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
  }
  
  // Special handling for search buttons
  if (reference.toLowerCase().includes('search') && reference.includes('button')) {
    const searchButtonSelectors = [
      'button[type=submit]',
      '[role=button][aria-label*="search" i]',
      'button.search-button',
      'input[type=submit]',
      '[role=search] button'
    ];
    
    for (const selector of searchButtonSelectors) {
      try {
        const exists = await page.$(selector);
        if (exists) {
          console.log(`Found alternative search button: ${selector}`);
          return selector;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
  }
  
  // Special handling for submit buttons
  if (reference.toLowerCase().includes('submit') || reference === 'button[type=submit]') {
    const submitButtonSelectors = [
      'button[type=submit]',
      'input[type=submit]',
      'button.submit',
      '[role=button][aria-label*="submit" i]',
      'button:has-text("Submit")',
      'button:has-text("Search")',
      'button:has-text("Go")'
    ];
    
    for (const selector of submitButtonSelectors) {
      try {
        const exists = await page.$(selector);
        if (exists) {
          console.log(`Found alternative submit button: ${selector}`);
          return selector;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
  }

  // Fallback to general similarity matching
  const candidates = await page.$$eval("*", (elements) =>
    elements.map((el) => ({
      text: el.textContent?.trim(),
      id: el.id,
      ariaLabel: el.getAttribute("aria-label"),
      tagName: el.tagName,
      role: el.getAttribute("role"),
      type: el.getAttribute("type"),
      placeholder: el.getAttribute("placeholder"),
      name: el.getAttribute("name"),
      outerHTML: el.outerHTML,
    }))
  );
  
  let bestScore = 0;
  let bestElement: typeof candidates[number] | null = null;
  
  // Look for exact matches on important attributes first
  for (const candidate of candidates) {
    // Give priority to matching elements with same tag + attribute
    if (reference.includes(candidate.tagName?.toLowerCase())) {
      // Check for type attribute match
      if (candidate.type && reference.includes(`type=${candidate.type}`)) {
        bestElement = candidate;
        console.log(`Found element with matching tag and type: ${candidate.tagName} type=${candidate.type}`);
        break;
      }
      
      // Check for role attribute match
      if (candidate.role && reference.includes(candidate.role)) {
        bestElement = candidate;
        console.log(`Found element with matching tag and role: ${candidate.tagName} role=${candidate.role}`);
        break;
      }
      
      // Check for name attribute match
      if (candidate.name && reference.includes(candidate.name)) {
        bestElement = candidate;
        console.log(`Found element with matching tag and name: ${candidate.tagName} name=${candidate.name}`);
        break;
      }
    }
    
    // Continue with scoring for partial matches
    const scores = [
      candidate.text ? textSimilarity(reference, candidate.text) : 0,
      candidate.id ? textSimilarity(reference, candidate.id) : 0,
      candidate.ariaLabel ? textSimilarity(reference, candidate.ariaLabel) : 0,
      candidate.placeholder ? textSimilarity(reference, candidate.placeholder) : 0,
      candidate.name ? textSimilarity(reference, candidate.name) : 0,
    ];
    
    const score = Math.max(...scores);
    if (score > bestScore && score > SIMILARITY_THRESHOLD) {
      bestScore = score;
      bestElement = candidate;
    }
  }
  
  // If nothing found, try to build a selector based on the reference
  if (!bestElement) {
    // Try to extract tag name from the reference
    const tagMatch = reference.match(/^(\w+)/);
    if (tagMatch) {
      const tagName = tagMatch[1].toLowerCase();
      // Basic selector for tag name
      return tagName;
    }
  }
  
  // Return the best match
  if (bestElement) {
    // Attempt to build a CSS selector from the best match
    let selector = bestElement.tagName?.toLowerCase() || "*";
    
    // Add useful attributes to the selector
    if (bestElement.id) {
      selector += `#${bestElement.id}`;
    } else if (bestElement.name) {
      selector += `[name="${bestElement.name}"]`;
    } else if (bestElement.type) {
      selector += `[type="${bestElement.type}"]`;
    } else if (bestElement.role) {
      selector += `[role="${bestElement.role}"]`;
    } else if (bestElement.placeholder) {
      selector += `[placeholder="${bestElement.placeholder}"]`;
    }
    
    console.log(`Built selector from best match: ${selector}`);
    return selector;
  }
  
  return null;
}

/**
 * Clean the DOM snapshot by pruning excessive information
 */
function cleanDomSnapshot(snapshot: any): any {
  if (!snapshot) return {};

  return {
    buttons: snapshot.buttons,
    inputs: snapshot.inputs,
    links: Array.isArray(snapshot.links) && snapshot.links.length > 10 
      ? [...snapshot.links.slice(0, 10), `...and ${snapshot.links.length - 10} more links`] 
      : snapshot.links,
    landmarks: Array.isArray(snapshot.landmarks) 
      ? snapshot.landmarks.map((landmark: any) => ({
          role: landmark.role,
          text: landmark.text && typeof landmark.text === 'string'
            ? (landmark.text.length > 50 ? landmark.text.substring(0, 50) + "..." : landmark.text)
            : null
        }))
      : [],
    // Add semantic information about the page
    visibleFields: extractVisibleFields(snapshot)
  };
}

/**
 * Extract semantic information about visible fields
 */
function extractVisibleFields(snapshot: any): any[] {
  const fields: any[] = [];
  
  // Extract information about input fields
  if (Array.isArray(snapshot.inputs)) {
    snapshot.inputs.forEach((input: string) => {
      if (input) {
        // Try to determine the type of input field
        if (input.includes('search')) {
          fields.push({ type: 'search', id: input });
        } else if (input.includes('email')) {
          fields.push({ type: 'email', id: input });
        } else if (input.includes('password')) {
          fields.push({ type: 'password', id: input });
        } else if (input.includes('username') || input.includes('login')) {
          fields.push({ type: 'username', id: input });
        } else {
          fields.push({ type: 'text', id: input });
        }
      }
    });
  }
  
  // Extract information about buttons
  if (Array.isArray(snapshot.buttons)) {
    snapshot.buttons.forEach((button: string) => {
      if (button) {
        const buttonText = button.toLowerCase();
        // Try to determine the purpose of the button
        if (buttonText.includes('login') || buttonText.includes('sign in')) {
          fields.push({ type: 'login-button', text: button });
        } else if (buttonText.includes('search')) {
          fields.push({ type: 'search-button', text: button });
        } else if (buttonText.includes('submit')) {
          fields.push({ type: 'submit-button', text: button });
        } else {
          fields.push({ type: 'button', text: button });
        }
      }
    });
  }
  
  return fields;
}

// Capture a snapshot of the current page state and save a screenshot locally.
export async function getPageState(page: Page): Promise<object> {
    // Capture the raw page state
    const rawState = {
      url: page.url(),
      title: await page.title(),
      domSnapshot: await page.evaluate(() => ({
        buttons: Array.from(document.querySelectorAll("button")).map((b) =>
          b.textContent?.trim()
        ),
        inputs: [
          ...Array.from(document.querySelectorAll("input")),
          ...Array.from(document.querySelectorAll("textarea"))
        ].map((i) => 
          i.id || i.name || i.getAttribute('placeholder') || i.getAttribute('type') || i.tagName.toLowerCase()
        ),
        links: Array.from(document.querySelectorAll("a")).map((a) =>
          a.textContent?.trim()
        ),
        landmarks: Array.from(document.querySelectorAll("[role]")).map((el) => ({
          role: el.getAttribute("role"),
          text: el.textContent?.trim(),
        })),
        // Additional semantic extraction
        forms: Array.from(document.querySelectorAll("form")).map((f) => ({
          id: f.id,
          action: f.action,
          method: f.method,
          elements: Array.from(f.elements).length
        }))
      }))
    };
    
    // Clean the DOM snapshot
    const cleanSnapshot = {
      ...rawState,
      domSnapshot: cleanDomSnapshot(rawState.domSnapshot)
    };
    
    return cleanSnapshot;
}  

// Verify that an action succeeded based on its type.
export async function verifyAction(page: Page, action: Action): Promise<boolean> {
  try {
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
      case "askHuman": // Always consider human interaction successful
        return true;
      case "scroll":
      case "extract":
      case "wait":
        return true;
      default:
        return false;
    }
  } catch {
    return false;
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