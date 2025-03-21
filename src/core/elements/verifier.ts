import { AgentContext } from '../shared/types.js';

export class ElementVerifier {
  constructor(private context: AgentContext) {}

  // Verify if a given selector exists within the current state's interactive elements.
  async verify(selector: string | undefined, selectorType: string = 'css'): Promise<boolean> {
    if (!selector) return false;
    const available = this.context.currentState.interactiveElements;
    if (available.includes(selector)) {
      return true;
    }
    // Fuzzy fallback: if any available element contains the selector as a substring.
    const fuzzyMatch = available.find(el => el.includes(selector));
    return Boolean(fuzzyMatch);
  }
}
