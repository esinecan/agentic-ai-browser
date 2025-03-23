import fs from 'fs/promises';
import path from 'path';
import logger from '../../utils/logger.js';

// Define the interface for user-defined functions
export interface UserFunction {
  name: string;
  args: string[];
  prompt: string;
}

// Cache for loaded functions
let loadedFunctions: UserFunction[] | null = null;

/**
 * Loads user-defined functions from JSON file
 */
export async function loadUserFunctions(): Promise<UserFunction[]> {
  if (loadedFunctions) return loadedFunctions;
  
  try {
    // Use environment variable if available, otherwise use default path
    const functionPath = process.env.USER_FUNCTIONS_PATH || 
      path.resolve(process.cwd(), 'user-defined-functions.json');
    
    const data = await fs.readFile(functionPath, 'utf-8');
    const functions: any[] = JSON.parse(data);
    
    // Validate function definitions
    const validatedFunctions = validateFunctionDefinitions(functions);
    loadedFunctions = validatedFunctions;
    
    logger.info('Loaded user-defined functions', {
      count: validatedFunctions.length,
      names: validatedFunctions.map(f => f.name)
    });
    
    return validatedFunctions;
  } catch (error) {
    logger.warn('Failed to load user-defined functions', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Return empty array if file doesn't exist or has errors
    return [];
  }
}

/**
 * Validates function definitions for required properties and correct format
 */
function validateFunctionDefinitions(functions: any[]): UserFunction[] {
  return functions.filter(func => {
    // Check required properties
    if (!func.name || !func.args || !func.prompt) {
      logger.warn('Invalid function definition - missing required properties', {
        function: func.name || 'unnamed'
      });
      return false;
    }
    
    // Validate name format
    if (!/^[a-zA-Z0-9_]+$/.test(func.name)) {
      logger.warn('Invalid function name - must contain only letters, numbers, and underscores', {
        function: func.name
      });
      return false;
    }
    
    // Validate args is array
    if (!Array.isArray(func.args)) {
      logger.warn('Invalid function args - must be an array', {
        function: func.name
      });
      return false;
    }
    
    // Validate arg names
    for (const arg of func.args) {
      if (typeof arg !== 'string' || !/^[a-zA-Z0-9_]+$/.test(arg)) {
        logger.warn('Invalid argument name - must contain only letters, numbers, and underscores', {
          function: func.name,
          argument: arg
        });
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Parses a function call string and returns the function name and arguments
 * Format: ::functionName("arg1", "arg2", ...)
 */
export function parseFunctionCall(input: string): { name: string, args: string[] } | null {
  // Regex to match ::functionName("arg1", "arg2", ...)
  const functionCallRegex = /^::([a-zA-Z0-9_]+)\((.*)\)$/;
  const match = input.trim().match(functionCallRegex);
  
  if (!match) return null;
  
  const name = match[1];
  const argsString = match[2];
  
  // Parse arguments - handling both quoted and unquoted args
  const args: string[] = [];
  let currentArg = '';
  let inQuotes = false;
  let escaping = false;
  
  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];
    
    if (escaping) {
      currentArg += char;
      escaping = false;
      continue;
    }
    
    if (char === '\\') {
      escaping = true;
      continue;
    }
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
      continue;
    }
    
    if (char === '"' && inQuotes) {
      inQuotes = false;
      continue;
    }
    
    if (char === ',' && !inQuotes) {
      args.push(currentArg.trim());
      currentArg = '';
      continue;
    }
    
    currentArg += char;
  }
  
  // Add the last argument
  if (currentArg.trim()) {
    args.push(currentArg.trim());
  }
  
  return { name, args };
}

/**
 * Attempts to process a potential function call, returning the expanded prompt if successful
 */
export async function processFunctionCall(input: string): Promise<string | null> {
  // Skip processing if not a function call
  if (!input.trim().startsWith('::')) return null;
  
  const parsedCall = parseFunctionCall(input);
  if (!parsedCall) return null;
  
  const { name, args } = parsedCall;
  const functions = await loadUserFunctions();
  
  // Find the matching function
  const matchedFunction = functions.find(f => f.name === name);
  if (!matchedFunction) {
    logger.warn('Unknown user function referenced', { name });
    return null;
  }
  
  // Validate argument count
  if (args.length !== matchedFunction.args.length) {
    logger.warn('Incorrect argument count for function', { 
      function: name, 
      expected: matchedFunction.args.length, 
      received: args.length 
    });
    return null;
  }
  
  // Interpolate arguments into the prompt template
  let expandedPrompt = matchedFunction.prompt;
  for (let i = 0; i < matchedFunction.args.length; i++) {
    const paramName = matchedFunction.args[i];
    const paramValue = args[i];
    expandedPrompt = expandedPrompt.replace(new RegExp(`\\$\\{${paramName}\\}`, 'g'), paramValue);
  }
  
  logger.info('Expanded user function call', {
    function: name,
    originalLength: input.length,
    expandedLength: expandedPrompt.length
  });
  
  return expandedPrompt;
}

/**
 * Checks if input is a user function call
 */
export function isUserFunctionCall(input: string): boolean {
  return input.trim().startsWith('::') && /^::([a-zA-Z0-9_]+)\(.*\)$/.test(input.trim());
}

/**
 * Checks if input is a request to list available functions
 */
export function isListFunctionsRequest(input: string): boolean {
  return input.trim().toLowerCase() === '::help' || 
         input.trim().toLowerCase() === '::functions' || 
         input.trim().toLowerCase() === '::list';
}

/**
 * Lists all available user functions with their descriptions
 */
export async function listAvailableFunctions(): Promise<string> {
  const functions = await loadUserFunctions();
  if (functions.length === 0) {
    return "No user-defined functions are available.";
  }
  
  return functions.map(func => {
    const argsDisplay = func.args.map(arg => `<${arg}>`).join(', ');
    const promptPreview = func.prompt.substring(0, 100) + (func.prompt.length > 100 ? '...' : '');
    return `::${func.name}(${argsDisplay})\n  - ${promptPreview}`;
  }).join('\n\n');
}
