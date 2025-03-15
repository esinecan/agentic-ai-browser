import dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";
import { GraphContext } from "./browserExecutor.js";
import { ActionExtractor } from "./core/action-handling/ActionExtractor.js";
import { LLMProcessor } from "./llmProcessor.js";
import logger from './utils/logger.js';

// Using the same system prompt as Ollama processor
const SYSTEM_PROMPT = `
### You are an automation agent controlling a web browser.
### Your only goal is to execute web automation tasks precisely.
### You can return ONLY ONE of the 5 valid action types per response:

- Click: { "type": "click", "element": "selector", "description": "description" }
- Input: { "type": "input", "element": "selector", "value": "text" }
- Navigate: { "type": "navigate", "value": "url" }
- Wait: { "type": "wait", "maxWait": milliseconds }
- SendHumanMessage: { "type": "sendHumanMessage", "question": "This is how you communicate with human user." }

---
# EXAMPLES:
1. If asked to navigate: { "type": "navigate", "value": "https://example.com" }
2. If asked to click: { "type": "click", "element": "#submit-button" }
3. If asked to summarize, use sendHumanMessage: { "type": "sendHumanMessage", "question": "Hello I am AI assistant. What are you up to you fithy flesh monkey you?" }
`;

// Define JSON schema for responses - similar to Ollama's RESPONSE_FORMAT
const RESPONSE_SCHEMA = {
  description: "Action to perform in the browser",
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      description: "The type of action to be performed.",
      enum: ["click", "input", "navigate", "wait", "sendHumanMessage"]
    },
    element: {
      type: SchemaType.STRING,
      description: "The CSS selector of the element to interact with (if applicable)."
    },
    value: {
      type: SchemaType.STRING,
      description: "The input value for the action (if applicable)."
    },
    description: {
      type: SchemaType.STRING,
      description: "A brief description of the action being performed."
    },
    question: {
      type: SchemaType.STRING,
      description: "The question to ask the human user (only for sendHumanMessage action)."
    },
    maxWait: {
      type: SchemaType.NUMBER,
      description: "The maximum time to wait in milliseconds (only for wait action)."
    }
  },
  required: ["type"]
};

interface GeminiConfig {
  modelName: string;
}

const defaultConfig: GeminiConfig = {
  modelName: process.env.LLM_MODEL || "gemini-2.0-flash-lite",
};

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  logger.error('GEMINI_API_KEY is not defined. Please set it in the environment variables.');
  throw new Error("GEMINI_API_KEY is not defined. Please set it in the environment variables.");
}

// Message type similar to Ollama for consistency
type ConversationMessage = {
  role: string;
  parts: { text: string }[];
};

class GeminiProcessor implements LLMProcessor {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private config: GeminiConfig;
  // Store conversation history similar to Ollama
  private lastContext: ConversationMessage[] = [];

  constructor(config: Partial<GeminiConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.genAI = new GoogleGenerativeAI(apiKey as string);
    this.model = this.genAI.getGenerativeModel({
      model: this.config.modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as Schema
      }
    });
  }

  // Sanitizes a user message by removing the PAGE CONTENT block, same as Ollama
  private sanitizeUserMessage(message: string): string {
    // Remove from "PAGE CONTENT:" up to the next separator (a line that starts with ---)
    return message.replace(/PAGE CONTENT:\s*[\s\S]*?(?=\n---)/, '').trim();
  }

  private buildFeedbackSection(context: GraphContext): string {
    if (context.actionFeedback) {
      return `FEEDBACK: ${context.actionFeedback}`;
    } else if (context.retries && context.retries > 0) {
      return `ISSUE: Previous ${context.retries} attempts with selector "${context.lastSelector}" failed. Try a different approach.`;
    } else if (context.lastActionSuccess) {
      return `SUCCESS: Last action worked! Continue to next step.`;
    }
    return '';
  }

  private async processPrompt(prompt: string): Promise<string> {
    try {
      // Structure the contents with system prompt and conversation history
      logger.info('Gemini prompt: \n' + prompt + '\n' );
      const result = await this.model.generateContent({
        contents: [
          ...this.lastContext,
          { role: "user", parts: [{ text: prompt }] }
        ],
      });

      const responseText = result.response.text();
      
      logger.info('Gemini response: \n' + responseText + '\n' );

      // Update conversation context with sanitized user message and model response
      this.lastContext.push({ role: "user", parts: [{ text: this.sanitizeUserMessage(prompt) }] });
      this.lastContext.push({ role: "model", parts: [{ text: responseText }] });
      
      // If history gets too long, trim it to keep the most recent exchanges
      if (this.lastContext.length > 10) {
        this.lastContext = this.lastContext.slice(-10);
      }

      return responseText;
    } catch (error) {
      logger.llm.error('Gemini', error);
      return "Error communicating with Gemini API";
    }
  }

  async generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
    try {
      context.pageContent = (state as any).pageContent;
      const { url, title } = state as { url: string; title: string };
      
      logger.info('Generating next action', {
        state: {
          url,
          title,
          pageAnalysis: {
            contentLength: context.pageContent?.length,
            interactiveElements: context.previousPageState?.interactiveElements?.length
          }
        },
        executionContext: {
          goal: context.userGoal,
          lastAction: context.action,
          retryCount: context.retries,
          successCount: context.successCount,
          recentHistory: context.history?.slice(-3)
        }
      });

      let prompt = `
---
${context.userGoal ? `YOUR CURRENT TASK: ${context.userGoal}` : 'This is what the browser is currently displaying.'}
---
${this.buildFeedbackSection(context)}
---
THIS IS THE SIMPLIFIED HTML CONTENT OF THE PAGE, IN LIEU OF YOU "SEEING" THE PAGE:
URL: ${(state as any).url}
TITLE: ${(state as any).title}

PAGE CONTENT:
${context.pageContent}
---
---
TASK HISTORY:
${context.compressedHistory ? context.compressedHistory.slice(-5).join('\n') : 
  context.history ? context.history.slice(-5).join('\n') : 'No previous actions.'}
---
`;
      prompt = prompt.replace(/[\t ]{2,}/g, ' ');

      logger.debug('Built Gemini prompt', {
        promptLength: prompt.length,
        hasPageContent: !!context.pageContent,
        hasSuccessfulActions: (context.successfulActions?.length ?? 0) > 0,
        feedback: this.buildFeedbackSection(context)
      });

      const responseText = await this.processPrompt(prompt);
      
      const extractor = new ActionExtractor();
      const action = await extractor.processRawAction(responseText);
      
      logger.debug('Action extraction completed', {
        success: !!action,
        action: action,
        responseLength: responseText.length
      });

      if (!action) throw new Error("Failed to extract action from response");
      return action;
    } catch (error) {
      logger.error('Failed to generate next action', {
        error,
        state: {
          url: (state as any).url,
          title: (state as any).title
        },
        context: {
          userGoal: context.userGoal,
          lastAction: context.action,
          retries: context.retries
        }
      });
      return null;
    }
  }
}

// Export a singleton instance with default config
export const geminiProcessor: LLMProcessor = new GeminiProcessor();