import { GraphContext } from "../../browserExecutor.js";

export interface LLMProcessor {
    /**
     * Generates the next action based on the page state and execution context.
     * @param state - The current page state.
     * @param context - The execution context containing history and possibly retries.
     * @returns A Promise that resolves to an action object or null.
     */
    generateNextAction(state: object, context: GraphContext): Promise<GraphContext["action"] | null>;
}