import { DatabaseClient, Precondition, OnFailAction, PreconditionOptions } from '../types';

export interface PreconditionCheckResult {
  status: 'success' | 'failed';
  action: OnFailAction;
  reason?: string;
}

export async function checkPreconditions(
  client: DatabaseClient,
  preconditions: Precondition[],
  options: PreconditionOptions,
  ctx: Record<string, unknown>,
): Promise<PreconditionCheckResult> {
  if (preconditions.length === 0) {
    return { status: 'success', action: 'HALT' };
  }

  for (const precond of preconditions) {
    let result: boolean;

    try {
      switch (precond.type) {
        case 'sql-check': {
          if (!precond.sql || precond.expectedResult === undefined) {
            return { status: 'failed', action: options.onError, reason: 'Invalid sql-check precondition' };
          }
          const queryResult = await client.query(precond.sql);
          const row = queryResult.rows[0] || {};
          const actualValue = String(row.cnt ?? row.count ?? row['COUNT(*)'] ?? row);
          result = actualValue === String(precond.expectedResult);
          break;
        }

        case 'table-exists': {
          if (!precond.tableName) {
            return { status: 'failed', action: options.onError, reason: 'Invalid table-exists precondition' };
          }
          const queryResult = await client.query(
            `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_name = '${precond.tableName}'`
          );
          result = parseInt(String(queryResult.rows[0]?.cnt ?? 0), 10) > 0;
          break;
        }

        case 'column-exists': {
          if (!precond.tableName || !precond.columnName) {
            return { status: 'failed', action: options.onError, reason: 'Invalid column-exists precondition' };
          }
          const queryResult = await client.query(
            `SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_name = '${precond.tableName}' AND column_name = '${precond.columnName}'`
          );
          result = parseInt(String(queryResult.rows[0]?.cnt ?? 0), 10) > 0;
          break;
        }

        case 'custom': {
          if (!precond.checkFn) {
            return { status: 'failed', action: options.onError, reason: 'Custom precondition missing checkFn' };
          }
          result = await precond.checkFn();
          break;
        }

        default:
          return { status: 'failed', action: options.onError, reason: `Unknown precondition type: ${(precond as any).type}` };
      }
    } catch (error) {
      return {
        status: 'failed',
        action: options.onError,
        reason: `Precondition error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (!result) {
      return {
        status: 'failed',
        action: options.onFail,
        reason: `Precondition failed: ${precond.type}`,
      };
    }
  }

  return { status: 'success', action: 'HALT' };
}
