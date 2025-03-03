// filepath: c:\Users\yepis\dev\agent\agentic-ai-browser\src\pageInterpreter.ts
import dotenv from 'dotenv';
import { ChatOllama } from '@langchain/ollama';
import { GraphContext } from './browserExecutor.js';

dotenv.config();

// Use a lightweight model for page summarization to keep it fast
// We're reusing Ollama but configuring it with a smaller/faster model
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || "nchapman/dolphin3.0-llama3:3b"; // Using a smaller model by default

const summaryModel = new ChatOllama({
  baseUrl: OLLAMA_HOST,
  model: SUMMARY_MODEL,
  temperature: 0.1, // Lower temperature for more factual responses
});

/**
 * Generates a concise summary of the current page based on DOM snapshot
 */
export async function generatePageSummary(domSnapshot: any): Promise<string> {
  try {
    // Clean the DOM snapshot before sending it to the model
    const cleanSnapshot = cleanDomSnapshotForSummary(domSnapshot);
    
    const prompt = `
      You are a web page analyzer that provides concise and helpful descriptions of web pages.
      Describe this webpage in 1-3 short sentences focusing on:
      - Main visible interactive elements (buttons, forms, search boxes)
      - Overall layout (header, content areas, sidebar)
      - Primary purpose/type of the page (search page, login form, article, product page, etc.)
      
      Be extremely concise and focus only on the most important information a web automation system would need.
      
      DOM snapshot: ${JSON.stringify(cleanSnapshot, null, 2)}
      
      Your concise page description:
    `;
    
    const response = await summaryModel.invoke(prompt);
    
    // Extract text from the response content
    let summaryText = '';
    if (typeof response.content === 'string') {
      summaryText = response.content;
    } else if (Array.isArray(response.content)) {
      for (const part of response.content) {
        if (part.type === 'text') {
          summaryText += part.text;
        }
      }
    }
    
    // Clean up the summary text
    summaryText = summaryText.trim();
    if (!summaryText) {
      return "No summary available.";
    }
    
    return summaryText;
  } catch (error) {
    console.error("Error generating page summary:", error);
    return "Error generating page summary.";
  }
}

/**
 * Extracts visible and interactive UI elements from the DOM snapshot
 * for better page understanding
 */
export function extractInteractiveElements(domSnapshot: any): string[] {
  const elements: string[] = [];
  
  // Extract buttons with text
  if (Array.isArray(domSnapshot.buttons)) {
    domSnapshot.buttons.forEach((button: string | null, index: number) => {
      if (button) {
        elements.push(`Button: "${button.trim()}"`);
      }
    });
  }
  
  // Extract input fields
  if (Array.isArray(domSnapshot.inputs)) {
    domSnapshot.inputs.forEach((input: string | null, index: number) => {
      if (input) {
        elements.push(`Input field: ${input}`);
      }
    });
  }
  
  // Extract links with text
  if (Array.isArray(domSnapshot.links)) {
    domSnapshot.links.forEach((link: string | null, index: number) => {
      if (link) {
        // Avoid adding too many links, just highlight important ones
        if (elements.length < 10) {
          elements.push(`Link: "${link.trim()}"`);
        }
      }
    });
  }
  
  // Extract form elements
  if (Array.isArray(domSnapshot.landmarks)) {
    domSnapshot.landmarks.forEach((landmark: any) => {
      if (landmark.role === 'form') {
        elements.push(`Form: "${landmark.text?.substring(0, 30) || 'Unnamed form'}"`);
      }
      else if (['navigation', 'main', 'search'].includes(landmark.role)) {
        elements.push(`${landmark.role.charAt(0).toUpperCase() + landmark.role.slice(1)} section`);
      }
    });
  }
  
  return elements;
}

/**
 * Cleans up the DOM snapshot by removing or truncating verbose information
 * that isn't useful for page summarization
 */
function cleanDomSnapshotForSummary(domSnapshot: any): any {
  if (!domSnapshot) return {};
  
  // Create a clean copy
  const cleanSnapshot = { ...domSnapshot };
  
  // Clean landmarks
  if (Array.isArray(cleanSnapshot.landmarks)) {
    cleanSnapshot.landmarks = cleanSnapshot.landmarks.map((landmark: any) => ({
      role: landmark.role,
      text: landmark.text && typeof landmark.text === 'string'
        ? (landmark.text.length > 50 ? landmark.text.substring(0, 50) + "..." : landmark.text)
        : null
    }));
  }
  
  // Limit the number of links to prevent overwhelming the model
  if (Array.isArray(cleanSnapshot.links) && cleanSnapshot.links.length > 10) {
    cleanSnapshot.links = cleanSnapshot.links.slice(0, 10);
    cleanSnapshot.links.push(`...and ${domSnapshot.links.length - 10} more links`);
  }
  
  return cleanSnapshot;
}