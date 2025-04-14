import logger from '../../utils/logger.js';
import { GraphContext } from '../../browserExecutor.js';
import { states } from '../automation/machine.js';
import { getAgentState } from '../../utils/agentState.js';
import { getMcpContext } from './server.js';
import fs from 'fs';
import path from 'path';
import { getSessionNotesFile } from '../action-handling/handlers/notesHandler.js';

// Session-specific notes file
let sessionNotesFile: string | null = null;

export async function handleClickAction(args: { element: string, description?: string }) {
  const currentContext = getMcpContext();
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }
  
  try {
    const { chooseAction } = states;
    const actionResult = await states.click({
      ...currentContext,
      action: {
        type: "click",
        element: args.element,
        description: args.description || "",
        selectorType: "css",
        maxWait: 5000
      }
    });
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully clicked element: ${args.element}`
        }
      ]
    };
  } catch (error) {
    logger.error("Error handling click action", { error, element: args.element });
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to click element: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

export async function handleInputAction(args: { element: string, value: string }) {
  const currentContext = getMcpContext();
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }
  
  try {
    const actionResult = await states.input({
      ...currentContext,
      action: {
        type: "input",
        element: args.element,
        value: args.value,
        selectorType: "css",
        maxWait: 5000
      }
    });
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully entered text into element: ${args.element}`
        }
      ]
    };
  } catch (error) {
    logger.error("Error handling input action", { error, element: args.element });
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to input text: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

export async function handleNavigateAction(args: { value: string }) {
  const currentContext = getMcpContext();
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }
  
  try {
    const actionResult = await states.navigate({
      ...currentContext,
      action: {
        type: "navigate",
        value: args.value,
        selectorType: "css",
        maxWait: 5000
      }
    });
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully navigated to: ${args.value}`
        }
      ]
    };
  } catch (error) {
    logger.error("Error handling navigate action", { error, url: args.value });
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to navigate: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

export async function handleNotesAction(args: { operation: "add" | "read", note?: string }) {
  try {
    const { operation } = args;
    const currentContext = getMcpContext();
    
    if (!currentContext) {
      throw new Error("Browser context not initialized");
    }

    if (operation === "add" && args.note) {
      const actionResult = await states.notes({
        ...currentContext,
        action: {
          type: "notes",
          operation: "add",
          note: args.note,
          selectorType: "css",
          maxWait: 5000
        }
      });
      
      return {
        content: [
          {
            type: "text", 
            text: "Successfully added note"
          }
        ]
      };
    } 
    else if (operation === "read") {
      // Execute the notes read operation
      await states.notes({
        ...currentContext,
        action: {
          type: "notes",
          operation: "read",
          selectorType: "css",
          maxWait: 5000
        }
      });
      
      // Get the active notes file from the notesHandler module
      const notesFilePath = getSessionNotesFile();
      
      let notesContent = "No notes found";
      if (notesFilePath && fs.existsSync(notesFilePath)) {
        notesContent = fs.readFileSync(notesFilePath, 'utf8');
        logger.info("Successfully read notes file", { path: notesFilePath });
      } else {
        logger.warn("Notes file not found", { path: notesFilePath });
      }
      
      return {
        content: [
          {
            type: "text",
            text: notesContent
          }
        ]
      };
    }
    
    throw new Error("Invalid notes operation or missing note");
  } catch (error) {
    logger.error("Error handling notes action", { error, operation: args.operation });
    
    return {
      isError: true,
      content: [
        {
          type: "text", 
          text: `Failed to ${args.operation} notes: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

export async function handleScrollAction(args: { direction: "up" | "down" }) {
  const currentContext = getMcpContext();
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }
  
  try {
    const actionResult = await states.scroll({
      ...currentContext,
      action: {
        type: "scroll",
        direction: args.direction,
        selectorType: "css",
        maxWait: 5000
      }
    });
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully scrolled ${args.direction}`
        }
      ]
    };
  } catch (error) {
    logger.error("Error handling scroll action", { error, direction: args.direction });
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to scroll ${args.direction}: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

export async function handleGetPageInfoAction() {
  const currentContext = getMcpContext();
  if (!currentContext || !currentContext.page) {
    throw new Error("Browser not initialized");
  }
  
  try {
    const url = await currentContext.page.url();
    const title = await currentContext.page.title();
    
    // Extract content directly from the page
    let pageContent = "No content available";
    try {
      // Get page content from main content elements
      pageContent = await currentContext.page.evaluate(() => {
        // Get content from common content containers
        const mainContent = document.querySelector('main') || 
                           document.querySelector('#content') ||
                           document.querySelector('#main') ||
                           document.querySelector('article') ||
                           document.body;
        
        // Get just text content, truncated to avoid overwhelming response
        return mainContent ? mainContent.textContent || "" : "";
      });
      
      // Trim and clean up the content
      pageContent = pageContent.trim().replace(/\s+/g, ' ').substring(0, 1000);
      
      // If still empty, try to get some meaningful content
      if (!pageContent) {
        pageContent = await currentContext.page.evaluate(() => 
          Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))
            .map(el => el.textContent)
            .filter(text => text && text.trim().length > 0)
            .join(' ')
            .substring(0, 1000)
        );
      }
    } catch (err) {
      logger.error("Error extracting page content", { err });
    }
    
    return {
      content: [
        {
          type: "text",
          text: `URL: ${url}\nTitle: ${title}\n\nPage Content:\n${pageContent || "No content available"}...`
        }
      ]
    };
  } catch (error) {
    logger.error("Error handling getPageInfo action", { error });
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to get page info: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

export async function handleSetGoalAction(args: { goal: string }) {
  const currentContext = getMcpContext();
  if (!currentContext) {
    throw new Error("Browser not initialized");
  }
  
  try {
    // Set the goal
    currentContext.userGoal = args.goal;
    
    // Initialize milestones for the new goal
    const { initializeMilestones } = await import('../../core/automation/milestones.js');
    initializeMilestones(currentContext);
    
    return {
      content: [
        {
          type: "text",
          text: `Goal set: ${args.goal}`
        }
      ]
    };
  } catch (error) {
    logger.error("Error handling setGoal action", { error });
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to set goal: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}