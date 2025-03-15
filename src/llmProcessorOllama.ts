import dotenv from 'dotenv';
import { LLMProcessor } from "./llmProcessor.js";
import { GraphContext } from "./browserExecutor.js";
import { ActionExtractor } from "./core/action-handling/ActionExtractor.js";
import logger from './utils/logger.js';

dotenv.config();

// Use host.docker.
// internal to access the host from Docker container
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
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
3. If asked to summarize, use sendHumanMessage: { "type": "sendHumanMessage", "question": "The summary you asked for: lorem ipsum dolor sit am...." }
`;

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
          enum: ["click", "input", "navigate", "wait", "sendHumanMessage"],
          description: "The type of action to be performed."
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
        }
      },
      required: ["type"],
      additionalProperties: false
    }
  }
};

type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

class OllamaProcessor implements LLMProcessor {
  // Now using an array of conversation messages to track full context.
  private lastContext: ConversationMessage[] = [];
  
  // Helper function to build the feedback section based on current context.
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

  // Sanitizes a user message by removing the PAGE CONTENT block.
  private sanitizeUserMessage(message: string): string {
    // Remove from "PAGE CONTENT:" up to the next separator (a line that starts with ---)
    return message.replace(/PAGE CONTENT:\s*[\s\S]*?(?=\n---)/, '').trim();
  }
  
  async processPrompt(prompt: string): Promise<string> {
    // Build the payload messages: system prompt, previous conversation context, and the new user message.
    const payload = {
      model: process.env.LLM_MODEL || "phi4-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...this.lastContext,
        { role: "user", content: prompt }
      ],
      response_format: RESPONSE_FORMAT
    };
  
    try {
      const result = await fetch(`${OLLAMA_HOST}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      logger.info('LLM request sent', {
        requestText: prompt,
      });
      
      const response = await result.json();
      
      // Update conversation context. If the API returns a context array, sanitize any user messages.
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
        if (response && Array.isArray(response.choices) && response.choices.length > 0 && response.choices[0].message && response.choices[0].message.content) {
          response.response = response.choices[0].message.content;
          logger.info('LLM response received', {
            responseText: response.response
          });
      }
        // Fallback: update manually by pushing a sanitized version of the user prompt and the assistant response.
        this.lastContext.push({ role: "user", content: this.sanitizeUserMessage(prompt) });
        this.lastContext.push({ role: "assistant", content: response.response });
      }
      
      return response.response || '';
    } catch (error) {
      logger.llm.error('Ollama', {
        error,
        endpoint: `${OLLAMA_HOST}/api/generate`,
        lastContextSize: this.lastContext?.length
      });
      return "Error communicating with Ollama API";
    }
  }
  
  async generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
    // Ensure that context.pageContent is set from state if it is undefined.
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
      // Collapse multiple spaces or tabs.
      prompt = prompt.replace(/[\t ]{2,}/g, ' ');
      
      logger.debug('Built Ollama prompt', {
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

export const ollamaProcessor: LLMProcessor = new OllamaProcessor();