// Enhanced logging utility with environment-based log levels
// Reduces Railway log spam while maintaining error visibility

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error, none

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    none: 4
};

const currentLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.info;

// Color codes for better readability
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    gray: '\x1b[90m'
};

class Logger {
    constructor(module = '') {
        this.module = module;
    }

    debug(...args) {
        if (currentLevel <= LOG_LEVELS.debug) {
            console.log(`${colors.gray}[DEBUG]${this.module ? ` [${this.module}]` : ''}${colors.reset}`, ...args);
        }
    }

    info(...args) {
        if (currentLevel <= LOG_LEVELS.info) {
            console.log(`${colors.blue}[INFO]${this.module ? ` [${this.module}]` : ''}${colors.reset}`, ...args);
        }
    }

    warn(...args) {
        if (currentLevel <= LOG_LEVELS.warn) {
            console.warn(`${colors.yellow}[WARN]${this.module ? ` [${this.module}]` : ''}${colors.reset}`, ...args);
        }
    }

    error(...args) {
        if (currentLevel <= LOG_LEVELS.error) {
            console.error(`${colors.red}[ERROR]${this.module ? ` [${this.module}]` : ''}${colors.reset}`, ...args);
        }
    }

    // Always log critical errors
    critical(...args) {
        console.error(`${colors.red}[CRITICAL]${this.module ? ` [${this.module}]` : ''}${colors.reset}`, ...args);
    }
}

// Create logger instance
export const createLogger = (module) => new Logger(module);

// Default logger
export const logger = new Logger();

// Express middleware for request logging (throttled)
let requestCount = 0;
const REQUEST_LOG_INTERVAL = parseInt(process.env.REQUEST_LOG_INTERVAL) || 10; // Log every Nth request

export const requestLogger = (req, res, next) => {
    requestCount++;
    
    // Only log every Nth request or errors
    if (currentLevel <= LOG_LEVELS.debug || requestCount % REQUEST_LOG_INTERVAL === 0) {
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            const statusColor = res.statusCode >= 400 ? colors.red : 
                               res.statusCode >= 300 ? colors.yellow : colors.reset;
            
            if (currentLevel <= LOG_LEVELS.info) {
                logger.info(`${req.method} ${req.path} ${statusColor}${res.statusCode}${colors.reset} - ${duration}ms`);
            }
        });
    }
    
    next();
};

export default logger;
