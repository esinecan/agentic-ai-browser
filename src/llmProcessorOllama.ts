import { ChatOllama } from '@langchain/ollama';
import dotenv from 'dotenv';
import { LLMProcessor } from "./llmProcessor.js";
import { GraphContext, ActionSchema, type Action } from "./browserExecutor.js";

dotenv.config();

// Use host.docker.internal to access the host from Docker container
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
console.log(`Using Ollama host: ${OLLAMA_HOST}`);

const ollama = new ChatOllama({
  baseUrl: OLLAMA_HOST,
  model: "llama3.2:latest",
  temperature: 0.3,
});

export const ollamaProcessor: LLMProcessor = {
  async generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
    const prompt = `
You are a web automation assistant. Current page state:
${JSON.stringify(state, null, 2)}

Available actions:
Click: { type: "click", element: "selector", description: "button text" }
Input: { type: "input", element: "selector", value: "text" }
Navigate: { type: "navigate", value: "url" }
Scroll: { type: "scroll" }
Extract: { type: "extract" }
Wait: { type: "wait", maxWait: 5000 }

Format your response as JSON.

Current task context:
${context.history.join('\n')}
${context.retries ? `Previous attempts failed: ${context.retries}` : ''}

Next action:
    `;
    try {
      console.log("Calling Ollama API at:", OLLAMA_HOST);
      const response = await ollama.invoke(prompt);
      
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

      // Clean up any markdown code blocks
      if (responseContent) {
        responseContent = responseContent.replace(/```json/g, "").replace(/```/g, "");
      } else {
        throw new Error("Failed to extract text content from LLM response");
      }
      
      const parsed = ActionSchema.safeParse(JSON.parse(responseContent));
      return parsed.success ? parsed.data : null;
    } catch (error) {
      console.error("LLM Error:", error);
      return null;
    }
  }
};
