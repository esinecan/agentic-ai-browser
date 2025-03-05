// src/core/examples/stateMachineDemo.ts
import { AgentStateMachine } from '../state-management/StateMachine.js';
import { AgentContext } from '../shared/types.js';

/**
 * Simple demonstration of the AgentStateMachine
 */
async function runStateMachineDemo() {
  console.log('Starting Agent State Machine Demo');
  
  // Define initial context with minimal configuration
  const initialContext: Partial<AgentContext> = {
    persistence: {
      sessionId: 'demo-session',
      storageKey: 'demo_agent_context',
      autoSaveInterval: 5000
    },
    llmSessionState: {
      model: 'demo-model',
      temperature: 0.7,
      retryCount: 0
    }
  };

  // Instantiate the state machine with our initial context
  const stateMachine = new AgentStateMachine(initialContext);
  
  // Start the state machine from the initialize state
  try {
    await stateMachine.transition('initialize');
    console.log('State machine execution completed successfully');
    
    // Display the final context state
    console.log('Final context:', JSON.stringify(stateMachine.context, null, 2));
  } catch (error) {
    console.error('State machine execution failed:', error);
  }
}

// Execute the demo when this script is run directly
if (require.main === module) {
  runStateMachineDemo().catch(console.error);
}

export { runStateMachineDemo };