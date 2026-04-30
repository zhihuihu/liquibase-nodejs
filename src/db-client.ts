import { DatabaseClient, DatabaseConnection, DialectName, QueryResult, TransactionClient } from './types';

export async function createDatabaseClient(
  connection: DatabaseConnection,
  dialect: DialectName,
): Promise<DatabaseClient> {
  if (dialect === 'postgresql') {
    return createPostgresClient(connection);
  }
  return createMysqlClient(connection);
}

async function createPostgresClient(connection: DatabaseConnection): Promise<DatabaseClient> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
  });

  return {
    async query(sql: string, params?: unknown[]): Promise<QueryResult> {
      const result = await pool.query(sql, params as unknown[]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
    async transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const txClient: TransactionClient = {
          async query(sql: string, params?: unknown[]): Promise<QueryResult> {
            const result = await client.query(sql, params as unknown[]);
            return { rows: result.rows, rowCount: result.rowCount ?? 0 };
          },
        };
        const result = await fn(txClient);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function createMysqlClient(connection: DatabaseConnection): Promise<DatabaseClient> {
  const { default: mysql } = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
  });

  return {
    async query(sql: string, params?: unknown[]): Promise<QueryResult> {
      const [rows] = await pool.execute(sql, params as any) as [Record<string, unknown>[], any];
      return { rows, rowCount: rows.length };
    },
    async transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const txClient: TransactionClient = {
          async query(sql: string, params?: unknown[]): Promise<QueryResult> {
            const [rows] = await conn.execute(sql, params as any) as [Record<string, unknown>[], any];
            return { rows, rowCount: rows.length };
          },
        };
        const result = await fn(txClient);
        await conn.commit();
        return result;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
