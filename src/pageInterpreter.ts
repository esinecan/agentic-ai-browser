// filepath: c:\Users\yepis\dev\agent\agentic-ai-browser\src\pageInterpreter.ts
import dotenv from 'dotenv';
import { ChatOllama } from '@langchain/ollama';
import { GraphContext } from './browserExecutor.js';

dotenv.config();

// Use a lightweight model for page summarization to keep it fast
// We're reusing Ollama but configuring it with a smaller/faster model
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || "marco-o1"; // Using a smaller model by default

const summaryModel = new ChatOllama({
  baseUrl: OLLAMA_HOST,
  model: SUMMARY_MODEL
});

/**
 * Generates a concise summary of the current page based on DOM snapshot
 */
export async function generatePageSummary(domSnapshot: any): Promise<string> {
  try {
    // Clean the DOM snapshot before sending it to the model
    //const cleanSnapshot = cleanDomSnapshotForSummary(domSnapshot);
    
    /*const prompt = `
     **This is the DOM content of a web page:**
        ---
        ${JSON.stringify(cleanSnapshot, null, 2)}
        ---
        Here is what you need to do:
        **CREATE A SHORTER JSON OBJECT**
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
    
        ---
        **Once you have cleaned up the DOM snapshot, paste the updated JSON object here. Remember to preserve meaningful text**
     (you don't need to explain your changes. we trust you "blindly" 😄):
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
    
    return summaryText;*/
    //return cleanSnapshot;
    return domSnapshot;
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
  
  // Extract links with text and URLs - Updated to handle new link format
  if (Array.isArray(domSnapshot.links)) {
    domSnapshot.links.forEach((link: any, index: number) => {
      // Check if link is the new format (object with text and url properties)
      if (link && typeof link === 'object') {
        if (link.text && link.url && elements.length < 10) {
          elements.push(`Link: "${link.text.trim()}" (${link.url})`);
        }
      } 
      // Backward compatibility with old string format
      else if (link && typeof link === 'string' && elements.length < 10) {
        elements.push(`Link: "${link.trim()}"`);
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
  
  // Clean landmarks - increased from 50 to 500 characters
  if (Array.isArray(cleanSnapshot.landmarks)) {
    cleanSnapshot.landmarks = cleanSnapshot.landmarks.map((landmark: any) => ({
      role: landmark.role,
      text: landmark.text && typeof landmark.text === 'string'
        ? (landmark.text.length > 500 ? landmark.text.substring(0, 500) + "..." : landmark.text)
        : null
    }));
  }
  
  // Process links - handle new link format and increase limit to 30
  if (Array.isArray(cleanSnapshot.links)) {
    // If links are in the new format (objects with text and url properties), keep them that way
    const isNewLinkFormat = cleanSnapshot.links.length > 0 && 
                           typeof cleanSnapshot.links[0] === 'object' && 
                           'url' in cleanSnapshot.links[0];
    
    if (isNewLinkFormat) {
      if (cleanSnapshot.links.length > 30) {
        const omittedCount = cleanSnapshot.links.length - 30;
        cleanSnapshot.links = cleanSnapshot.links.slice(0, 30);
        cleanSnapshot.links.push({
          text: `...and ${omittedCount} more links`,
          url: '',
          title: null,
          aria: null
        });
      }
    } 
    // Handle old format (strings)
    else if (cleanSnapshot.links.length > 30) {
      cleanSnapshot.links = cleanSnapshot.links.slice(0, 30);
      cleanSnapshot.links.push(`...and ${domSnapshot.links.length - 30} more links`);
    }
  }
  
  return cleanSnapshot;
}