import { DatabaseClient, LockConfig, Logger, DialectName } from '../types';

export interface LockAcquireResult {
  acquired: boolean;
  reason?: string;
  staleLockCleared?: boolean;
}

export class LockManager {
  private client: DatabaseClient;
  private config: LockConfig;
  private dialect: DialectName;
  private getLockedBy: () => string;
  private logger?: Logger;

  constructor(
    client: DatabaseClient,
    config: LockConfig,
    dialect: DialectName,
    getLockedBy: () => string,
    logger?: Logger,
  ) {
    this.client = client;
    this.config = config;
    this.dialect = dialect;
    this.getLockedBy = getLockedBy;
    this.logger = logger;
  }

  async acquire(): Promise<LockAcquireResult> {
    const startTime = Date.now();
    let staleLockCleared = false;

    while (Date.now() - startTime < this.config.timeoutMs) {
      const checkResult = await this.client.query(
        `SELECT LOCKED, LOCKGRANTED, LOCKEDBY FROM DATABASECHANGELOGLOCK WHERE ID = 1`,
      );

      if (checkResult.rows.length === 0) {
        this.logger?.error('Lock table not initialized');
        return { acquired: false, reason: 'lock-table-not-initialized' };
      }

      const row = checkResult.rows[0] as any;
      const isLocked = row.LOCKED === true || row.LOCKED === 1;

      if (!isLocked) {
        const lockedBy = this.getLockedBy();
        try {
          const sql = this.buildAcquireSql();
          await this.client.query(sql, [lockedBy]);
          this.logger?.info('Lock acquired', { lockedBy });
          return { acquired: true, staleLockCleared: staleLockCleared || undefined };
        } catch (err) {
          // 获取锁失败（可能是并发竞争），等待后重试
          this.logger?.debug('Lock acquire failed, retrying', { error: err instanceof Error ? err.message : String(err) });
          await this.sleep(this.config.pollIntervalMs);
          continue;
        }
      }

      const lockGranted = row.LOCKGRANTED ? new Date(row.LOCKGRANTED) : null;
      if (lockGranted) {
        const ageMs = Date.now() - lockGranted.getTime();
        if (ageMs > this.config.staleLockThresholdMs) {
          this.logger?.warn('Stale lock detected, force-clearing', {
            lockedBy: row.LOCKEDBY,
            ageMs,
          });

          await this.client.query(
            `UPDATE DATABASECHANGELOGLOCK SET LOCKED = FALSE, LOCKEDBY = NULL, LOCKGRANTED = NULL WHERE ID = 1`,
          );

          staleLockCleared = true;
          // 清除后不继续等待，下次循环直接尝试获取
        }
      }

      this.logger?.debug('Lock held by another process, waiting...', {
        lockedBy: row.LOCKEDBY,
      });

      await this.sleep(this.config.pollIntervalMs);
    }

    this.logger?.warn('Lock acquisition timeout');
    return { acquired: false, reason: 'timeout' };
  }

  async release(): Promise<void> {
    await this.client.query(
      `UPDATE DATABASECHANGELOGLOCK SET LOCKED = FALSE, LOCKEDBY = NULL, LOCKGRANTED = NULL WHERE ID = 1`,
    );
    this.logger?.debug('Lock released');
  }

  private buildAcquireSql(): string {
    const param = this.dialect === 'postgresql' ? '$1' : '?';
    return `UPDATE DATABASECHANGELOGLOCK SET LOCKED = TRUE, LOCKGRANTED = NOW(), LOCKEDBY = ${param} WHERE ID = 1`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
