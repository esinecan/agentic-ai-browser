import { ChatOllama } from '@langchain/ollama';
import dotenv from 'dotenv';
import { LLMProcessor } from "./llmProcessor.js";
import { GraphContext } from "./browserExecutor.js";
import { ActionExtractor } from "./core/action-handling/ActionExtractor.js";
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
  private readonly MAX_TOKENS = 8000; 
  
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

  // Helper function to truncate text (modified)
  private truncate(text: string | undefined, maxLength: number): string {
    if (!text) return '';
    // Collapse extra whitespace and trim
    const trimmed = text.trim().replace(/\s+/g, ' ');
    return trimmed.length <= maxLength ? trimmed : trimmed.substring(0, maxLength) + '...[truncated]';
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
    
    // TODO: Implement token limit handling
    if (this.tokenCount > this.MAX_TOKENS && false) {
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

      logger.error('LLM request sent', {
        requestText: prompt,
      });
      
      const response = await result.json();

      logger.error('LLM response received', {
        responseText: response.response
      });
      
      
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
    // Ensure context.pageContent is set from state if undefined
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

      let prompt = `Hi :)
- You're talking to an automated system, that is supervised by a human. 
- The reason this system is sitting between you is, to enable to use a web browser.
- This middleware will be your eyes and hands on the web.
- You can ask the system to click on elements, input text, navigate to a different page, wait for a certain amount of time, or ask for human help. 
- The system will try to understand your request and perform the action on the web page.
---
${context.userGoal ? `YOUR CURRENT TASK: ${context.userGoal}` : 'This is what the browser is currently displaying.'}
---
${this.buildFeedbackSection(context)}
---
THIS IS THE SIMPLIFIED HTML CONTENT OF THE PAGE, IN LIEU OF YOU "SEEING" THE PAGE:
\n ${context.pageContent}
---
THESE ARE ACTIONS AVAILABLE TO YOU:
- Click: { "type": "click", "element": "selector", "description": "description" }
- Input: { "type": "input", "element": "selector", "value": "text" }
- Navigate: { "type": "navigate", "value": "url" }
- Wait: { "type": "wait", "maxWait": milliseconds }
- AskHuman: { "type": "askHuman", "question": "This is your direct line to the human end of this system. Want human to pass a bot check for you? Confused? Saying hi? Succeeded & reporting back? This is the thing to use." }
---
TASK HISTORY:
${context.compressedHistory ? context.compressedHistory.slice(-5).join('\n') : 
  context.history ? context.history.slice(-5).join('\n') : 'No previous actions.'}
---
Respond with a single JSON object for our next action, based on the available actions and your current task.
`;
      // Replace sequences of 2 or more spaces or any tab with a single space:
      prompt = prompt.replace(/[\t ]{2,}/g, ' ');
      
      logger.debug('Built Ollama prompt', {
        promptLength: prompt.length,
        hasPageContent: !!context.pageContent,
        hasSuccessfulActions: context.successfulActions?.length ?? 0 > 0,
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

// Export the ollamaProcessor using the same interface as the Gemini processor
export const ollamaProcessor: LLMProcessor = new OllamaProcessor();
