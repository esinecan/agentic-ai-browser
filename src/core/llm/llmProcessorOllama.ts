import dotenv from 'dotenv';
import { BaseLLMProcessor, ConversationMessage } from "./BaseLLMProcessor.js";
import logger from '../../utils/logger.js';

dotenv.config();

// Base URL configuration with environment variable fallback
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const MODEL = process.env.LLM_MODEL || "phi4-mini";

// System prompt is now defined in BaseLLMProcessor

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "action_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["click", "input", "navigate", "wait", "sendHumanMessage", "notes"]
        },
        element: {
          type: "string",
          description: "The CSS selector of the element to interact with (if applicable).",
          nullable: true
        },
        value: {
          type: "string",
          description: "The input value for the action (if applicable).",
          nullable: true
        },
        description: {
          type: "string",
          description: "A brief description of the action being performed.",
          nullable: true
        },
        operation: {
          type: "string",
          enum: ["add", "read"],
          description: "Operation to perform with notes (required when type is 'notes')"
        },
        note: {
          type: "string",
          description: "Content of the note to add (required when operation is 'add')"
        }
      },
      required: ["type"],
      additionalProperties: false
    }
  }
};

class OllamaProcessor extends BaseLLMProcessor {
  // No need to override getSystemPrompt() - using the base class implementation
  
  protected async processPrompt(prompt: string, systemPrompt: string): Promise<string> {
    try {
      // Build the payload for Ollama API
      const payload = {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...this.lastContext,
          { role: "user", content: prompt }
        ],
        response_format: RESPONSE_FORMAT
      };
    
      const result = await fetch(`${OLLAMA_HOST}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      logger.info('LLM request sent to Ollama', {
        model: MODEL,
        contextLength: this.lastContext.length,
        requestText: prompt,
      });
      
      const response = await result.json();
      let responseText = '';
      
      // Check for token limit errors
      if (response.error && (
          response.error.message?.includes("maximum context length") || 
          response.error.message?.includes("token") ||
          response.error.message?.includes("too large") ||
          response.error.message?.includes("too long")
        )) {
        logger.warn('Hit token limit, pruning context and retrying', {
          error: response.error.message,
          contextLength: this.lastContext.length
        });
        
        // Axe half the context and try again
        this.pruneContextIfNeeded();
        return this.processPrompt(prompt, systemPrompt);
      }
      
      // Handle Ollama-specific response format
      if (response.context) {
        this.lastContext = response.context.map((msg: ConversationMessage) => {
          if (msg.role === 'user') {
            return { role: msg.role, content: this.sanitizeUserMessage(msg.content) };
          }
          return msg;
        });
        logger.debug('Updated Ollama context', {
          contextLength: response.context.length
        });
      } else {
        // Handle standard response format
        if (response && Array.isArray(response.choices) && response.choices.length > 0 
            && response.choices[0].message && response.choices[0].message.content) {
          responseText = response.choices[0].message.content;
        } else if (response.response) {
          responseText = response.response;
        } else if (response.error) {
          logger.error('Ollama API Error', response.error);
          return `Error from Ollama API: ${response.error}`;
        }
        
        // Update context manually
        this.updateContext(prompt, responseText);
      }
      
      logger.info('LLM response received from Ollama', {
        responseText,
        responseLength: responseText.length
      });
      
      return responseText;
    } catch (error) {
      logger.error('Ollama LLM Error: ', error);
      
      // Type guard for error with message property
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if the error might be token-related
      if (typeof errorMessage === 'string' && (
          errorMessage.includes("maximum context length") || 
          errorMessage.includes("token") ||
          errorMessage.includes("too large") ||
          errorMessage.includes("too long")
        )) {
        logger.warn('Possible token limit error in exception, pruning context and retrying', {
          errorMessage,
          contextLength: this.lastContext.length
        });
        
        // Axe half the context and try again
        this.pruneContextIfNeeded();
        return this.processPrompt(prompt, systemPrompt);
      }
      
      return "Error communicating with Ollama API";
    }
  }
}

// Export a singleton instance
export const ollamaProcessor = new OllamaProcessor();