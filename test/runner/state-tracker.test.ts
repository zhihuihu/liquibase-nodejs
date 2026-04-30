import { describe, it, expect, vi } from 'vitest';
import { ensureChangeLogTable, getExecutedChangesets, recordChangeset } from '../../src/runner/state-tracker';
import { DatabaseClient } from '../../src/types';

function createMockClient(): DatabaseClient & { getCalls: () => any[] } {
  const calls: any[] = [];
  return {
    query: vi.fn().mockImplementation(async (sql: string) => {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    }),
    transaction: vi.fn().mockImplementation(async (fn) => {
      const txClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          calls.push(sql);
          return { rows: [], rowCount: 0 };
        }),
      };
      return fn(txClient);
    }),
    getCalls: () => calls,
  };
}

describe('ensureChangeLogTable', () => {
  it('should create DATABASECHANGELOG table', async () => {
    const client = createMockClient();
    await ensureChangeLogTable(client, 'postgresql');
    const calls = client.getCalls();
    expect(calls.some((s: string) => s.includes('DATABASECHANGELOG'))).toBe(true);
  });
});

describe('getExecutedChangesets', () => {
  it('should query DATABASECHANGELOG for executed changesets', async () => {
    const client = createMockClient();
    await getExecutedChangesets(client);
    const calls = client.getCalls();
    expect(calls.some((s: string) => s.includes('SELECT') && s.includes('DATABASECHANGELOG'))).toBe(true);
  });
});

describe('recordChangeset', () => {
  it('should insert into DATABASECHANGELOG', async () => {
    const client = createMockClient();
    await recordChangeset(client, {
      id: '001',
      author: 'huzhihui',
      filename: 'init.sql',
      checksum: 'abc123',
      comment: 'test',
    }, 'postgresql');
    const calls = client.getCalls();
    expect(calls.some((s: string) => s.includes('INSERT') && s.includes('DATABASECHANGELOG'))).toBe(true);
  });
});
