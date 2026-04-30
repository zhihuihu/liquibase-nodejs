import { Logger } from '../types';

function formatTimestamp(): string {
  return new Date().toISOString();
}

export function createDefaultLogger(): Logger {
  return {
    info(msg, ctx) {
      console.log(`[${formatTimestamp()}] [INFO] ${msg}`, ctx ? JSON.stringify(ctx) : '');
    },
    warn(msg, ctx) {
      console.warn(`[${formatTimestamp()}] [WARN] ${msg}`, ctx ? JSON.stringify(ctx) : '');
    },
    error(msg, ctx) {
      console.error(`[${formatTimestamp()}] [ERROR] ${msg}`, ctx ? JSON.stringify(ctx) : '');
    },
    debug(msg, ctx) {
      console.debug(`[${formatTimestamp()}] [DEBUG] ${msg}`, ctx ? JSON.stringify(ctx) : '');
    },
  };
}
