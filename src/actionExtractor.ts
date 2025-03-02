// filepath: c:\Users\yepis\dev\agent\agentic-ai-browser\src\actionExtractor.ts
import { Action, ActionSchema } from "./browserExecutor.js";

/**
 * Utility class for extracting and normalizing action objects from LLM outputs
 * regardless of format or structure inconsistencies
 */
export class ActionExtractor {

  /**
   * Attempts to extract a valid action object from LLM text output using multiple strategies
   * 
   * @param rawText - The raw text from LLM response
   * @returns A valid Action object or null if extraction failed
   */
  static extract(rawText: string): Action | null {
    try {
      // Try multiple extraction strategies in order of reliability
      const result = 
        this.extractFromJson(rawText) || 
        this.extractFromKeyValuePairs(rawText) ||
        this.extractFromLoosePatterns(rawText);
      
      if (!result) {
        console.debug("All extraction methods failed for text:", rawText.substring(0, 200) + (rawText.length > 200 ? "...": ""));
      }
      
      return result;
    } catch (error) {
      console.error("Action extraction failed:", error);
      return null;
    }
  }

  /**
   * Attempts to extract an action from properly formatted JSON
   */
  private static extractFromJson(text: string): Action | null {
    try {
      // First try: direct parsing if it's clean JSON already
      let json: any;
      
      try {
        json = JSON.parse(text);
      } catch (e) {
        // Clean up markdown code blocks and try again
        const cleaned = text.replace(/```json/gi, "").replace(/```/gi, "").trim();
        
        try {
          json = JSON.parse(cleaned);
        } catch (e) {
          // Find content between curly braces - common LLM output pattern
          const jsonMatch = text.match(/{[\s\S]*?}/);
          if (jsonMatch) {
            try {
              json = JSON.parse(jsonMatch[0]);
            } catch (e) {
              // Even the extracted object isn't valid JSON
              // Try to fix truncated JSON - common with LLMs
              let extracted = jsonMatch[0];
              
              // If JSON appears to be truncated (no closing brace)
              if (!extracted.endsWith("}")) {
                extracted += "}";
              }
              
              // Check for unclosed quotes in property values
              const fixedJson = extracted.replace(/([^"\\])"([^"]*?)$/g, '$1"$2"');
              
              try {
                json = JSON.parse(fixedJson);
              } catch (e) {
                // Still couldn't parse
                return null;
              }
            }
          }
        }
      }

      if (!json) return null;
      
      return this.normalizeActionObject(json);
    } catch (error) {
      console.error("JSON extraction failed:", error);
      return null;
    }
  }

  /**
   * Extracts key-value pairs using regex patterns to build an action
   */
  private static extractFromKeyValuePairs(text: string): Action | null {
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

      return this.normalizeActionObject(extractedPairs);
    } catch (error) {
      console.error("Key-value extraction failed:", error);
      return null;
    }
  }

  /**
   * Last resort extraction for very loosely formatted texts
   */
  private static extractFromLoosePatterns(text: string): Action | null {
    try {
      // Look for common action words
      const actionTypes = ["click", "input", "navigate", "scroll", "extract", "wait", "askHuman", "askhuman", "ask_human", "ask"];
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
      
      // Try to validate it
      return this.normalizeActionObject(action);
    } catch (error) {
      console.error("Loose pattern extraction failed:", error);
      return null;
    }
  }

  /**
   * Normalizes any action-like object to conform to the Action schema
   */
  private static normalizeActionObject(obj: any): Action | null {
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
      console.debug("Action before validation:", normalized);
      
      // Validate with Zod schema
      const result = ActionSchema.safeParse(normalized);
      if (result.success) {
        return result.data;
      } else {
        console.error("Action validation failed:", JSON.stringify(result.error.issues, null, 2));
        console.error("Failed object:", JSON.stringify(normalized, null, 2));
      }
      
      return null;
    } catch (error) {
      console.error("Action normalization failed:", error);
      return null;
    }
  }
}