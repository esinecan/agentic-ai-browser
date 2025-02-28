import dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GraphContext, ActionSchema } from "./browserExecutor.js";

const apiKey = process.env.GEMINI_API_KEY || "default_api_key";
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please set it in your environment variables.");
}
const genAI = new GoogleGenerativeAI(apiKey);

// Configure the Gemini model.
const model = genAI.getGenerativeModel({
  model: "tunedModels/yepisfinetune448prompts-3pcyk1il3e66",
  generationConfig: {
    candidateCount: 1,
    stopSequences: ["x"],
    maxOutputTokens: 150,
    temperature: 1.0,
  },
});

// Export a function that implements the generateNextAction method.
export async function generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
  const prompt = `
You are a web automation assistant using Google Gemini Generative AI. Current page state:
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
${context.history.join("\n")}
${context.retries ? `Previous attempts failed: ${context.retries}` : ""}

Next action:
  `;
  try {
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    
    // Remove any code block formatting.
    responseText = responseText.replace(/```json/gi, "").replace(/```/gi, "");
    
    // Validate the parsed response.
    const parsed = ActionSchema.safeParse(JSON.parse(responseText));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.error("Gemini LLM Error:", error);
    return null;
  }
}