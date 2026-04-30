import { DatabaseClient, DialectName } from '../types';
import { MysqlDialect } from '../dialect/mysql-dialect';
import { PostgresqlDialect } from '../dialect/postgresql-dialect';

export interface ExecutedChangeset {
  id: string;
  author: string;
  filename: string;
  md5sum: string;
}

export async function ensureChangeLogTable(
  client: DatabaseClient,
  dialectName: string,
): Promise<void> {
  const dialect = getDialect(dialectName);

  // Create lock table first
  await client.query(dialect.getCreateLockTableSql());
  await client.query(dialect.getLockTableInitSql());

  // Create changelog table
  await client.query(dialect.getCreateChangeLogTableSql());
}

export async function getExecutedChangesets(
  client: DatabaseClient,
): Promise<ExecutedChangeset[]> {
  const result = await client.query(
    `SELECT ID, AUTHOR, FILENAME, MD5SUM FROM DATABASECHANGELOG ORDER BY ORDEREXECUTED`
  );
  return result.rows.map((row) => ({
    id: String(row.ID),
    author: String(row.AUTHOR),
    filename: String(row.FILENAME),
    md5sum: String(row.MD5SUM || ''),
  }));
}

export interface RecordChangesetInput {
  id: string;
  author: string;
  filename: string;
  checksum: string;
  comment?: string;
  exectype?: string;
}

export async function recordChangeset(
  client: DatabaseClient,
  input: RecordChangesetInput,
  dialectName: string,
): Promise<void> {
  if (dialectName === 'mysql' || dialectName === 'mariadb') {
    await client.query(
      `INSERT INTO DATABASECHANGELOG (ID, AUTHOR, FILENAME, MD5SUM, DESCRIPTION, EXECTYPE) VALUES (?, ?, ?, ?, ?, ?)`,
      [input.id, input.author, input.filename, input.checksum, input.comment || '', input.exectype || 'EXECUTED']
    );
  } else {
    await client.query(
      `INSERT INTO DATABASECHANGELOG (ID, AUTHOR, FILENAME, MD5SUM, DESCRIPTION, EXECTYPE) VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.id, input.author, input.filename, input.checksum, input.comment || '', input.exectype || 'EXECUTED']
    );
  }
}

function getDialect(name: string) {
  if (name === 'mysql' || name === 'mariadb') {
    return new MysqlDialect();
  }
  return new PostgresqlDialect();
}
