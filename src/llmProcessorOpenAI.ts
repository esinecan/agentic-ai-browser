import { OpenAI } from "langchain/llms/openai";
import dotenv from "dotenv";
import { GraphContext, ActionSchema } from "./browserExecutor.js";

dotenv.config();

const llm = new OpenAI({
  modelName: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
  maxRetries: 2,
  concurrency: 1,
});

export async function generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
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
    let response = await llm.call(prompt);
    response = response.replace(/```json/g, "").replace(/```/g, "");
    const parsed = ActionSchema.safeParse(JSON.parse(response));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.error("LLM Error:", error);
    return null;
  }
}
