import './utils/logger.js';
import dotenv from "dotenv";
import { runGraph, stopAgent } from "./automation.js";
import { Page } from "playwright";
import logger from './utils/logger.js';
import { getAgentState } from './utils/agentState.js';

dotenv.config();

// Setup keyboard event handler for stopping the agent with Ctrl+C
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT (Ctrl+C). Gracefully stopping agent and saving state...');
  
  try {
    // Save state and stop agent
    await stopAgent();
    
    // Give logging time to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    logger.info('Graceful shutdown complete');
    logger.close();
  } catch (error) {
    console.error('Error during shutdown:', error);
  } finally {
    process.exit(0);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled rejection', { reason });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught exception', { error });
  process.exit(1);
});


// Main execution
(async () => {
  try {
    console.log("Agent started. Press Ctrl+C to stop gracefully.");
    await runGraph();
  } catch (error) {
    console.error("Fatal error:", error);
    logger.error('Fatal error in main execution', { error });
    process.exit(1);
  } finally {
    //logger.close();
  }
})();

export async function getPageState(page: Page): Promise<object> {
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