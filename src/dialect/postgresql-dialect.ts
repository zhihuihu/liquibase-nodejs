import { Dialect } from './base';

export class PostgresqlDialect implements Dialect {
  getName(): string {
    return 'postgresql';
  }

  getCheckTableExistsSql(tableName: string): string {
    return `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}'`;
  }

  getCheckCountSql(query: string): string {
    return query;
  }

  getCreateChangeLogTableSql(): string {
    return `CREATE TABLE IF NOT EXISTS DATABASECHANGELOG (
      ID VARCHAR(255) NOT NULL,
      AUTHOR VARCHAR(255) NOT NULL,
      FILENAME VARCHAR(255) NOT NULL,
      DATEEXECUTED TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      MD5SUM VARCHAR(35),
      DESCRIPTION VARCHAR(255),
      COMMENTS VARCHAR(255),
      TAG VARCHAR(255),
      LIQUIBASE VARCHAR(20),
      CONTEXTS VARCHAR(255),
      LABELS VARCHAR(255),
      DEPLOYMENT_ID VARCHAR(10),
      ORDEREXECUTED SERIAL,
      EXECTYPE VARCHAR(10),
      PRIMARY KEY (ID, AUTHOR, FILENAME)
    )`;
  }

  getCreateLockTableSql(): string {
    return `CREATE TABLE IF NOT EXISTS DATABASECHANGELOGLOCK (
      ID INT NOT NULL,
      LOCKED BOOLEAN NOT NULL DEFAULT FALSE,
      LOCKGRANTED TIMESTAMP,
      LOCKEDBY VARCHAR(255),
      PRIMARY KEY (ID)
    )`;
  }

  getLockTableInitSql(): string {
    return `INSERT INTO DATABASECHANGELOGLOCK (ID, LOCKED) VALUES (1, FALSE) ON CONFLICT (ID) DO NOTHING`;
  }

  getNowSql(): string {
    return 'SELECT NOW() as now';
  }
}
