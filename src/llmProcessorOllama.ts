import { ChatOllama } from '@langchain/ollama';
import dotenv from 'dotenv';
import { LLMProcessor } from "./llmProcessor.js";
import { GraphContext } from "./browserExecutor.js";
import { ActionExtractor } from "./actionExtractor.js";
import logger from './utils/logger.js';

dotenv.config();

// Use host.docker.internal to access the host from Docker container
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';

const ollama = new ChatOllama({
  baseUrl: OLLAMA_HOST,
  model: "phi4-mini"
});

class OllamaProcessor implements LLMProcessor {
  private lastContext: number[] | null = null;
  private tokenCount: number = 0;
  private readonly MAX_TOKENS = 3500; // Buffer below 4096 to be safe
  
  // Helper function to build feedback section
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

  // Helper function to truncate text
  private truncate(text: string | undefined, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...[content truncated]';
  }
  
  private logPromptContext(context: Record<string, any>) {
    logger.debug("OLLAMA CONTEXT", context);
  }
  
  async processPrompt(prompt: string): Promise<string> {
    logger.llm.request('Ollama', {
      modelInfo: {
        model: process.env.OLLAMA_MODEL || "phi4-mini",
        contextSize: this.lastContext?.length || 0,
        tokenCount: this.tokenCount
      },
      promptAnalysis: {
        goal: prompt.match(/TASK: (.*?)\n/)?.[1],
        url: prompt.match(/URL: (.*?)\n/)?.[1],
        title: prompt.match(/TITLE: (.*?)\n/)?.[1],
        feedback: prompt.match(/FEEDBACK: (.*?)\n/)?.[1],
        history: prompt.match(/TASK HISTORY:\n([\s\S]*?)$/)?.[1]?.split('\n')
      }
    });

    // Estimate token count (rough approximation)
    const estimatedPromptTokens = Math.ceil(prompt.length / 4);
    this.tokenCount += estimatedPromptTokens;
    
    // Check if we need to reset context
    if (this.tokenCount > this.MAX_TOKENS) {
      logger.info("Token limit reached, resetting context", {
        currentTokens: this.tokenCount,
        limit: this.MAX_TOKENS
      });
      this.lastContext = null;
      this.tokenCount = estimatedPromptTokens;
    }
    
    const options: any = {
      model: process.env.OLLAMA_MODEL || "phi4-mini",
      prompt: prompt,
      stream: false,
      options: {
        num_ctx: 4096,
        temperature: 0.7
      }
    };
    
    // Include context from previous interaction if available
    if (this.lastContext) {
      options.context = this.lastContext;
    }

    try {
      const result = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      
      const response = await result.json();
      
      // Store context for next interaction
      if (response.context) {
        this.lastContext = response.context;
        logger.debug('Updated Ollama context', {
          contextLength: response.context.length
        });
      }

      logger.llm.response('Ollama', {
        responseLength: response.response?.length,
        content: response.response,
        metrics: {
          totalDuration: response.total_duration,
          evalDuration: response.eval_duration,
          evalCount: response.eval_count
        }
      });
      
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

      const prompt = `
You are a web automation assistant helping complete tasks by controlling a browser.

${context.userGoal ? `TASK: ${context.userGoal}` : 'Analyze the page and suggest the next action.'}

${this.buildFeedbackSection(context)}

CURRENT PAGE:
URL: ${(state as any).url}
TITLE: ${(state as any).title}

${context.pageContent ? `PAGE CONTENT:\n${this.truncate(context.pageContent, 6000)}` : ''}

${context.successfulActions && context.successfulActions.length > 0
  ? `SUCCESSFUL ACTIONS ON THIS SITE:\n${context.successfulActions.slice(-3).join('\n')}`
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

Respond with a single JSON object for our next action.
`;
      
      logger.debug('Built Ollama prompt', {
        promptLength: prompt.length,
        hasPageContent: !!context.pageContent,
        hasSuccessfulActions: context.successfulActions?.length ?? 0 > 0,
        feedback: this.buildFeedbackSection(context)
      });

      const responseText = await this.processPrompt(prompt);

      const action = await ActionExtractor.extract(responseText);
      
      logger.info('Action extraction completed', {
        success: !!action,
        action: action,
        responseLength: responseText.length
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
          lastAction: context.action,
          retries: context.retries
        }
      });
      return null;
    }
  }
}

// Export the ollamaProcessor using the same interface as the Gemini processor
export const ollamaProcessor: LLMProcessor = new OllamaProcessor();
