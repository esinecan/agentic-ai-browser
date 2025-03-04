import { ChatOllama } from '@langchain/ollama';
import dotenv from 'dotenv';
import { LLMProcessor } from "./llmProcessor.js";
import { GraphContext } from "./browserExecutor.js";
import { ActionExtractor } from "./actionExtractor.js";

dotenv.config();

// Use host.docker.internal to access the host from Docker container
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';

const ollama = new ChatOllama({
  baseUrl: OLLAMA_HOST,
  model: "llama3.2:latest", // Use the default model name
  temperature: 0.3,
  format: "json"
});

export const ollamaProcessor: LLMProcessor = {
  async generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
    const prompt = `
You are a web automation assistant. 
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
      console.log("-------------------");
      console.log("\n MAIN SLM PROMPT:\n" + prompt + "\n");
      console.log("-------------------");
      const response = await ollama.invoke(prompt);
      console.log("-------------------");
      console.log("\n MAIN SLM RESPONSE:\n" + JSON.stringify(response, null, 2) + "\n");
      console.log("-------------------");
      
      // Extract text from the response content
      let responseContent = '';
      
      // If content is a string, use it directly
      if (typeof response.content === 'string') {
        responseContent = response.content;
      } 
      // If content is an array (MessageContentComplex[]), extract text parts
      else if (Array.isArray(response.content)) {
        for (const part of response.content) {
          if (part.type === 'text') {
            responseContent += part.text;
          }
        }
      }

      if (!responseContent) {
        console.error("Failed to extract text content from LLM response");
        return null;
      }
      
      // Use the ActionExtractor to handle all normalization and extraction
      const action = ActionExtractor.extract(responseContent);
      
      if (!action) {
        console.error("Failed to extract valid action from Ollama response");
      }
      
      return action;
    } catch (error) {
      console.error("LLM Error:", error);
      return null;
    }
  }
};
