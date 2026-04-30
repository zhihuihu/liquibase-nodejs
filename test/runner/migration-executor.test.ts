import { describe, it, expect, vi } from 'vitest';
import { MigrationExecutor } from '../../src/runner/migration-executor';
import { Changeset, DatabaseClient, Logger } from '../../src/types';

function createMockClient(
  queryResults: any[] = [],
  throwOnQuery = false,
): DatabaseClient {
  let callIndex = 0;
  const queryFn = vi.fn().mockImplementation(async () => {
    if (throwOnQuery) throw new Error('Query failed');
    return queryResults[callIndex++] || { rows: [], rowCount: 0 };
  });
  const transactionFn = vi.fn().mockImplementation(async (fn) => {
    const txClient = {
      query: vi.fn().mockImplementation(async () => {
        if (throwOnQuery) throw new Error('Query failed');
        return queryResults[callIndex++] || { rows: [], rowCount: 0 };
      }),
    };
    return fn(txClient);
  });
  return { query: queryFn, transaction: transactionFn };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

const mockChangeset: Changeset = {
  type: 'sql',
  id: '001',
  author: 'huzhihui',
  filename: 'init.sql',
  sql: 'CREATE TABLE users (id INT PRIMARY KEY);',
  comment: 'create users',
  runInTransaction: true,
  failOnError: true,
  preconditions: [],
  preconditionOptions: { onFail: 'HALT', onError: 'HALT' },
};

describe('MigrationExecutor', () => {
  it('should execute a changeset and record it', async () => {
    const client = createMockClient();
    const logger = createMockLogger();
    const executor = new MigrationExecutor(client, 'postgresql', logger);

    const result = await executor.executeChangeset(mockChangeset);
    expect(result.status).toBe('executed');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should skip changeset when precondition fails with MARK_RAN', async () => {
    const client = createMockClient([
      { rows: [{ cnt: '1' }], rowCount: 1 },
    ]);
    const logger = createMockLogger();
    const executor = new MigrationExecutor(client, 'postgresql', logger);

    const changeset: Changeset = {
      ...mockChangeset,
      preconditions: [
        { type: 'sql-check', expectedResult: '0', sql: 'SELECT 1' },
      ],
      preconditionOptions: { onFail: 'MARK_RAN', onError: 'HALT' },
    };

    const result = await executor.executeChangeset(changeset);
    expect(result.status).toBe('skipped');
  });

  it('should fail changeset when SQL execution errors', async () => {
    const client = createMockClient([], true);
    const logger = createMockLogger();
    const executor = new MigrationExecutor(client, 'postgresql', logger);

    const result = await executor.executeChangeset(mockChangeset);
    expect(result.status).toBe('failed');
  });
});
