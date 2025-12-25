/**
 * Logger utility for the server
 * 
 * Logs to both console and a file in the debug directory.
 * The log file rotates daily.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log file path - in debug directory
const LOG_DIR = path.join(__dirname, '..', 'debug');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

// Ensure debug directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create/clear log file on startup
fs.writeFileSync(LOG_FILE, `=== Server started at ${new Date().toISOString()} ===\n`);

// Stream for appending to log file
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Format a log message with timestamp
 */
function formatMessage(level: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Log to both console and file
 */
export const logger = {
    log(...args: any[]) {
        const formatted = formatMessage('INFO', ...args);
        console.log(...args);
        logStream.write(formatted + '\n');
    },

    info(...args: any[]) {
        const formatted = formatMessage('INFO', ...args);
        console.log(...args);
        logStream.write(formatted + '\n');
    },

    error(...args: any[]) {
        const formatted = formatMessage('ERROR', ...args);
        console.error(...args);
        logStream.write(formatted + '\n');
    },

    warn(...args: any[]) {
        const formatted = formatMessage('WARN', ...args);
        console.warn(...args);
        logStream.write(formatted + '\n');
    },

    debug(...args: any[]) {
        const formatted = formatMessage('DEBUG', ...args);
        console.log(...args);
        logStream.write(formatted + '\n');
    },

    /**
     * Log a separator line for readability
     */
    separator(label?: string) {
        const line = label ? `\n${'='.repeat(20)} ${label} ${'='.repeat(20)}` : '\n' + '='.repeat(60);
        console.log(line);
        logStream.write(line + '\n');
    }
};

// Also capture console.log globally and write to file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function (...args: any[]) {
    originalConsoleLog.apply(console, args);
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    logStream.write(`[${new Date().toISOString()}] ${message}\n`);
};

console.error = function (...args: any[]) {
    originalConsoleError.apply(console, args);
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    logStream.write(`[${new Date().toISOString()}] [ERROR] ${message}\n`);
};

export default logger;
