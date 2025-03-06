// filepath: c:\Users\yepis\dev\agent\agentic-ai-browser\src\actionExtractor.ts
import { Action, ActionSchema } from "./browserExecutor.js";
import logger from './utils/logger.js';

/**
 * Utility class for extracting and normalizing action objects from LLM outputs
 * regardless of format or structure inconsistencies
 */
export class ActionExtractor {
  // Static helper method that uses instance methods internally
  static extract(rawText: string): Action | null {
    try {
      logger.debug("Starting action extraction", { 
        textLength: rawText.length,
        preview: rawText.substring(0, 200)
      });
      const extractor = new ActionExtractor();
      return extractor.processRawAction(rawText);
    } catch (error) {
      logger.error("Action extraction failed", error);
      return null;
    }
  }

  processRawAction(rawText: string): Action | null {
    try {
      const extractors = [
        this.extractFromJson,
        this.extractFromKeyValuePairs,
        this.extractFromLoosePatterns,
        this.parseDeferToHuman
      ];
      
      for (const extractor of extractors) {
        logger.debug(`Attempting extraction with ${extractor.name}`);
        const result = extractor.call(this, rawText);
        
        if (result) {
          const normalized = this.normalizeActionObject(result);
          if (normalized) {
            logger.info(`Action extracted successfully using ${extractor.name}`, {
              method: extractor.name,
              result: normalized
            });
            return normalized;
          }
        }
      }
      
      logger.warn("All extraction methods failed", { 
        textPreview: rawText.substring(0, 300),
        attemptedMethods: extractors.map(e => e.name)
      });
      return null;
      
    } catch (error) {
      logger.error("Action extraction failed", error);
      return null;
    }
  }

  /**
   * Attempts to extract an action from properly formatted JSON
   */
  private extractFromJson(text: string): Action | null {
    try {
      let cleaned = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
      let parsed = JSON.parse(cleaned);
      
      if (parsed && typeof parsed === 'object') {
        logger.debug("JSON extraction succeeded", {
          parsedStructure: parsed
        });
        return parsed as Action;
      }
    } catch (error) {
      // Only log if it looks like it might have been JSON
      if (text.includes('{') && text.includes('}')) {
        logger.debug("JSON parsing failed on potential JSON text", {
          errorMessage: error instanceof Error ? error.message : String(error),
          textPreview: text.substring(0, 100)
        });
      }
    }
    return null;
  }

  /**
   * Extracts key-value pairs using regex patterns to build an action
   */
  private extractFromKeyValuePairs(text: string): Action | null {
    logger.debug("Attempting key-value pair extraction");
    try {
      // Enhanced regex for key-value pairs that explicitly handles quoted and unquoted values
      // Captures: key: "quoted value" or key: 'single quoted' or key: unquoted_value
      const keyValueRegex = /\b(\w+)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^,"\s}]+))/gi;
      let match;
      const extractedPairs: Record<string, string> = {};
      
      // Track if we've found type or action fields
      let typeFound = false;
      let actionFound = false;

      while ((match = keyValueRegex.exec(text)) !== null) {
        const key = match[1].trim().toLowerCase();
        const value = match[2] || match[3] || match[4] || "";
        
        // Give priority to "type" over "action" field
        if (key === "type") {
          extractedPairs[key] = value.trim();
          typeFound = true;
        } 
        // Only use "action" as a fallback if no "type" is found
        else if (key === "action" && !typeFound) {
          // Log a warning but don't store "action" as is - we'll handle it in normalization
          actionFound = true;
          extractedPairs["_action"] = value.trim(); // Store with different key to prevent confusion
        }
        else {
          extractedPairs[key] = value.trim();
        }
      }

      // Ensure we have either a type or action before proceeding
      if (Object.keys(extractedPairs).length === 0 || (!typeFound && !actionFound)) {
        return null;
      }

      // If we found an action but no type, promote action's value to type
      if (!typeFound && actionFound) {
        console.warn("Found 'action' field instead of 'type'. Converting to proper format.");
        extractedPairs["type"] = extractedPairs["_action"];
        delete extractedPairs["_action"];
      }

      // Log only if we found something
      if (Object.keys(extractedPairs).length > 0) {
        logger.debug("Found key-value pairs", {
          pairs: extractedPairs,
          typeField: typeFound ? "Found type field" : "Using action field",
          actionField: actionFound
        });
      }

      return this.normalizeActionObject(extractedPairs);
    } catch (error) {
      logger.error("Key-value extraction failed", error);
      return null;
    }
  }

