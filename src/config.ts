import { MigrationConfig, LockConfig } from './types';

export const DEFAULT_LOCK_CONFIG: LockConfig = {
  timeoutMs: 30000,
  pollIntervalMs: 2000,
  staleLockThresholdMs: 300000, // 5 minutes
};

export function resolveConfig(config: MigrationConfig): MigrationConfig & { lock: LockConfig } {
  const resolvedLock: LockConfig = {
    ...DEFAULT_LOCK_CONFIG,
    ...config.lock,
  };

  return {
    ...config,
    basePath: config.basePath || process.cwd(),
    lock: resolvedLock,
  };
}
