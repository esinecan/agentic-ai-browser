import dotenv from "dotenv";
import { runGraph, stopAgent } from "./automation.js";
import { Page } from "playwright";
import fs from 'fs';
import readline from 'readline';

dotenv.config();

// Setup keyboard event handler for stopping the agent with Ctrl+C
process.on('SIGINT', async () => {
  console.log('\nCtrl+C detected. Requesting agent to stop gracefully...');
  await stopAgent();
  // Don't exit immediately - let the agent handle cleanup
});

// Create a readline interface for handling keypress events
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Listen for the 'keypress' event
process.stdin.on('keypress', async (str, key) => {
  // Check if user pressed 'q'
  if (key.name === 'q') {
    console.log('\nStop key pressed. Requesting agent to stop gracefully...');
    await stopAgent();
  }
});

// Enable keypress events
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

// Main execution
(async () => {
  try {
    console.log("Agent started. Press 'q' or Ctrl+C to stop gracefully.");
    await runGraph();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  } finally {
    // Clean up the readline interface
    rl.close();
  }
})();

export async function getPageState(page: Page): Promise<object> {
  const timestamp = Date.now();

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
    }))
  };
}