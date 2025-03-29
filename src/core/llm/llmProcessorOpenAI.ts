import dotenv from 'dotenv';
import { BaseLLMProcessor, ConversationMessage } from "./BaseLLMProcessor.js";
import logger from '../../utils/logger.js';

dotenv.config();

// Configuration with environment variable fallbacks
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.LLM_MODEL || "gpt-3.5-turbo";
const API_KEY = process.env.OPENAI_API_KEY;

class OpenAIProcessor extends BaseLLMProcessor {
  // No need to override getSystemPrompt() - using base class implementation
  
  protected async processPrompt(prompt: string, systemPrompt: string): Promise<string> {
    // Check for API key
    if (!API_KEY) {
      logger.error('OPENAI_API_KEY is not defined in environment variables');
      return "Error: OpenAI API key not configured";
    }

    try {
      // Build the payload for OpenAI API
      const payload = {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...this.lastContext,
          { role: "user", content: prompt }
        ]
      };
    
      const result = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      logger.info('LLM request sent to OpenAI', {
        model: MODEL,
        contextLength: this.lastContext.length,
        requestText: prompt,
      });
      
      const response = await result.json();
      
      // Check for token limit errors
      if (response.error && (
          response.error.message?.includes("maximum context length") || 
          response.error.message?.includes("token") ||
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
      
      let responseText = '';
      
      // Handle OpenAI response format
      if (response.choices && response.choices.length > 0) {
        responseText = response.choices[0].message.content;
        
        // Update context
        this.updateContext(prompt, responseText);
        
        logger.debug('Updated OpenAI context', {
          contextLength: this.lastContext.length
        });
      } else if (response.error) {
        logger.error('OpenAI API Error', response.error);
        return `Error from OpenAI API: ${response.error.message}`;
      } else {
        logger.error('Unexpected response format from OpenAI', response);
        return "Error: Unexpected response format from LLM provider";
      }
      
      logger.info('LLM response received from OpenAI', {
        responseLength: responseText.length
      });
      
      return responseText;
    } catch (error) {
      // For network errors or other exceptions
      logger.error('OpenAI LLM Error: ', error);
      
      // Type guard for error with message property
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if the error might be token-related
      if (typeof errorMessage === 'string' && (
          errorMessage.includes("maximum context length") || 
          errorMessage.includes("token") ||
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
      
      return "Error communicating with OpenAI API";
    }
  }
}

// In the RESPONSE_SCHEMA object:
const RESPONSE_SCHEMA = {
  properties: {
    type: {
      type: "string",
      enum: ["click", "input", "navigate", "wait", "sendHumanMessage", "notes"]
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
};

// Export a singleton instance
export const openaiProcessor = new OpenAIProcessor();
