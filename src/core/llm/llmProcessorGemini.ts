import dotenv from "dotenv";
import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";
import { BaseLLMProcessor } from "./BaseLLMProcessor.js";
import logger from '../../utils/logger.js';

dotenv.config();

const MODEL = process.env.LLM_MODEL || "gemini-2.0-flash-lite";

// Define JSON schema for responses
const RESPONSE_SCHEMA = {
  description: "Action to perform in the browser",
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      description: "The type of action to be performed.",
      enum: ["click", "input", "navigate", "wait", "sendHumanMessage", "notes"]
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
    },
    operation: {
      type: SchemaType.STRING,
      enum: ["add", "read"],
      description: "Operation to perform with notes (required when type is 'notes')"
    },
    note: {
      type: SchemaType.STRING,
      description: "Content of the note to add (required when operation is 'add')"
    }
  },
  required: ["type"]
};

class GeminiProcessor extends BaseLLMProcessor {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    super();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.error('GEMINI_API_KEY is not defined. Please set it in the environment variables.');
      throw new Error("GEMINI_API_KEY is not defined. Please set it in the environment variables.");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: this.getSystemPrompt(), // Use the system prompt from base class
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as Schema
      }
    });
  }
  
  // No need to override getSystemPrompt() - using the base class implementation
  
  protected async processPrompt(prompt: string, systemPrompt: string): Promise<string> {
    try {
      // Format messages for Gemini API using their SDK format
      const contents = [
        ...this.lastContext.map(msg => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }]
        })),
        { role: "user", parts: [{ text: prompt }] }
      ];

      logger.info('Gemini prompt: \n' + prompt + '\n');

      try {
        // Request completion from Gemini
        const result = await this.model.generateContent({
          contents,
        });

        const responseText = result.response.text();
        
        logger.info('Gemini response: \n' + responseText + '\n');

        // Update conversation context
        this.updateContext(prompt, responseText);
        
        // Keep conversation context manageable
        if (this.lastContext.length > 10) {
          this.lastContext = this.lastContext.slice(-10);
        }

        return responseText;
      } catch (error: any) {
        // Check for token limit errors
        if (error.message && (
            error.message.includes("maximum context length") || 
            error.message.includes("token") ||
            error.message.includes("content size") ||
            error.message.includes("too long")
          )) {
          logger.warn('Hit token limit in Gemini, pruning context and retrying', {
            error: error.message,
            contextLength: this.lastContext.length
          });
          
          // Axe half the context and try again
          this.pruneContextIfNeeded();
          return this.processPrompt(prompt, systemPrompt);
        } else {
          // Rethrow other errors
          throw error;
        }
      }
    } catch (error) {
      logger.error('Gemini LLM Error: ', error);
      return "Error communicating with Gemini API";
    }
  }
}

// Export a singleton instance
export const geminiProcessor = new GeminiProcessor();