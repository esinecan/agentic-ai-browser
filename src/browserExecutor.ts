import { chromium, Browser, Page, ElementHandle } from "playwright";
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
  type: z.enum(["click", "input", "scroll", "navigate", "extract", "wait"]),
  element: z.string().optional(),
  value: z.string().optional(),
  description: z.string().optional(),
  selectorType: z.enum(["css", "xpath", "text"]).optional().default("css"),
  maxWait: z.number().optional().default(5000),
});
export type Action = z.infer<typeof ActionSchema>;

// Graph context interface shared with your state machine.
export interface GraphContext {
  browser?: Browser;
  page?: Page;
  action?: Action;
  retries?: number;
  history: string[];
  startTime?: number;
  lastScreenshot?: string;
}

// Launch the browser.
export async function launchBrowser(): Promise<Browser> {
  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
    
  return await chromium.launch({
    headless: process.env.HEADLESS !== "false",
    timeout: DEFAULT_NAVIGATION_TIMEOUT,
    executablePath: chromiumPath,
  });
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

// Helper: Get an element based on the action's selector.
export async function getElement(
    page: Page,
    action: Action
  ): Promise<ElementHandle | null> {
    return doRetry(async () => {
      if (!action.element) return null;
  
      switch (action.selectorType) {
        case "css":
          await page.waitForSelector(action.element, { timeout: action.maxWait });
          return page.$(action.element);
  
        case "xpath":
          await page.waitForSelector(`xpath=${action.element}`, { timeout: action.maxWait });
          return page.$(`xpath=${action.element}`);
  
        case "text":
          await page.waitForSelector(`text=${action.element}`, { timeout: action.maxWait });
          return page.$(`text=${action.element}`);
  
        default:
          throw new Error(`Invalid selector type: ${action.selectorType}`);
      }
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
  const candidates = await page.$$eval("*", (elements) =>
    elements.map((el) => ({
      text: el.textContent?.trim(),
      id: el.id,
      ariaLabel: el.getAttribute("aria-label"),
      tagName: el.tagName,
      outerHTML: el.outerHTML,
    }))
  );
  let bestScore = 0;
  let bestElement: typeof candidates[number] | null = null;
  for (const candidate of candidates) {
    const scores = [
      candidate.text ? textSimilarity(reference, candidate.text) : 0,
      candidate.id ? textSimilarity(reference, candidate.id) : 0,
      candidate.ariaLabel ? textSimilarity(reference, candidate.ariaLabel) : 0,
    ];
    const score = Math.max(...scores);
    if (score > bestScore && score > SIMILARITY_THRESHOLD) {
      bestScore = score;
      bestElement = candidate;
    }
  }
  return bestElement?.outerHTML || null;
}

// Capture a snapshot of the current page state and save a screenshot locally.
export async function getPageState(page: Page): Promise<object> {
    const timestamp = Date.now();
    const screenshotDir =
      process.env.SCREENSHOT_DIR || path.resolve(__dirname, "../screenshots");
    const screenshotPath = path.resolve(screenshotDir, `screenshot-${timestamp}.png`);
    await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
  
    const screenshotBuffer = await page.screenshot(); // Capture screenshot as buffer
  
    return {
      url: page.url(),
      title: await page.title(),
      domSnapshot: await page.evaluate(() => ({
        buttons: Array.from(document.querySelectorAll("button")).map((b) =>
          b.textContent?.trim()
        ),
        inputs: Array.from(document.querySelectorAll("input")).map(
          (i) => i.id || i.name
        ),
        links: Array.from(document.querySelectorAll("a")).map((a) =>
          a.textContent?.trim()
        ),
        landmarks: Array.from(document.querySelectorAll("[role]")).map((el) => ({
          role: el.getAttribute("role"),
          text: el.textContent?.trim(),
        })),
      })),
      screenshot: {
        path: screenshotPath,
        base64: screenshotBuffer.toString("base64"), // Convert buffer to base64
      },
    };
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