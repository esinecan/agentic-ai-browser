import cssesc from 'cssesc';
import { Action } from "./types.js";
import { ActionValidator } from "./validator.js";
import { ElementVerifier } from "../elements/verifier.js";
import { AgentContext } from '../shared/types.js';
import logger from '../../utils/logger.js';

export class ActionExtractor {
  private validator: ActionValidator;
  private elementVerifier: ElementVerifier;

  constructor(private context?: AgentContext) {
    if (context) {
      this.validator = new ActionValidator(context);
      this.elementVerifier = new ElementVerifier(context);
    } else {
      this.validator = new ActionValidator({} as AgentContext);
      this.elementVerifier = new ElementVerifier({} as AgentContext);
    }
  }

  static extract(rawText: string): Action | null {
    try {
      logger.debug("Starting action extraction", { textLength: rawText.length, preview: rawText.substring(0, 200) });
      const extractor = new ActionExtractor();
      return extractor.processRawAction(rawText);
    } catch (error) {
      logger.error("Action extraction failed", error);
      return null;
    }
  }

  processRawAction(rawText: string): Action | null {
    // Handle empty input explicitly before attempting parsing
    if (!rawText || rawText.trim().length === 0) {
      return null;
    }
    
    try {
      // First try direct JSON parsing
      const parsedAction = JSON.parse(rawText);

      // Normalize click action: if no element is provided and value starts with "a."
      if (parsedAction.type?.toLowerCase() === 'click') {
        if (!parsedAction.element && parsedAction.value && parsedAction.value.startsWith('a.')) {
          // Strip off "a."
          const rawUrl = parsedAction.value.substring(2).trim();
          
          // Build a CSS selector for the anchor 
          const safeHref = cssesc(rawUrl, { isIdentifier: false });
          parsedAction.element = `a[href="${safeHref}"]`;
          parsedAction.description = parsedAction.value;
          delete parsedAction.value;
        }
      }

      // Apply normalization to ensure all required fields have values
      return this.normalizeActionObject(parsedAction);
    } catch (error) {
      // If direct JSON parsing fails, try other extraction methods
      logger.debug("JSON parsing failed, trying alternative extraction methods");
      
      // Try extracting JSON from text
      const jsonAction = this.extractFromJson(rawText);
      if (jsonAction) return jsonAction;
      
      // Try extracting from key-value pairs
      const kvAction = this.extractFromKeyValuePairs(rawText);
      if (kvAction) return kvAction;
      
      // Try extracting from loose patterns
      const patternAction = this.extractFromLoosePatterns(rawText);
      if (patternAction) return patternAction;
      
      // Check if we should defer to human
      const deferAction = this.parseDeferToHuman(rawText);
      if (deferAction) return deferAction;
      
      // Don't log errors during tests - only log at debug level
      logger.debug("Failed to parse action from raw output: " + rawText + "\n", error);
      return null;
    }
  }

  private extractFromJson(text: string): Action | null {
    const jsonRegex = /{[\s\S]*?}/g;
    let match: RegExpExecArray | null;

    while ((match = jsonRegex.exec(text)) !== null) {
      const jsonCandidate = match[0];

      try {
        const parsed = JSON.parse(jsonCandidate);
        if (parsed && typeof parsed === 'object') {
          logger.debug("JSON extraction succeeded", { parsedStructure: parsed });
          // !IMPORTANT! Apply normalization to ensure property consistency
          return this.normalizeActionObject(parsed);
        }
      } catch (error) {
        logger.debug("JSON parsing failed for candidate", { 
          errorMessage: error instanceof Error ? error.message : String(error), 
          candidate: jsonCandidate.substring(0, 100) 
        });
      }
    }

    logger.debug("No valid JSON found in input.");
    return null;
  }

