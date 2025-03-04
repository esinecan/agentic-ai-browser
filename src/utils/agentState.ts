// Based on Python reference in reference/agent_state.py.txt
import { Page } from 'playwright';

/**
 * Singleton class for managing the agent's state globally
 * Inspired by the Python implementation used in the reference browser automation system
 */
export class AgentState {
  // Singleton instance
  private static _instance: AgentState | null = null;
  
  // State properties
  private _stopRequested: boolean = false;
  private _lastValidState: any = null; // Store the last valid browser state

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Initialize properties if needed
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): AgentState {
    if (!AgentState._instance) {
      AgentState._instance = new AgentState();
    }
    return AgentState._instance;
  }

  /**
   * Request that the agent stop its current operation
   */
  public requestStop(): void {
    this._stopRequested = true;
    console.log("Stop requested by user");
  }

  /**
   * Clear the stop flag and reset state
   */
  public clearStop(): void {
    this._stopRequested = false;
    this._lastValidState = null;
    console.log("Stop flag cleared");
  }

  /**
   * Check if stop has been requested
   */
  public isStopRequested(): boolean {
    return this._stopRequested;
  }

  /**
   * Save the last valid state of the browser
   * @param state The current browser state to save
   */
  public setLastValidState(state: any): void {
    this._lastValidState = state;
  }

  /**
   * Get the last valid browser state
   */
  public getLastValidState(): any {
    return this._lastValidState;
  }
}

// Export a convenient getter for the singleton instance
export const getAgentState = () => AgentState.getInstance();