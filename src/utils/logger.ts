import fs from 'fs';
import path from 'path';
import util from 'util';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create a timestamped log filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
export const logFilePath = path.join(logsDir, `agent-${timestamp}.log`);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Configuration for logging levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
} as const;

type LogLevel = keyof typeof LOG_LEVELS;
let currentLogLevel: number = LOG_LEVELS.DEBUG; // Default log level

// Utility to format objects for logging
function formatData(data: any): string {
  if (!data) return '';
  
  if (typeof data === 'string') return data;
  
  try {
    // Handle Error objects specially
    if (data instanceof Error) {
      return `${data.message}\n${data.stack}`;
    }
    
    // For other objects, use util.inspect for better formatting
    return util.inspect(data, {
      depth: 4,
      colors: false,
      maxArrayLength: 10,
      breakLength: 120
    });
  } catch (err) {
    return String(data);
  }
}

// Main logging function
function log(level: LogLevel, message: string, data?: any) {
  if (LOG_LEVELS[level] < currentLogLevel) return;

  const timestamp = new Date().toISOString();
  const formattedData = data ? '\n' + formatData(data) : '';
  const logMessage = `[${timestamp}] [${level}] ${message}${formattedData}\n`;

  // Write to file
  logStream.write(logMessage);

  // Write to console with colors
  const consoleMsg = `[${timestamp}] ${getColorForLevel(level)}[${level}]\x1b[0m ${message}`;
  if (level === 'ERROR') {
    console.error(consoleMsg, data ? '\n' + formattedData : '');
  } else {
    console.log(consoleMsg, data ? '\n' + formattedData : '');
  }
}

// Get ANSI color code for log level
function getColorForLevel(level: LogLevel): string {
  switch (level) {
    case 'DEBUG': return '\x1b[90m'; // Gray
    case 'INFO': return '\x1b[32m';  // Green
    case 'WARN': return '\x1b[33m';  // Yellow
    case 'ERROR': return '\x1b[31m'; // Red
    default: return '\x1b[0m';       // Reset
  }
}

// Convenience logging methods
export const logger = {
  debug: (msg: string, data?: any) => log('DEBUG', msg, data),
  info: (msg: string, data?: any) => log('INFO', msg, data),
  warn: (msg: string, data?: any) => log('WARN', msg, data),
  error: (msg: string, data?: any) => log('ERROR', msg, data),
  
  // Log state transitions with special formatting
  transition: (state: string, data?: any) => {
    log('INFO', `State Transition: ${state}`, data);
  },
  
  // Log browser actions
  browser: {
    action: (type: string, data: any) => {
      log('INFO', `Browser Action: ${type}`, data);
    },
    error: (type: string, error: any) => {
      log('ERROR', `Browser Error: ${type}`, error);
    }
  },

  // Configuration methods
  setLevel: (level: LogLevel) => {
    currentLogLevel = LOG_LEVELS[level];
    log('INFO', `Log level set to ${level}`);
  },
  
  // Clean up method
  close: () => {
    log('INFO', 'Closing logger');
    logStream.end();
  }
};

// Handle process termination
process.on('exit', () => logger.close());
process.on('SIGINT', () => logger.close());
process.on('SIGTERM', () => logger.close());

// Export the logger instance
export default logger;