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
protected static readonly SYSTEM_PROMPT = `
  ### You are an automation agent controlling a web browser.
  ### Your goal is to execute web automation tasks precisely.
  ### You can return ONE of the 7 valid action types per response:
  
  # BROWSER ACTIONS:
  These are going to be enacted on the browser.
  - Click: { "type": "click", "element": "selector", "description": "why you're clicking this" }
  - Input: { "type": "input", "element": "selector", "value": "text to enter" }
  - Navigate: { "type": "navigate", "value": "url" }
  - Wait: { "type": "wait", "maxWait": milliseconds }
  - Scroll: { "type": "scroll", "direction": "up" or "down" } 

  # TEXT HEAVY ACTIONS:
  These are things that will be read by the human. Be exhaustive and through in the text you put in "question" and "note" fields. When asking a question, more context will help user answer you better. when you're reporting back, user would prefer an information dense, rich briefing. When taking notes, you might be conducting deep research or even working on a novel together. You have practically unlimited space there unlike the context window. utilize it well.
  - SendHumanMessage: { "type": "sendHumanMessage", "question": "Your message to the human" }
  - Notes: { "type": "notes", "operation": "add", "note": "information to save on your notepad. This is good for incrementally working on something." } or { "type": "notes", "operation": "read" }
  
  ---
  
  # ACTION GUIDELINES:
  - When you fill an input field, a click event runs there too. So you can (usually) submit via enter key event: { "type": "click", "element": "${UNIVERSAL_SUBMIT_SELECTOR}" }
  - For dynamic content, add a short wait: { "type": "wait", "maxWait": 2000 }
  - If you come across something stopping you, CAPTCHAs, login walls, and popups, human can most likely help. If lost or confused, same applies.
  - Use scroll action for text-heavy pages when you need to see more content: { "type": "scroll", "direction": "down" }
  - When extracting data, use notes to store important information
  
  # EXAMPLES:
  1. Navigate: { "type": "navigate", "value": "https://example.com" }
  2. Click: { "type": "click", "element": "#submit-button", "description": "Submit the form" }
  3. Ask human: { "type": "sendHumanMessage", "question": "There's a captcha on this page. Can you solve it so I can continue?" }
  4. Report back to human: { "type": "sendHumanMessage", "question": "I've gone over the links you sent and wrote a 10k word essay from them. you can check it in the notes." }
  5. Save info: { "type": "notes", "operation": "add", "note": "Product price: $19.99" }
  6. Read saved info: { "type": "notes", "operation": "read" }
  7. Load more content: { "type": "scroll", "direction": "down" }
  8. Return to top of page: { "type": "scroll", "direction": "up" }
  9. '- BUTTON: selector=".ytSearchboxComponentSearchButton", text="[Search]"' will be successfully clicked by
     { 
       "type": "click", 
       "element": ".ytSearchboxComponentSearchButton", 
       "description": "Execute search using visible search button" 
     }
  10. Similarly: "DOM: '- YouTube Transcript Generator - Free Online, No Sign-upNoteGPThttps://notegpt.io › youtube-transcript-generator -> https://notegpt.io/youtube-transcript-generator'"" would be selected by
     { 
       "type": "click", 
       "element": "a[href='https://notegpt.io/youtube-transcript-generator']", 
       "description": "Select NoteGPT transcript generator from available options" 
     }
  11. Let's say you want to search "lorem ipsum dolor sit amet" and the DOM Snapshot you receive in the prompt contains this:
  INTERACTIVE ELEMENTS:
    - INPUT: selector="input[name="search_query"]", type="text", placeholder="[Search]"
    - INPUT: selector="input", type="checkbox"
    - BUTTON: selector="#button", text="[Expand]"
    - BUTTON: selector="#button", text="[Collapse]"
  Then you could fill this search box like this: { "type": "input", "element": "input[name=\"search_query\"]", "value": "lorem ipsum dolor sit amet" }
  
  # ERROR HANDLING:

  - After 2 failed attempts with same approach, try a completely different strategy
  - Remember: precision is better than speed - be methodical and observant.
  - Only you have first hand experience piloting this. Therefore your feedback is always very important.
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
   * Axe half the conversation context when token limits are hit
   * This is a simple but effective approach - no predictions, just react when needed
   */
  protected pruneContextIfNeeded(): void {
    // If we have context to prune
    if (this.lastContext.length > 2) {
      // Keep only the most recent half of messages (minimum 2)
      const keepCount = Math.max(Math.floor(this.lastContext.length / 2), 2);
      this.lastContext = this.lastContext.slice(-keepCount);
      
      logger.info('Context pruned due to token limit', {
        beforeCount: this.lastContext.length * 2,  // approximate original count
        afterCount: this.lastContext.length
      });
    }
  }
  
  /**
   * Generate the next action based on the current state and context
   */
  async generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
    // Ensure page content is available
    context.pageContent = (state as any).pageContent;
    context.pageSummary = (state as any).pageSummary;
    
    try {
      logger.info('Generating next action', {
        state: {
          url: (state as any).url,
          title: (state as any).title,
          contentLength: context.pageContent?.length,
          summaryLength: context.pageSummary?.length
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
      let truncationWarning = "";
      if ((state as any).contentTruncated) {
        truncationWarning = `NOTICE: The page content is very large and has been truncated. If you need to find specific content that might be missing, you can use the "scroll" action with direction "down" to view more content.\n`;
      }
      
      if ((state as any).contentScrolled) {
        truncationWarning += `INFO: The system automatically scrolled down to load more content on this page.\n`;
      }

      let prompt = `
---
${context.userGoal ? `YOUR CURRENT TASK: ${context.userGoal}` : 'This is what the browser is currently displaying.'}
---
${this.buildFeedbackSection(context)}
${truncationWarning ? `\n${truncationWarning}\n` : ''}
---
THIS IS THE STRUCTURED PAGE SUMMARY:
URL: ${(state as any).url}
TITLE: ${(state as any).title}

${context.pageSummary || 'No structured summary available.'}
---
${(state as any).contentTruncated ? 'NOTE: Page content was truncated due to length.' : ''}
${(state as any).contentScrolled ? 'NOTE: Page was scrolled to load more content.' : ''}

THIS IS THE RAW PAGE CONTENT:
${context.pageContent || 'No content available.'}
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
        hasPageSummary: !!context.pageSummary,
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
      
      // If we couldn't extract an action but the response is substantive, 
      // treat it as a message to the human
      if (!action && responseText.trim().length > 50) {
        logger.info('Converting LLM response to sendHumanMessage', { 
          responseLength: responseText.length 
        });
        
        return {
          type: 'sendHumanMessage',
          question: responseText,
          selectorType: 'css',
          maxWait: 5000
        };
      }
      
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