  /**
   * Last resort extraction for very loosely formatted texts
   */
  private extractFromLoosePatterns(text: string): Action | null {
    try {
      // Look for common action words
      const actionTypes = ["click", "input", "navigate", "scroll", "extract", "wait", "askHuman", "askhuman", "ask_human", "ask"];
      
      logger.debug("Searching for action patterns", {
        textLength: text.length,
        actionTypesSearched: actionTypes
      });

      let actionType: string | null = null;
      
      // Find the first mention of an action type
      for (const type of actionTypes) {
        // More specific regex to avoid false positives - require it to be a word boundary or near special characters
        const regex = new RegExp(`(\\b|action|type)[\\s:"']*${type}\\b`, 'i');
        if (regex.test(text)) {
          // Map variations to the canonical action type
          if (type === "askhuman" || type === "ask_human" || type === "ask") {
            actionType = "askHuman";
          } else {
            actionType = type;
          }
          break;
        }
      }
      
      if (!actionType) return null;
      
      // Try to find element mentions
      let element: string | null = null;
      const elementMatch = text.match(/element[:\s]+["']?([^"'\n,}]+)["']?/i) ||
                          text.match(/selector[:\s]+["']?([^"'\n,}]+)["']?/i);
      
      if (elementMatch) {
        element = elementMatch[1].trim();
      }
      
      // Try to find value mentions
      let value: string | null = null;
      const valueMatch = text.match(/value[:\s]+["']?([^"'\n,}]+)["']?/i) ||
                         text.match(/text[:\s]+["']?([^"'\n,}]+)["']?/i);
      
      if (valueMatch) {
        value = valueMatch[1].trim();
      }
      
      // Try to find question for askHuman action
      let question: string | null = null;
      if (actionType === "askHuman") {
        const questionMatch = text.match(/question[:\s]+["']?([^"'\n,}]+)["']?/i) ||
                             text.match(/ask[:\s]+["']?([^"'\n,}]+)["']?/i) ||
                             text.match(/help[:\s]+["']?([^"'\n,}]+)["']?/i);
        
        if (questionMatch) {
          question = questionMatch[1].trim();
        } else {
          // Default question if none is specified
          question = "What should I do next?";
        }
      }
      
      // Build a basic action object
      const action: Partial<Action> = {
        type: actionType as any
      };
      
      if (element) action.element = element;
      if (value) action.value = value;
      if (question) action.question = question;
      
      logger.debug("Found action pattern", {
        type: actionType,
        element,
        value,
        question
      });

      // Try to validate it
      return this.normalizeActionObject(action);
    } catch (error) {
      logger.error("Pattern extraction failed", error);
      return null;
    }
  }

  private parseDeferToHuman(text: string): Action | null {
    const needsHelpIndicators = [
      'need help',
      'ask human',
      'confused',
      'not sure',
      'unclear',
      'uncertain',
      'help required',
      'assistance needed'
    ];

    const matchingIndicators = needsHelpIndicators.filter(indicator => 
      text.toLowerCase().includes(indicator)
    );

    if (matchingIndicators.length > 0) {
      const question = text.length > 200 ? text.substring(0, 200) + "..." : text;
      
      logger.debug("Converting to askHuman due to help indicators", {
        matchedPhrases: matchingIndicators,
        questionPreview: question
      });
      
      return {
        type: 'askHuman',
        question,
        selectorType: 'css',
        maxWait: 5000
      };
    }
    return null;
  }

