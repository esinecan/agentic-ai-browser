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
      return (
        this.extractFromJson(rawText) || 
        this.extractFromKeyValuePairs(rawText) ||
        this.extractFromLoosePatterns(rawText)
      );
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
      
      // Flag to track if we've already found an action (to preserve the first valid one)
      let actionFound = false;

      while ((match = keyValueRegex.exec(text)) !== null) {
        const key = match[1].trim().toLowerCase();
        
        // If action is already found, skip further action keys to preserve the first one
        if (key === "action" && actionFound) continue;
        if (key === "action") actionFound = true;
        
        // Get the value from whichever capturing group matched (quoted or unquoted)
        const value = match[2] || match[3] || match[4] || "";
        extractedPairs[key] = value.trim();
      }

      // Ensure we have a valid action before proceeding
      if (Object.keys(extractedPairs).length === 0 || (!extractedPairs["action"] && !extractedPairs["type"])) {
        return null;
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
      const actionTypes = ["click", "input", "navigate", "scroll", "extract", "wait"];
      let actionType: string | null = null;
      
      // Find the first mention of an action type
      for (const type of actionTypes) {
        // More specific regex to avoid false positives - require it to be a word boundary or near special characters
        const regex = new RegExp(`(\\b|action|type)[\\s:"']*${type}\\b`, 'i');
        if (regex.test(text)) {
          actionType = type;
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
      
      // Build a basic action object
      const action: Partial<Action> = {
        type: actionType as any
      };
      
      if (element) action.element = element;
      if (value) action.value = value;
      
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
        obj = { ...obj.action };
      }
      // Handle case where 'action' field is used instead of 'type'
      else if (obj.action && typeof obj.action === 'string' && !obj.type) {
        obj.type = obj.action;
      }
      
      // Special handling for "nextAction" field (seen in some responses)
      if (obj.nextAction && typeof obj.nextAction === 'object') {
        obj = { ...obj.nextAction };
      }
      
      // Make type lowercase if it exists
      if (typeof obj.type === 'string') {
        normalized.type = obj.type.toLowerCase() as any;
      }
      
      // Copy over other common properties
      if (obj.element) normalized.element = obj.element;
      if (obj.value) normalized.value = obj.value;
      if (obj.description) normalized.description = obj.description;
      if (obj.selectorType) normalized.selectorType = obj.selectorType;
      if (obj.maxWait || obj.maxwait) normalized.maxWait = parseInt(obj.maxWait || obj.maxwait) || 5000;
      
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
      
      // Validate with Zod schema
      const result = ActionSchema.safeParse(normalized);
      if (result.success) {
        return result.data;
      } else {
        console.error("Action validation failed:", result.error);
      }
      
      return null;
    } catch (error) {
      console.error("Action normalization failed:", error);
      return null;
    }
  }
}