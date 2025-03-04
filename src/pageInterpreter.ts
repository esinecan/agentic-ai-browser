// filepath: c:\Users\yepis\dev\agent\agentic-ai-browser\src\pageInterpreter.ts
import dotenv from 'dotenv';
import { ChatOllama } from '@langchain/ollama';
import { GraphContext } from './browserExecutor.js';

dotenv.config();

// Use a lightweight model for page summarization to keep it fast
// We're reusing Ollama but configuring it with a smaller/faster model
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || "granite3-dense:latest"; // Using a smaller model by default

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
     **You are an AI model that processes a raw JSON DOM and removes unnecessary elements while keeping the structure intact. Your goal is to filter out irrelevant elements and retain only the most meaningful text-based and interactive elements, while ensuring that the output follows the same DOM object format.**
        ---
        ### **Rules for Simplification:**  

        #### **1. Keep Important Elements & Their Fields**  
        - **Headings ('h1'-'h3')** → Retain if they contain meaningful text.  
        - **Divs and Spans ('div', 'span')** → Examine carefully and keep if they contain useful information.
        - **Paragraphs ('p', 'span')** → Keep only if they contain **visible text**.  
        - **Links ('a', 'role: link')** → Preserve if they lead to another page or perform an action.  
        - **Buttons ('button', 'role: button')** → Keep only if they contain meaningful actions.  
        - **Inputs ('input', 'textarea')** → Retain forms, search boxes, and user inputs.  
        - **Dialogs ('role: dialog')** → Keep important popups, confirmations, or notices.  

        #### **2. Remove Redundant Elements Without Changing Structure**  
        - **Drop elements with 'role: presentation', 'role: none', or empty text fields.**  
        - **Remove raw CSS styles, inline styles, or empty divs.**  
        - **Ignore elements with meaningless text like "Click here", "Learn more" unless inside a larger context.**  

        #### **3. Keep the Original JSON Format**
        - **Do not modify field names** (e.g., 'buttons', 'inputs', 'links').  
        - **Do not restructure the object**—just remove unwanted elements.  
        - **Ensure that the output format matches the input, minus unnecessary content.** 
      
      DOM snapshot: ${JSON.stringify(cleanSnapshot, null, 2)}
      
      Your concise page description:
    `;
    
      console.log("-------------------");
      console.log("\n BROWSER EYE SLM PROMPT:\n" + prompt + "\n");
      console.log("-------------------");
      const response = await summaryModel.invoke(prompt);
      console.log("-------------------");
      console.log("\n BROWSER EYE SLM RESPONSE:\n" + JSON.stringify(response, null, 2) + "\n");
      console.log("-------------------");
    
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