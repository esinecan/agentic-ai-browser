import dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GraphContext } from "./browserExecutor.js";
import { ActionExtractor } from "./actionExtractor.js";
import { LLMProcessor } from "./llmProcessor.js";
import logger from './utils/logger.js';

const apiKey = process.env.GEMINI_API_KEY || "default_api_key";
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please set it in your environment variables.");
}

class GeminiProcessor implements LLMProcessor {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private tokenCount: number = 0;
  private readonly MAX_TOKENS = 30000; // Gemini-Pro has a larger context window than Ollama
  private lastResponse: any = null;

  constructor() {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-pro",
      generationConfig: {
        maxOutputTokens: 8000,
        temperature: 0.7,
      },
    });
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
        model: "gemini-pro",
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
        generationConfig: {
          temperature: 0.7,
          candidateCount: 1,
          maxOutputTokens: 8000,
        },
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
        lastResponseSize: this.lastResponse?.parts[0].text.length,
        tokenCount: this.tokenCount
      });
      this.lastResponse = null;
      this.tokenCount = 0;
      return "Error communicating with Gemini API";
    }
  }

  async generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null> {
    try {
      logger.info('Generating next action', {
        state: {
          url: (state as any).url,
          title: (state as any).title,
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
          milestonesAchieved: context.recognizedMilestones,
          recentHistory: context.history?.slice(-3)
        }
      });

      const prompt = `
You are a web automation assistant using Google Gemini AI.
${context.userGoal ? `TASK: ${context.userGoal}` : 'Analyze the page and suggest the next action.'}

${this.buildFeedbackSection(context)}

CURRENT PAGE:
URL: ${(state as any).url}
TITLE: ${(state as any).title}

${context.pageContent ? `PAGE CONTENT:\n${this.truncate(context.pageContent, 6000)}` : ''}

${context.previousPageState?.interactiveElements ? 
  `Interactive elements detected on page:\n${context.previousPageState.interactiveElements.map((el: any) => `- ${el}`).join('\n')}` : 
  ''}

${context.successfulActions && context.successfulActions.length > 0 
  ? `SUCCESSFUL ACTIONS ON THIS SITE:\n${context.successfulActions.slice(-3).join('\n')}`
  : ''}

${context.recognizedMilestones && context.recognizedMilestones.length > 0
  ? `🏆 Milestones achieved: ${context.recognizedMilestones.join(', ')}`
  : ''}

AVAILABLE ACTIONS:
- Click: { "type": "click", "element": "selector", "description": "description" }
- Input: { "type": "input", "element": "selector", "value": "text" }
- Navigate: { "type": "navigate", "value": "url" }
- Wait: { "type": "wait", "maxWait": milliseconds }
- AskHuman: { "type": "askHuman", "question": "This is your direct line to the human end of this system. Want human to pass a bot check for you? Confused? Saying hi? Succeeded & reporting back? This is the thing to use." }

TASK HISTORY:
${context.compressedHistory ? context.compressedHistory.slice(-5).join('\n') : 
  context.history ? context.history.slice(-5).join('\n') : 'No previous actions.'}

Respond with a single JSON object for our next action.`;

      logger.debug('Built Gemini prompt', {
        promptLength: prompt.length,
        hasPageContent: !!context.pageContent,
        hasSuccessfulActions: context.successfulActions?.length ?? 0 > 0,
        feedback: this.buildFeedbackSection(context)
      });

      const responseText = await this.processPrompt(prompt);
      
      logger.debug('Extracting action from response', {
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 200)
      });

      const action = ActionExtractor.extract(responseText);
      
      logger.info('Action extraction completed', {
        success: !!action,
        action: action
      });

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

// Export a singleton instance
export const geminiProcessor: LLMProcessor = new GeminiProcessor();