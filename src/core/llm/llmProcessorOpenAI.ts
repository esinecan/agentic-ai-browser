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

    // Build the payload for OpenAI API
    const payload = {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...this.lastContext,
        { role: "user", content: prompt }
      ]
    };
  
    try {
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
      let responseText = '';
      
      // Handle OpenAI response format
      if (response.choices && response.choices.length > 0) {
        responseText = response.choices[0].message.content;
        
        // Update context
        this.updateContext(prompt, responseText);
        
        logger.debug('Updated OpenAI context', {
          contextLength: this.lastContext.length
        });
      } else {
        logger.error('Unexpected response format from OpenAI', response);
        return "Error: Unexpected response format from LLM provider";
      }
      
      logger.info('LLM response received from OpenAI', {
        responseText,
        responseLength: responseText.length
      });
      
      return responseText;
    } catch (error) {
      logger.error('OpenAI LLM Error: ', error);
      return "Error communicating with OpenAI API";
    }
  }
}

// Export a singleton instance
export const openaiProcessor = new OpenAIProcessor();
