import fs from 'fs';
import path from 'path';
import { format } from 'util';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create a timestamped log filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFilePath = path.join(logsDir, `agent-${timestamp}.log`);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

// Override console methods to write to both console and file
console.log = function (...args: any[]) {
  const formattedMessage = format(...args);
  logStream.write(`[LOG] ${formattedMessage}\n`);
  originalConsole.log(...args);
};

console.error = function (...args: any[]) {
  const formattedMessage = format(...args);
  logStream.write(`[ERROR] ${formattedMessage}\n`);
  originalConsole.error(...args);
};

console.warn = function (...args: any[]) {
  const formattedMessage = format(...args);
  logStream.write(`[WARN] ${formattedMessage}\n`);
  originalConsole.warn(...args);
};

console.info = function (...args: any[]) {
  const formattedMessage = format(...args);
  logStream.write(`[INFO] ${formattedMessage}\n`);
  originalConsole.info(...args);
};

console.debug = function (...args: any[]) {
  const formattedMessage = format(...args);
  logStream.write(`[DEBUG] ${formattedMessage}\n`);
  originalConsole.debug(...args);
};

// Add timestamp to logs
const addTimestamp = () => {
  return `[${new Date().toISOString()}]`;
};

// Add a close method to properly close the log file
export function closeLogger(): boolean {
  console.log(`${addTimestamp()} Closing log file: ${logFilePath}`);
  logStream.end();
  return true;
}

console.log(`${addTimestamp()} Logging started. Output saved to: ${logFilePath}`);

export { logFilePath };