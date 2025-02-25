import dotenv from "dotenv";
import { runGraph } from "./automation.js";
import { Page } from "playwright";
import path from 'path';
import fs from 'fs';

dotenv.config();

(async () => {
  try {
    await runGraph();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
})();

export async function getPageState(page: Page): Promise<object> {
  const timestamp = Date.now();
  const screenshotDir = process.env.SCREENSHOT_DIR || path.resolve(__dirname, "../screenshots");
  const screenshotPath = path.resolve(screenshotDir, `screenshot-${timestamp}.png`);

  // Ensure folder exists
  await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });

  // Take the screenshot without encoding option, returns a Buffer
  const screenshotBuffer = await page.screenshot({ path: screenshotPath });
  const base64Data = screenshotBuffer.toString("base64");

  return {
    url: page.url(),
    title: await page.title(),
    domSnapshot: await page.evaluate(() => ({
      buttons: Array.from(document.querySelectorAll("button")).map(b => b.textContent?.trim()),
      inputs: Array.from(document.querySelectorAll("input")).map(i => i.id || i.name),
      links: Array.from(document.querySelectorAll("a")).map(a => a.textContent?.trim()),
      landmarks: Array.from(document.querySelectorAll("[role]")).map(el => ({
        role: el.getAttribute("role"),
        text: el.textContent?.trim(),
      })),
    })),
    screenshot: {
      path: screenshotPath,
      base64: base64Data,
    },
  };
}