  /**
   * Normalizes any action-like object to conform to the Action schema
   */
  private normalizeActionObject(obj: any): Action | null {
    logger.debug("Normalizing action", obj);

    if (!obj) return null;
    
    try {
      // Create a new object to hold normalized values
      const normalized: Partial<Action> = {};
      
      // Handle nested 'action' property (e.g. { "action": { "type": "wait", ... } })
      if (obj.action && typeof obj.action === 'object') {
        console.warn("Found nested 'action' object instead of 'type' field. Converting to proper format.");
        obj = { ...obj.action };
      }
      
      // Handle case where 'action' field is used instead of 'type'
      // VERY IMPORTANT: The action field value should be used as the type, not the string 'action'
      if (obj.action && typeof obj.action === 'string' && !obj.type) {
        console.warn(`Found 'action: ${obj.action}' instead of 'type: ${obj.action}'. Converting to proper format.`);
        obj.type = obj.action.toLowerCase();
      }
      
      // Special handling for "nextAction" field (seen in some responses)
      if (obj.nextAction && typeof obj.nextAction === 'object') {
        console.warn("Found 'nextAction' object. Converting to proper format.");
        obj = { ...obj.nextAction };
      }
      
      // Make type lowercase if it exists
      if (typeof obj.type === 'string') {
        normalized.type = obj.type.toLowerCase() as any;

        // Normalize askHuman variations
        if (["askhuman", "ask_human", "ask"].includes(normalized.type as string)) {
          normalized.type = "askHuman";
        }
      }
      
      // Copy over other common properties
      if (obj.element) normalized.element = obj.element;
      if (obj.value) normalized.value = obj.value;
      if (obj.description) normalized.description = obj.description;
      if (obj.selectorType) normalized.selectorType = obj.selectorType.toLowerCase();
      if (obj.maxWait || obj.maxwait) normalized.maxWait = parseInt(obj.maxWait || obj.maxwait) || 5000;
      
      // Handle askHuman question field
      if (obj.question) normalized.question = obj.question;
      
      // If it's an askHuman action but no question was provided, add a default one
      if (normalized.type === 'askHuman' && !normalized.question) {
        normalized.question = "What should I do next?";
      }
      
      // Fix overly specific selectors or the literal 'selector' string
      if (normalized.element === 'selector') {
        if (normalized.type === 'input') {
          normalized.element = 'input[type=text]';
        } else if (normalized.type === 'click') {
          normalized.element = normalized.value ? `a:contains("${normalized.value}")` : 'button';
        }
      }
      
      // Ensure required fields exist for each action type
      if (!normalized.type) {
        console.warn("No action type found in response");
        return null;
      }
      
      // CRITICAL FIX: Make sure we never pass "action" as the type itself
      // Use type assertion to avoid TypeScript error since we're validating at runtime
      const typeStr = String(normalized.type).toLowerCase();
      if (typeStr === 'action') {
        console.warn("Invalid type 'action' detected, trying to infer actual type");
        // Try to determine what the real type should be based on properties
        if (normalized.value && normalized.element) {
          normalized.type = 'input';
        } else if (normalized.element) {
          normalized.type = 'click';
        } else if (normalized.value && normalized.value.match(/^https?:\/\//)) {
          normalized.type = 'navigate';
        } else if (normalized.question) {
          normalized.type = 'askHuman';
        } else {
          console.error("Could not infer actual type from 'action'");
          return null;
        }
      }
      
      // Special handling for repeated failures - suggest human help
      if (obj._suggestHumanHelp) {
        console.warn("Converting action to askHuman due to repeated failures");
        const originalType = normalized.type;
        normalized.type = 'askHuman';
        normalized.question = `I'm having trouble ${originalType === 'click' ? 'clicking' : 'entering text into'} the element "${normalized.element}". What should I do instead?`;
      }
      
      // Add default values
      normalized.selectorType = normalized.selectorType || 'css';
      normalized.maxWait = normalized.maxWait || 5000;
      
      // Check required fields based on action type
      if ((normalized.type === 'click' || normalized.type === 'input') && !normalized.element) {
        // For click/input actions with missing elements, use reasonable defaults
        normalized.element = normalized.type === 'input' ? 'input[type=text]' : 'button';
        console.warn(`Missing element for ${normalized.type} action, using default: ${normalized.element}`);
      }
      
      if (normalized.type === 'input' && !normalized.value) {
        console.warn("Missing value for input action");
        // Don't fail, just warn. LLM might fix this in next iteration.
      }
      
      if (normalized.type === 'navigate' && !normalized.value) {
        console.warn("Missing URL for navigate action");
        return null; // This one's essential - can't navigate to nowhere
      }
      
      // Debug action before validation
      logger.debug("Normalized action before validation", normalized);
      
      // Validate with Zod schema
      const result = ActionSchema.safeParse(normalized);
      if (result.success) {
        logger.info("Action validation passed", result.data);
        return result.data;
      } else {
        logger.error("Action validation failed", {
          errors: result.error.issues,
          failedObject: normalized
        });
      }
      
      return null;
    } catch (error) {
      logger.error("Action normalization failed", error);
      return null;
    }
  }
}