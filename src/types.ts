// Database connection types
export interface PostgresConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  [key: string]: unknown;
}

export interface MySqlConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  [key: string]: unknown;
}

export type DatabaseConnection = PostgresConnection | MySqlConnection;

// Dialect
export type DialectName = 'mysql' | 'mariadb' | 'postgresql';

// Logger
export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
}

// Precondition
export interface Precondition {
  type: 'sql-check' | 'table-exists' | 'column-exists' | 'custom';
  expectedResult?: string | number;
  sql?: string;
  tableName?: string;
  columnName?: string;
  checkFn?: () => Promise<boolean>;
}

export type OnFailAction = 'HALT' | 'MARK_RAN' | 'CONTINUE';
export type OnErrorAction = 'HALT' | 'MARK_RAN' | 'CONTINUE';

export interface PreconditionOptions {
  onFail: OnFailAction;
  onError: OnErrorAction;
}

// Changeset (parsed from SQL comments or JS module)
export interface SqlChangeset {
  type: 'sql';
  id: string;
  author: string;
  filename: string;
  sql: string;
  comment?: string;
  runInTransaction: boolean;
  failOnError: boolean;
  preconditions: Precondition[];
  preconditionOptions: PreconditionOptions;
}

export interface JsChangeset {
  type: 'js';
  id: string;
  author: string;
  filename: string;
  comment?: string;
  runInTransaction: boolean;
  failOnError: boolean;
  preconditions: Precondition[];
  preconditionOptions: PreconditionOptions;
  execute: (db: DatabaseClient | TransactionClient) => Promise<void>;
}

export type Changeset = SqlChangeset | JsChangeset;

// Database client (abstraction over pg.Pool / mysql2 Pool)
export interface DatabaseClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

export interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

// Lock config
export interface LockConfig {
  timeoutMs: number;
  pollIntervalMs: number;
  staleLockThresholdMs: number;
}

// Migration config
export interface MigrationConfig {
  connection: DatabaseConnection;
  dialect: DialectName;
  changelogPath: string;
  basePath?: string;
  lock?: Partial<LockConfig>;
  logger?: Logger;
}

// Migration result
export interface ChangesetResult {
  id: string;
  author: string;
  filename: string;
  status: 'executed' | 'skipped' | 'failed' | 'invalid';
  reason?: string;
  duration: number;
}

export interface MigrationResult {
  success: boolean;
  lockAcquired: boolean;
  executed: number;
  skipped: number;
  failed: number;
  changesets: ChangesetResult[];
  error?: string;
}
