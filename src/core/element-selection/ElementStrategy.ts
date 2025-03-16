import { Page, ElementHandle } from "playwright";
import { Action } from "../../browserExecutor.js";

export interface ElementContext {
  previousAttempts: string[];
  startTime: number;
  timeoutPerStrategy: number;
  lastError?: Error;
}

export interface ElementStrategy {
  name: string;
  priority: number;
  canHandle(page: Page, action: Action, context: ElementContext): Promise<boolean>;
  findElement(page: Page, action: Action, context: ElementContext): Promise<ElementHandle | null>;
}
