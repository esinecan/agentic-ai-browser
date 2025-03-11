import dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GraphContext } from "./browserExecutor.js";
import { ActionExtractor } from "./core/action-handling/ActionExtractor.js";
import { LLMProcessor } from "./llmProcessor.js";
import logger from './utils/logger.js';

interface GeminiConfig {
  modelName: string;
  maxOutputTokens: number;
  temperature: number;
}

const defaultConfig: GeminiConfig = {
  modelName: "gemini-2.0-flash-lite",
  maxOutputTokens: 18000,
  temperature: 0.7,
};

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  logger.error('GEMINI_API_KEY is not defined. Please set it in the environment variables.');
  throw new Error("GEMINI_API_KEY is not defined. Please set it in the environment variables.");
}

class GeminiProcessor implements LLMProcessor {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private tokenCount: number = 0;
  private readonly MAX_TOKENS = 30000;
  private lastResponse: any = null;
  private config: GeminiConfig;

  constructor(config: Partial<GeminiConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    // We can safely assert apiKey is string here since we checked above
    this.genAI = new GoogleGenerativeAI(apiKey as string);
    this.model = this.genAI.getGenerativeModel({
      model: this.config.modelName,
      generationConfig: {
        maxOutputTokens: this.config.maxOutputTokens,
        temperature: this.config.temperature,
      },
      systemInstruction: `
### You are an automation agent controlling a web browser.
### Your only goal is to execute web automation tasks precisely.
### You can return ONLY ONE of the 5 valid action types per response:

- Click: { "type": "click", "element": "selector", "description": "description" }
- Input: { "type": "input", "element": "selector", "value": "text" }
- Navigate: { "type": "navigate", "value": "url" }
- Wait: { "type": "wait", "maxWait": milliseconds }
- AskHuman: { "type": "askHuman", "question": "This is how you communicate with human user." }

---
# EXAMPLES:
1. If asked to navigate: { "type": "navigate", "value": "https://example.com" }
2. If asked to click: { "type": "click", "element": "#submit-button" }
3. If asked to summarize, use askHuman: { "type": "askHuman", "question": "The summary you asked for: lorem ipsum dolor sit am...." }
`
    });

    if(process.env.LLM_PROVIDER === 'gemini') {
      logger.info('Gemini processor initialized', {
        modelName: this.config.modelName,
        maxOutputTokens: this.config.maxOutputTokens,
        temperature: this.config.temperature
      });
    }
  }

  private logPromptContext(context: Record<string, any>) {
    logger.debug("GEMINI CONTEXT", context);
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

  private truncate(text: string | undefined, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...[content truncated]';
  }

  private async processPrompt(prompt: string): Promise<string> {
    logger.llm.request('Gemini', {
      modelInfo: {
        model: this.config.modelName,
        contextSize: this.lastResponse ? 'Using previous context' : 'New context',
        tokenCount: this.tokenCount,
        maxTokens: this.MAX_TOKENS
      },
      promptAnalysis: {
        goal: prompt.match(/TASK: (.*?)\n/)?.[1],
        url: prompt.match(/URL: (.*?)\n/)?.[1],
        title: prompt.match(/TITLE: (.*?)\n/)?.[1],
        feedback: prompt.match(/FEEDBACK: (.*?)\n/)?.[1],
        historyEntries: prompt.match(/TASK HISTORY:\n([\s\S]*?)$/)?.[1]?.split('\n').length || 0
      }
    });

    const estimatedPromptTokens = Math.ceil(prompt.length / 4);
    this.tokenCount += estimatedPromptTokens;
    
    if (this.tokenCount > this.MAX_TOKENS) {
      logger.info('Token limit reached, resetting context', {
        currentTokens: this.tokenCount,
        limit: this.MAX_TOKENS
      });
      this.lastResponse = null;
      this.tokenCount = estimatedPromptTokens;
    }

    try {
      const history = this.lastResponse ? [this.lastResponse] : [];
      const result = await this.model.generateContent({
        contents: [...history, { role: "user", parts: [{ text: prompt }] }],
      });

      const responseText = result.response.text();
      
      logger.llm.response('Gemini', {
        responseLength: responseText.length,
        content: responseText,
        hasContext: !!this.lastResponse,
        contextUpdated: true
      });

      this.lastResponse = { role: "model", parts: [{ text: responseText }] };
      return responseText;
    } catch (error) {
      logger.llm.error('Gemini', {
        error,
        lastResponseSize: this.lastResponse?.parts[0]?.text?.length,
        tokenCount: this.tokenCount
      });
      this.lastResponse = null;
      this.tokenCount = 0;
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

PAGE CONTENT:\n ${context.pageContent}
---
---
TASK HISTORY:
${context.compressedHistory ? context.compressedHistory.slice(-5).join('\n') : 
  context.history ? context.history.slice(-5).join('\n') : 'No previous actions.'}
---
`;
      prompt = prompt.replace(/[\t ]{2,}/g, ' ');

      logger.info('Built Gemini prompt:\n', prompt);

      const responseText = await this.processPrompt(prompt);
      
      logger.info('Received Gemini response:\n', responseText);
      
      const extractor = new ActionExtractor();
      const action = await extractor.processRawAction(responseText);
      
      logger.debug('Action extraction completed', {
        success: !!action,
        action: action
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
          lastAction: context.action
        }
      });
      return null;
    }
  }
}

// Export a singleton instance with default config
export const geminiProcessor: LLMProcessor = new GeminiProcessor();