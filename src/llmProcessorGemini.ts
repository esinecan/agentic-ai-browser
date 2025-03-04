import dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GraphContext } from "./browserExecutor.js";
import { ActionExtractor } from "./actionExtractor.js";

const apiKey = process.env.GEMINI_API_KEY || "default_api_key";
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please set it in your environment variables.");
}
const genAI = new GoogleGenerativeAI(apiKey);

// Configure the Gemini model.
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    candidateCount: 1,
    maxOutputTokens: 8000, // Increased to avoid truncation
    temperature: 0.7,
  },
});

// Export a function that implements the generateNextAction method.
export async function generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
  const prompt = `
You are a web automation assistant using Google Gemini Generative AI.
${context.userGoal ? `Your goal is to: ${context.userGoal}` : ''}

${context.pageSummary ? `Page Summary: ${context.pageSummary}` : ''}

${context.actionFeedback ? `${context.actionFeedback}\n` : ''}

${context.lastActionSuccess 
  ? `🌟 The last action was SUCCESSFUL! Keep up the good work!` 
  : context.retries 
    ? `Previous ${context.retries} attempts with selector "${context.lastSelector}" weren't successful. Let's try a different approach.` 
    : ''
}

${context.interactiveElements && context.interactiveElements.length > 0 
  ? `Interactive elements detected on page:
${context.interactiveElements.map(el => `- ${el}`).join('\n')}` 
  : ''}

Current page state:
URL: ${(state as any).url}
Title: ${(state as any).title}

${context.successfulActions && context.successfulActions.length > 0 
  ? `💡 Actions that have worked well on this site:\n${context.successfulActions.slice(-3).join('\n')}`
  : ''
}

${context.recognizedMilestones && context.recognizedMilestones.length > 0
  ? `🏆 Milestones achieved: ${context.recognizedMilestones.join(', ')}`
  : ''
}

Available actions:
Click: { "type": "click", "element": "input[type=text]", "description": "text input field" }
Input: { "type": "input", "element": "input[type=text]", "value": "search text" }
Navigate: { "type": "navigate", "value": "https://example.org" }
Scroll: { "type": "scroll" }
Extract: { "type": "extract", "element": "div.content" }
Wait: { "type": "wait", "maxWait": 5000 }
AskHuman: { "type": "askHuman", "question": "How should I proceed with this form?" }

IMPORTANT: Format your response as a JSON object with a "type" field.
Always use "type" to specify what action to perform.
Example: {"type": "input", "element": "input[type=text]", "value": "search query"}

When selecting elements, use common CSS selectors (not XPath) and be as general as possible.
Prefer tag selectors with attributes like: input[type=text], button[type=submit], a[href*="example"]
Avoid specific classes or IDs that may be dynamic or change across sites.

Use the askHuman action when you're stuck or unsure about how to proceed.

Current task context:
${context.compressedHistory ? context.compressedHistory.join('\n') : context.history.join('\n')}

Next action:
  `;
  try {
    console.log("Calling Gemini API");
    // Use simple content generation without schema enforcement
    const result = await model.generateContent(prompt);
    console.log("Response received: ", JSON.stringify(result, null, 2));
    const responseText = result.response.text();
    
    // Use the ActionExtractor to handle all normalization and extraction
    const action = ActionExtractor.extract(responseText);
    
    if (!action) {
      console.error("Failed to extract valid action from Gemini response");
    }
    
    return action;
  } catch (error) {
    console.error("Gemini LLM Error:", error);
    return null;
  }
}