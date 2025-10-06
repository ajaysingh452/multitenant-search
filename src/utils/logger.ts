import pino from 'pino';

// Create logger instance with structured logging
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard'
    }
  },
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res
  },
  base: {
    service: 'search-router',
    version: process.env.npm_package_version || '1.0.0'
  }
});

// Performance-focused child logger for high-frequency events
export const perfLogger = logger.child({ 
  component: 'performance' 
}, { 
  level: 'debug' 
});

// Security logger for audit events
export const auditLogger = logger.child({ 
  component: 'audit' 
}, { 
  level: 'info' 
});

// Error tracking with additional context
export const errorLogger = logger.child({ 
  component: 'error' 
});

// Structured logging helpers
export const loggers = {
  search: (context: Record<string, any>) => logger.child({ component: 'search', ...context }),
  cache: (context: Record<string, any>) => logger.child({ component: 'cache', ...context }),
  tenant: (context: Record<string, any>) => logger.child({ component: 'tenant', ...context }),
  engine: (engine: string, context: Record<string, any>) => 
    logger.child({ component: 'engine', engine, ...context })
};

// Log correlation IDs for distributed tracing
export const withCorrelationId = (correlationId: string) => 
  logger.child({ correlationId });

export default logger;