import { describe, it, expect, vi } from 'vitest';
import { LockManager } from '../../src/runner/lock-manager';
import { DatabaseClient, LockConfig } from '../../src/types';

function createMockClient(rows: any[]): DatabaseClient {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(async () => {
      const row = rows[callIndex++] || { rows: [], rowCount: 0 };
      return row;
    }),
    transaction: vi.fn().mockImplementation(async (fn) => {
      const txClient = {
        query: vi.fn().mockImplementation(async () => {
          const row = rows[callIndex++] || { rows: [], rowCount: 0 };
          return row;
        }),
      };
      return fn(txClient);
    }),
  };
}

const defaultConfig: LockConfig = {
  timeoutMs: 5000,
  pollIntervalMs: 1000,
  staleLockThresholdMs: 2000,
};

describe('LockManager.acquire', () => {
  it('should acquire lock when not held', async () => {
    const client = createMockClient([
      { rows: [{ LOCKED: false }], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const manager = new LockManager(client, defaultConfig, 'postgresql', () => 'test-host:123');

    const result = await manager.acquire();
    expect(result.acquired).toBe(true);
  });

  it('should detect and clear stale lock', async () => {
    const oldDate = new Date(Date.now() - 5000);
    const client = createMockClient([
      { rows: [{ LOCKED: true, LOCKGRANTED: oldDate, LOCKEDBY: 'dead-host:999' }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ LOCKED: false }], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const manager = new LockManager(client, defaultConfig, 'postgresql', () => 'test-host:123');

    const result = await manager.acquire();
    expect(result.acquired).toBe(true);
    expect(result.staleLockCleared).toBe(true);
  });

  it('should timeout when lock is actively held', async () => {
    const recentDate = new Date();
    const lockedRow = { LOCKED: true, LOCKGRANTED: recentDate, LOCKEDBY: 'live-host:456' };
    const client = createMockClient([
      { rows: [lockedRow], rowCount: 1 },
      { rows: [lockedRow], rowCount: 1 },
      { rows: [lockedRow], rowCount: 1 },
      { rows: [lockedRow], rowCount: 1 },
      { rows: [lockedRow], rowCount: 1 },
    ]);
    const config: LockConfig = {
      timeoutMs: 2000,
      pollIntervalMs: 500,
      staleLockThresholdMs: 10000,
    };
    const manager = new LockManager(client, config, 'postgresql', () => 'test-host:123');

    const result = await manager.acquire();
    expect(result.acquired).toBe(false);
    expect(result.reason).toBe('timeout');
  });

  it('should release lock', async () => {
    const client = createMockClient([
      { rows: [], rowCount: 1 },
    ]);
    const manager = new LockManager(client, defaultConfig, 'postgresql', () => 'test-host:123');
    await manager.release();
    expect(client.query).toHaveBeenCalled();
  });
});
