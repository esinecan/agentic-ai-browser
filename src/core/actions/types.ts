/**
 * Represents an action to be performed in the browser
 */
export interface Action {
  type: "input" | "navigate" | "click" | "wait" | "sendHumanMessage" | "notes" | "scroll";
  element?: string;
  value?: string;
  question?: string;
  description?: string;
  selectorType: "css" | "xpath" | "text";
  maxWait: number;
  previousUrl?: string;
  operation?: "add" | "read";
  note?: string;
  direction?: "up" | "down"; // For scroll action
}

/**
 * Result of an action execution
 */
export type ActionResult = 'success' | 'partial' | 'fail';

/**
 * Action history entry
 */
export interface ActionHistoryEntry {
  action: Action;
  result: ActionResult;
  timestamp: number;
}

/**
 * Zod schema for validation (used in browserExecutor.ts)
 * This is kept as a reference, but actual Zod import should be in the implementation file
 */
export const ActionSchemaReference = {
  type: ["click", "input", "navigate", "wait", "sendHumanMessage"],
  element: "string?",
  value: "string?",
  description: "string?",
  selectorType: ["css", "xpath", "text"],
  maxWait: "number",
  question: "string?",
  previousUrl: "string?"
};

