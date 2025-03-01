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

Current page state:
${JSON.stringify(state, null, 2)}

Available actions:
Click: { type: "click", element: "input[type=text]", description: "text input field" }
Input: { type: "input", element: "input[type=text]", value: "search text" }
Navigate: { type: "navigate", value: "https://example.org" }
Scroll: { type: "scroll" }
Extract: { type: "extract" }
Wait: { type: "wait", maxWait: 5000 }

Format your response as a simple JSON object with a 'type' field that is one of: click, input, navigate, scroll, extract, wait.
Keep your response very short and include only necessary fields.
For example: {"type": "input", "element": "input[type=text]", "value": "search query"}

IMPORTANT: When selecting elements, use common CSS selectors (not XPath) and be as general as possible.
Prefer tag selectors with attributes like: input[type=text], button[type=submit], a[href*="example"]
Avoid specific classes or IDs that may be dynamic or change across sites.

Current task context:
${context.history.join('\n')}
${context.retries ? `Previous attempts failed: ${context.retries}. Try a more generic selector like 'input[type=text]' or 'button[type=submit]'.` : ''}

Next action:
    `;
    try {
      console.log("Calling Ollama API");
      const response = await ollama.invoke(prompt);
      console.log("Response received: ", JSON.stringify(response, null, 2));
      
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