  private extractFromKeyValuePairs(text: string): Action | null {
    logger.debug("Attempting key-value pair extraction");
    try {
      const keyValueRegex = /\b(\w+)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^,"\s}]+))/gi;
      let match;
      const extractedPairs: Record<string, string> = {};
      let typeFound = false;
      let actionFound = false;

      while ((match = keyValueRegex.exec(text)) !== null) {
        const key = match[1].trim().toLowerCase();
        const value = match[2] || match[3] || match[4] || "";

        if (key === "type") {
          extractedPairs[key] = value.trim();
          typeFound = true;
        } else if (key === "action" && !typeFound) {
          actionFound = true;
          extractedPairs["_action"] = value.trim();
        } else {
          extractedPairs[key] = value.trim();
        }
      }

      if (Object.keys(extractedPairs).length === 0 || (!typeFound && !actionFound)) {
        return null;
      }

      if (!typeFound && actionFound) {
        extractedPairs["type"] = extractedPairs["_action"];
        delete extractedPairs["_action"];
      }

      return this.normalizeActionObject(extractedPairs);
    } catch (error) {
      logger.error("Key-value extraction failed", error);
      return null;
    }
  }

  private extractFromLoosePatterns(text: string): Action | null {
    try {
      const actionTypes = ["click", "input", "navigate", "scroll", "extract", "wait", "sendHumanMessage", "sendhumanmessage", "ask_human", "ask", "notes"];
      let actionType: string | null = null;

      for (const type of actionTypes) {
        const regex = new RegExp(`(\b|action|type)[\s:"']*${type}\b`, 'i');
        if (regex.test(text)) {
          actionType = type === "sendhumanmessage" || type === "ask_human" || type === "ask" ? "sendHumanMessage" : type;
          break;
        }
      }

      if (!actionType) return null;

      // For scroll actions, detect direction
      let direction: string | null = null;
      if (actionType === "scroll") {
        if (text.toLowerCase().includes("scroll down") || text.toLowerCase().includes("direction down")) {
          direction = "down";
        } else if (text.toLowerCase().includes("scroll up") || text.toLowerCase().includes("direction up")) {
          direction = "up";
        } else {
          direction = "down"; // default direction
        }
      }

      let element: string | null = null;
      const elementMatch = text.match(/element[:\s]+["']?([^"'\n,}]+)["']?/i) ||
                          text.match(/selector[:\s]+["']?([^"'\n,}]+)["']?/i);
      if (elementMatch) element = elementMatch[1].trim();

      let value: string | null = null;
      const valueMatch = text.match(/value[:\s]+["']?([^"'\n,}]+)["']?/i) ||
                         text.match(/text[:\s]+["']?([^"'\n,}]+)["']?/i);
      if (valueMatch) value = valueMatch[1].trim();

      let question: string | null = null;
      if (actionType === "sendHumanMessage") {
        const questionMatch = text.match(/question[:\s]+["']?([^"'\n,}]+)["']?/i);
        question = questionMatch ? questionMatch[1].trim() : "What should I do next?";
      }

      const action: Partial<Action> = { type: actionType as any };
      if (element !== undefined) (action as any).element = element;
      if (question !== undefined) (action as any).value = question;
      if (direction !== null) (action as any).direction = direction;

      return this.normalizeActionObject(action);
    } catch (error) {
      logger.error("Pattern extraction failed", error);
      return null;
    }
  }

  private parseDeferToHuman(text: string): Action | null {
    const needsHelpIndicators = ['need help', 'ask human', 'confused', 'not sure', 'unclear', 'uncertain', 'help required', 'assistance needed'];
    const matchingIndicators = needsHelpIndicators.filter(indicator => text.toLowerCase().includes(indicator));

    if (matchingIndicators.length > 0) {
      const question = text.length > 200 ? text.substring(0, 200) + "..." : text;
      logger.debug("Converting to sendHumanMessage due to help indicators", { matchedPhrases: matchingIndicators, questionPreview: question });

      return { type: 'sendHumanMessage', question, selectorType: 'css', maxWait: 1000 };
    }
    return null;
  }
  
  private normalizeActionObject(obj: any): Action {
    return {
        type: obj.type as "input" | "navigate" | "click" | "wait" | "sendHumanMessage" | "notes" | "scroll",
        element: obj.element || obj.selector, // Prioritize element, fall back to selector
        value: obj.value,
        description: obj.description,
        question: obj.question,
        previousUrl: obj.previousUrl,
        selectorType: obj.selectorType || "css",
        maxWait: obj.maxWait ?? 5000,
        operation: obj.operation,
        note: obj.note,
        direction: obj.direction as "up" | "down" | undefined
    };
  }
}
