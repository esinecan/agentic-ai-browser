import { LLMProcessor } from "./llmProcessor.js";
import { GraphContext } from "../../browserExecutor.js";
import { ActionExtractor } from '../actions/extractor.js';
import logger from '../../utils/logger.js';
import dotenv from "dotenv";
dotenv.config();
const UNIVERSAL_SUBMIT_SELECTOR = process.env.UNIVERSAL_SUBMIT_SELECTOR || "";

export type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Abstract base class for LLM processors that implements common functionality
 */
export abstract class BaseLLMProcessor implements LLMProcessor {
  // Shared system prompt for all LLM processors
  protected static readonly SYSTEM_PROMPT =  `
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
  4. If you can't find a button for submitting a input: { "type": "click", "element": "${UNIVERSAL_SUBMIT_SELECTOR}" "description":"If you send click with ${UNIVERSAL_SUBMIT_SELECTOR || "empty string"} is same as pressing enter on keyboard."}
  `;
  
  // Conversation tracking
  protected lastContext: ConversationMessage[] = [];
  
  /**
   * Process a prompt string and return the LLM's response
   * Must be implemented by provider-specific classes
   */
  protected abstract processPrompt(prompt: string, systemPrompt: string): Promise<string>;
  
  /**
   * Get the system prompt for this LLM provider
   * Default implementation returns the shared system prompt
   */
  protected getSystemPrompt(): string {
    return BaseLLMProcessor.SYSTEM_PROMPT;
  }
  
  /**
   * Helper to build the feedback section based on current context
   */
  protected buildFeedbackSection(context: GraphContext): string {
    if (context.actionFeedback) {
      return `FEEDBACK: ${context.actionFeedback}`;
    } else if (context.retries && context.retries > 0) {
      return `ISSUE: Previous ${context.retries} attempts with selector "${context.lastSelector}" failed. Try a different approach.`;
    } else if (context.lastActionSuccess) {
      return `SUCCESS: Last action worked! Continue to next step.`;
    }
    return '';
  }

  /**
   * Sanitizes a user message by removing the PAGE CONTENT block
   */
  protected sanitizeUserMessage(message: string): string {
    // Remove from "PAGE CONTENT:" up to the next separator (a line that starts with ---)
    return message.replace(/PAGE CONTENT:\s*[\s\S]*?(?=\n---)/, '').trim();
  }
  
  /**
   * Add messages to the conversation context
   */
  protected updateContext(userMessage: string, assistantResponse: string): void {
    this.lastContext.push({ 
      role: "user", 
      content: this.sanitizeUserMessage(userMessage) 
    });
    this.lastContext.push({ 
      role: "assistant", 
      content: assistantResponse 
    });
  }
  
  /**
   * Generate the next action based on the current state and context
   */
  async generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
    // Ensure page content is available
    context.pageContent = (state as any).pageContent;
    
    try {
      logger.info('Generating next action', {
        state: {
          url: (state as any).url,
          title: (state as any).title,
          contentLength: context.pageContent?.length
        },
        context: {
          goal: context.userGoal,
          lastAction: context.action,
          retryCount: context.retries,
          successCount: context.successCount,
          recentHistory: context.history?.slice(-3)
        }
      });

      // Build the prompt with a consistent format across providers
      let prompt = `
---
${context.userGoal ? `YOUR CURRENT TASK: ${context.userGoal}` : 'This is what the browser is currently displaying.'}
---
${this.buildFeedbackSection(context)}
---
THIS IS THE SIMPLIFIED HTML CONTENT OF THE PAGE, IN LIEU OF YOU "SEEING" THE PAGE:
URL: ${(state as any).url}
TITLE: ${(state as any).title}

${context.pageContent}
---
---
TASK HISTORY:
${context.compressedHistory ? context.compressedHistory.slice(-5).join('\n') : 
  context.history ? context.history.slice(-5).join('\n') : 'No previous actions.'}
---
`;
      // Clean up formatting
      prompt = prompt.replace(/[\t ]{2,}/g, ' ');
      
      logger.debug('Built LLM prompt', {
        provider: this.constructor.name,
        promptLength: prompt.length,
        hasPageContent: !!context.pageContent,
        hasSuccessfulActions: (context.successfulActions?.length ?? 0) > 0,
        feedback: this.buildFeedbackSection(context)
      });

      // Get response from the specific LLM provider
      const responseText = await this.processPrompt(prompt, this.getSystemPrompt());

      // Extract action from response text
      const extractor = new ActionExtractor();
      const action = await extractor.processRawAction(responseText);
      
      logger.debug('Action extraction completed', {
        success: !!action,
        action,
        responseLength: responseText.length
      });
      
      if (!action) throw new Error("Failed to extract action from response");
      return action;
    } catch (error) {
      logger.error('Failed to generate next action', {
        error,
        provider: this.constructor.name,
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
