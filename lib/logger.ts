/**
 * 环境感知的日志工具
 * 在生产环境自动禁用敏感日志
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
  level: LogLevel;
  enabled: boolean;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private config: LoggerConfig;

  constructor() {
    const isDev = process.env.NODE_ENV !== "production";
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isDev ? "debug" : "warn");

    this.config = {
      level: logLevel,
      enabled: process.env.DISABLE_LOGGING !== "true",
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }

  /**
   * 仅开发环境使用的日志（自动脱敏）
   */
  devLog(message: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") return;

    const sanitized = data ? this.sanitize(data) : undefined;
    console.log(`[DEV] ${message}`, sanitized ? JSON.stringify(sanitized, null, 2) : "");
  }

  /**
   * 脱敏敏感数据
   */
  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ["password", "token", "secret", "accessToken", "authorization"];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
        result[key] = "***REDACTED***";
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

export const logger = new Logger();
