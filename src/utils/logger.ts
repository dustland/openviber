/**
 * Structured Logger for OpenViber
 *
 * JSON-lines logger that captures agent ID, task ID, and structured
 * metadata for debugging and analytics. Replaces ad-hoc console.log.
 */

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  msg: string;
  viberId?: string;
  taskId?: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

let minLevel: LogLevel = LogLevel.INFO;

/**
 * Set the minimum log level (default: INFO)
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Create a scoped logger for a specific component.
 *
 * Usage:
 *   const log = createLogger("controller", { viberId: "abc" });
 *   log.info("Connected to hub");
 *   log.error("WebSocket error", { error: err.message });
 */
export function createLogger(
  component: string,
  scope?: { viberId?: string; taskId?: string }
) {
  function emit(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>
  ): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      component,
      msg,
      ...scope,
      ...(data ? { data } : {}),
    };

    const line = JSON.stringify(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(line);
        break;
      case LogLevel.WARN:
        console.warn(line);
        break;
      default:
        console.log(line);
    }
  }

  return {
    debug: (msg: string, data?: Record<string, unknown>) =>
      emit(LogLevel.DEBUG, msg, data),
    info: (msg: string, data?: Record<string, unknown>) =>
      emit(LogLevel.INFO, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) =>
      emit(LogLevel.WARN, msg, data),
    error: (msg: string, data?: Record<string, unknown>) =>
      emit(LogLevel.ERROR, msg, data),

    /** Create a child logger with additional scope */
    child: (childScope: { taskId?: string; viberId?: string }) =>
      createLogger(component, { ...scope, ...childScope }),
  };
}

export type Logger = ReturnType<typeof createLogger>;
