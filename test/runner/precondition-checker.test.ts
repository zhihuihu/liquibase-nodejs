import { describe, it, expect, vi } from 'vitest';
import { checkPreconditions, PreconditionCheckResult } from '../../src/runner/precondition-checker';
import { DatabaseClient, Precondition, OnFailAction } from '../../src/types';

function mockClient(queryResult: any): DatabaseClient {
  return {
    query: vi.fn().mockResolvedValue(queryResult),
    transaction: vi.fn().mockImplementation(async (fn) => fn({ query: vi.fn().mockResolvedValue(queryResult) })),
  };
}

describe('checkPreconditions', () => {
  it('should return success for no preconditions', async () => {
    const client = mockClient({ rows: [], rowCount: 0 });
    const result = await checkPreconditions(client, [], { onFail: 'HALT', onError: 'HALT' }, {});
    expect(result.status).toBe('success');
  });

  it('should pass sql-check when result matches', async () => {
    const client = mockClient({ rows: [{ cnt: '0' }], rowCount: 1 });
    const preconditions: Precondition[] = [
      { type: 'sql-check', expectedResult: '0', sql: 'SELECT 0' },
    ];
    const result = await checkPreconditions(client, preconditions, { onFail: 'HALT', onError: 'HALT' }, {});
    expect(result.status).toBe('success');
  });

  it('should fail sql-check when result does not match', async () => {
    const client = mockClient({ rows: [{ cnt: '1' }], rowCount: 1 });
    const preconditions: Precondition[] = [
      { type: 'sql-check', expectedResult: '0', sql: 'SELECT 1' },
    ];
    const result = await checkPreconditions(client, preconditions, { onFail: 'MARK_RAN', onError: 'HALT' }, {});
    expect(result.status).toBe('failed');
    expect(result.action).toBe('MARK_RAN');
  });

  it('should return HALT action when onFail is HALT', async () => {
    const client = mockClient({ rows: [{ cnt: '1' }], rowCount: 1 });
    const preconditions: Precondition[] = [
      { type: 'sql-check', expectedResult: '0', sql: 'SELECT 1' },
    ];
    const result = await checkPreconditions(client, preconditions, { onFail: 'HALT', onError: 'HALT' }, {});
    expect(result.status).toBe('failed');
    expect(result.action).toBe('HALT');
  });

  it('should handle custom precondition function', async () => {
    const client = mockClient({ rows: [], rowCount: 0 });
    const preconditions: Precondition[] = [
      { type: 'custom', checkFn: async () => true },
    ];
    const result = await checkPreconditions(client, preconditions, { onFail: 'HALT', onError: 'HALT' }, {});
    expect(result.status).toBe('success');
  });

  it('should fail custom precondition when function returns false', async () => {
    const client = mockClient({ rows: [], rowCount: 0 });
    const preconditions: Precondition[] = [
      { type: 'custom', checkFn: async () => false },
    ];
    const result = await checkPreconditions(client, preconditions, { onFail: 'CONTINUE', onError: 'HALT' }, {});
    expect(result.status).toBe('failed');
    expect(result.action).toBe('CONTINUE');
  });
});
