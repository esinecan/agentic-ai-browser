// src/core/action-handling/ActionExtractor.ts
import { Action, AgentContext } from '../shared/types.js';
import { ActionValidator } from './ActionValidator.js';
import { ElementVerifier } from './ElementVerifier.js';

export class ActionProcessor {
  private validator: ActionValidator;
  private elementVerifier: ElementVerifier;

  constructor(private context: AgentContext) {
    this.validator = new ActionValidator(context);
    this.elementVerifier = new ElementVerifier(context);
  }

  async processRawAction(raw: string): Promise<Action> {
    // List of strategies in order.
    const extractionSteps = [
      this.tryStructuredJson,
      this.extractFromKeyValuePairs,
      this.parseLooseFormat,
      this.fallbackToHuman
    ];

    for (const step of extractionSteps) {
      const result = await step.call(this, raw);
      if (result) {
        try {
          // Validate the action against current state and add defaults.
          const validated = await this.validator.validate(result);
          return validated;
        } catch (e) {
          console.error(`Validation failed for ${step.name}: ${e}`);
          // If validation fails, try the next strategy.
        }
      }
    }
    throw new Error('Action extraction failed for raw input: ' + raw);
  }

  // Strategy 1: Try to parse clean JSON output.
  private async tryStructuredJson(raw: string): Promise<Action | null> {
    try {
      let cleaned = raw.replace(/```json/gi, '').replace(/```/gi, '').trim();
      let parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object' && parsed.type) {
        return parsed as Action;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Strategy 2: Use regex to extract key-value pairs.
  private async extractFromKeyValuePairs(raw: string): Promise<Action | null> {
    const keyValueRegex = /\b(\w+)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|(\S+))/gi;
    let match: RegExpExecArray | null;
    const extracted: any = {};
    while ((match = keyValueRegex.exec(raw)) !== null) {
      const key = match[1].toLowerCase();
      const value = match[2] || match[3] || match[4] || '';
      extracted[key] = value;
    }
    if (extracted && extracted.type) {
      return extracted as Action;
    }
    return null;
  }

  // Strategy 3: Look for common action keywords in a loose format.
  private async parseLooseFormat(raw: string): Promise<Action | null> {
    const actionKeywords = ['click', 'navigate', 'input'];
    for (const keyword of actionKeywords) {
      if (raw.toLowerCase().includes(keyword)) {
        const action: Action = { type: keyword };
        // For navigation, try to extract a URL.
        if (keyword === 'navigate') {
          const urlMatch = raw.match(/https?:\/\/\S+/);
          if (urlMatch) {
            action.value = urlMatch[0];
          }
        }
        // For click/input, try to extract a selector.
        if (keyword === 'click' || keyword === 'input') {
          const selectorMatch = raw.match(/selector\s*[:=]\s*["']([^"']+)["']/i);
          if (selectorMatch) {
            action.selector = selectorMatch[1];
          }
        }
        return action;
      }
    }
    return null;
  }

  // Strategy 4: Fallback – if nothing works, return an askHuman action.
  private async fallbackToHuman(raw: string): Promise<Action | null> {
    return {
      type: 'askHuman',
      value: `Unable to parse action from: ${raw}`
    };
  }
}