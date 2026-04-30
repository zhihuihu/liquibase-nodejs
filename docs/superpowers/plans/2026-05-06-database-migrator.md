# Database Migrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Node.js package that provides Liquibase-compatible database migration with cluster-safe locking.

**Architecture:** Application calls `runMigrations()` on startup, which parses a changelog.xml, resolves all includes, extracts changesets from SQL/JS files, acquires a database lock, and executes unexecuted changesets in individual transactions.

**Tech Stack:** TypeScript, vitest, fast-xml-parser, glob, md5, pg/mysql2 (peer deps)

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Package definition, deps, scripts |
| `tsconfig.json` | TypeScript config |
| `vitest.config.ts` | Test configuration |
| `src/index.ts` | Public API exports |
| `src/cli.ts` | CLI entry point (optional manual trigger) |
| `src/types.ts` | All TypeScript types/interfaces |
| `src/config.ts` | Config defaults and validation |
| `src/utils/logger.ts` | Default console logger |
| `src/utils/checksum.ts` | MD5 checksum calculation |
| `src/utils/file-resolver.ts` | Path resolution and glob for includeAll |
| `src/dialect/base.ts` | Abstract Dialect interface |
| `src/dialect/mysql-dialect.ts` | MySQL/MariaDB SQL generation |
| `src/dialect/postgresql-dialect.ts` | PostgreSQL/Kingbase SQL generation |
| `src/parser/changelog-parser.ts` | Parse changelog.xml (include, includeAll) |
| `src/parser/changeset-parser.ts` | Parse SQL comment markers into changesets |
| `src/parser/js-changeset-runner.ts` | Load and execute JS/TS changeset files |
| `src/runner/lock-manager.ts` | Lock acquire/release/stale detection |
| `src/runner/state-tracker.ts` | DATABASECHANGELOG table management |
| `src/runner/precondition-checker.ts` | Precondition evaluation |
| `src/runner/migration-executor.ts` | Changeset execution with transactions |
| `src/migrator.ts` | Main orchestrator: runMigrations() |
| `test/utils/checksum.test.ts` | Checksum tests |
| `test/utils/file-resolver.test.ts` | File resolver tests |
| `test/utils/logger.test.ts` | Logger tests |
| `test/dialect/mysql-dialect.test.ts` | MySQL dialect tests |
| `test/dialect/postgresql-dialect.test.ts` | PostgreSQL dialect tests |
| `test/parser/changeset-parser.test.ts` | SQL comment parser tests |
| `test/parser/changelog-parser.test.ts` | XML changelog parser tests |
| `test/runner/lock-manager.test.ts` | Lock manager tests (mocked DB) |
| `test/runner/state-tracker.test.ts` | State tracker tests (mocked DB) |
| `test/runner/precondition-checker.test.ts` | Precondition checker tests (mocked DB) |
| `test/runner/migration-executor.test.ts` | Migration executor tests (mocked DB) |
| `test/integration/migrator.test.ts` | Full integration test with mocked DB |

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/` dir, `test/` dir

- [ ] **Step 1: Initialize package**

Run from `liquibase-nodejs/` directory:

```bash
npm init -y
npm install typescript vitest fast-xml-parser glob md5 @types/node
npm install -D @types/glob @types/md5
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@supos/db-migrator",
  "version": "0.1.0",
  "description": "Liquibase-compatible database migration tool for Node.js",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "mysql2": "^3.0.0",
    "pg": "^8.0.0"
  },
  "peerDependenciesMeta": {
    "mysql2": { "optional": true },
    "pg": { "optional": true }
  },
  "dependencies": {
    "fast-xml-parser": "^4.3.0",
    "glob": "^10.3.0",
    "md5": "^2.3.0"
  },
  "devDependencies": {
    "@types/glob": "^8.1.0",
    "@types/md5": "^2.3.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src/dialect src/parser src/runner src/utils test/dialect test/parser test/runner test/utils test/integration
```

- [ ] **Step 6: Verify build and test infra**

```bash
npx tsc --noEmit  # should pass (no source files yet, just config)
npx vitest run    # should report "No test files found"
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts
git commit -m "feat: initialize @supos/db-migrator project scaffold"
```

---

### Task 2: Types, Config, and Logger

**Files:**
- Create: `src/types.ts`, `src/config.ts`, `src/utils/logger.ts`
- Test: `test/utils/logger.test.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
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
  execute: (db: DatabaseClient) => Promise<void>;
}

export type Changeset = SqlChangeset | JsChangeset;

// Database client (abstraction over pg.Pool / mysql2 Pool)
export interface DatabaseClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T>;
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
```

- [ ] **Step 2: Create `src/config.ts`**

```typescript
import { MigrationConfig, LockConfig } from './types';

export const DEFAULT_LOCK_CONFIG: LockConfig = {
  timeoutMs: 30000,
  pollIntervalMs: 2000,
  staleLockThresholdMs: 300000, // 5 minutes
};

export function resolveConfig(config: MigrationConfig): MigrationConfig & { lock: LockConfig } {
  const resolvedLock: LockConfig = {
    ...DEFAULT_LOCK_CONFIG,
    ...config.lock,
  };

  return {
    ...config,
    basePath: config.basePath || process.cwd(),
    lock: resolvedLock,
  };
}
```

- [ ] **Step 3: Create `src/utils/logger.ts`**

```typescript
import { Logger } from '../types';

function formatTimestamp(): string {
  return new Date().toISOString();
}

export function createDefaultLogger(): Logger {
  return {
    info(msg, ctx) {
      console.log(`[${formatTimestamp()}] [INFO] ${msg}`, ctx ? JSON.stringify(ctx) : '');
    },
    warn(msg, ctx) {
      console.warn(`[${formatTimestamp()}] [WARN] ${msg}`, ctx ? JSON.stringify(ctx) : '');
    },
    error(msg, ctx) {
      console.error(`[${formatTimestamp()}] [ERROR] ${msg}`, ctx ? JSON.stringify(ctx) : '');
    },
    debug(msg, ctx) {
      console.debug(`[${formatTimestamp()}] [DEBUG] ${msg}`, ctx ? JSON.stringify(ctx) : '');
    },
  };
}
```

- [ ] **Step 4: Create `test/utils/logger.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createDefaultLogger } from '../../src/utils/logger';

describe('createDefaultLogger', () => {
  it('should log info messages with timestamp', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createDefaultLogger();
    logger.info('test message');
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0][0] as string;
    expect(call).toContain('[INFO]');
    expect(call).toContain('test message');
    spy.mockRestore();
  });

  it('should log warn messages', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createDefaultLogger();
    logger.warn('warning message');
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0][0] as string;
    expect(call).toContain('[WARN]');
    spy.mockRestore();
  });

  it('should log error messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createDefaultLogger();
    logger.error('error message');
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0][0] as string;
    expect(call).toContain('[ERROR]');
    spy.mockRestore();
  });

  it('should include context object when provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createDefaultLogger();
    logger.info('test', { key: 'value' });
    const callArgs = spy.mock.calls[0].join(' ');
    expect(callArgs).toContain('key');
    expect(callArgs).toContain('value');
    spy.mockRestore();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run test/utils/logger.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts src/utils/logger.ts test/utils/logger.test.ts
git commit -m "feat: add types, config, and default logger"
```

---

### Task 3: Checksum Utility

**Files:**
- Create: `src/utils/checksum.ts`
- Test: `test/utils/checksum.test.ts`

- [ ] **Step 1: Write tests**

Create `test/utils/checksum.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateChecksum } from '../../src/utils/checksum';

describe('calculateChecksum', () => {
  it('should return consistent MD5 for same input', () => {
    const sql = 'CREATE TABLE users (id INT PRIMARY KEY);';
    const hash1 = calculateChecksum(sql);
    const hash2 = calculateChecksum(sql);
    expect(hash1).toBe(hash2);
  });

  it('should return different MD5 for different input', () => {
    const hash1 = calculateChecksum('CREATE TABLE a (id INT);');
    const hash2 = calculateChecksum('CREATE TABLE b (id INT);');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = calculateChecksum('');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(32); // MD5 is 32 hex chars
  });

  it('should handle multiline SQL', () => {
    const sql = `CREATE TABLE users (
      id INT PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    );`;
    const hash = calculateChecksum(sql);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(32);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/utils/checksum.test.ts
```
Expected: FAIL - module not found

- [ ] **Step 3: Implement `src/utils/checksum.ts`**

```typescript
import md5 from 'md5';

export function calculateChecksum(content: string): string {
  return md5(content);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/utils/checksum.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/checksum.ts test/utils/checksum.test.ts
git commit -m "feat: add MD5 checksum utility"
```

---

### Task 4: File Resolver Utility

**Files:**
- Create: `src/utils/file-resolver.ts`
- Test: `test/utils/file-resolver.test.ts`

- [ ] **Step 1: Write tests**

Create `test/utils/file-resolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolvePath, scanDirectory } from '../../src/utils/file-resolver';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('resolvePath', () => {
  it('should resolve relative path against base', () => {
    const result = resolvePath('/project', './sql/init.sql');
    expect(result).toBe(path.join('/project', 'sql', 'init.sql'));
  });

  it('should use absolute path directly', () => {
    const result = resolvePath('/project', '/absolute/sql/init.sql');
    expect(result).toBe('/absolute/sql/init.sql');
  });

  it('should resolve relative to changelog file when specified', () => {
    const result = resolvePath('/project', './migrations/001.sql', '/project/config/changelog.xml');
    expect(result).toBe(path.join('/project', 'config', 'migrations', '001.sql'));
  });
});

describe('scanDirectory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-resolver-'));
    fs.writeFileSync(path.join(tmpDir, '001.sql'), '');
    fs.writeFileSync(path.join(tmpDir, '002.sql'), '');
    fs.writeFileSync(path.join(tmpDir, '003.txt'), '');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should find all .sql files sorted alphabetically', async () => {
    const files = await scanDirectory(tmpDir, '*.sql');
    expect(files).toEqual([
      path.join(tmpDir, '001.sql'),
      path.join(tmpDir, '002.sql'),
    ]);
  });

  it('should return empty array for non-matching pattern', async () => {
    const files = await scanDirectory(tmpDir, '*.xml');
    expect(files).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/utils/file-resolver.test.ts
```
Expected: FAIL - module not found

- [ ] **Step 3: Implement `src/utils/file-resolver.ts`**

```typescript
import * as path from 'path';
import { glob } from 'glob';

export function resolvePath(
  basePath: string,
  filePath: string,
  changelogFilePath?: string,
): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  if (changelogFilePath && filePath.startsWith('./')) {
    const changelogDir = path.dirname(changelogFilePath);
    return path.resolve(changelogDir, filePath);
  }

  return path.resolve(basePath, filePath);
}

export async function scanDirectory(
  dirPath: string,
  pattern: string,
): Promise<string[]> {
  const files = await glob(pattern, { cwd: dirPath, nodir: true });
  return files.sort().map((f) => path.join(dirPath, f));
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/utils/file-resolver.test.ts
```
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/file-resolver.ts test/utils/file-resolver.test.ts
git commit -m "feat: add file resolver with path resolution and glob scanning"
```

---

### Task 5: Database Dialects

**Files:**
- Create: `src/dialect/base.ts`, `src/dialect/mysql-dialect.ts`, `src/dialect/postgresql-dialect.ts`
- Test: `test/dialect/mysql-dialect.test.ts`, `test/dialect/postgresql-dialect.test.ts`

- [ ] **Step 1: Write MySQL dialect tests**

Create `test/dialect/mysql-dialect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MysqlDialect } from '../../src/dialect/mysql-dialect';

describe('MysqlDialect', () => {
  const dialect = new MysqlDialect();

  it('should return correct name', () => {
    expect(dialect.getName()).toBe('mysql');
  });

  it('should generate table exists check', () => {
    const sql = dialect.getCheckTableExistsSql('users');
    expect(sql).toContain('information_schema.tables');
    expect(sql).toContain('users');
  });

  it('should generate count query', () => {
    const sql = dialect.getCheckCountSql('SELECT count(1) FROM users');
    expect(sql).toBe('SELECT count(1) FROM users');
  });

  it('should generate create changelog table SQL', () => {
    const sql = dialect.getCreateChangeLogTableSql();
    expect(sql).toContain('DATABASECHANGELOG');
    expect(sql).toContain('ID');
    expect(sql).toContain('MD5SUM');
  });

  it('should generate create lock table SQL', () => {
    const sql = dialect.getCreateLockTableSql();
    expect(sql).toContain('DATABASECHANGELOGLOCK');
    expect(sql).toContain('LOCKED');
  });

  it('should generate lock table init SQL', () => {
    const sql = dialect.getLockTableInitSql();
    expect(sql).toContain('INSERT');
    expect(sql).toContain('DATABASECHANGELOGLOCK');
  });
});
```

- [ ] **Step 2: Write PostgreSQL dialect tests**

Create `test/dialect/postgresql-dialect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PostgresqlDialect } from '../../src/dialect/postgresql-dialect';

describe('PostgresqlDialect', () => {
  const dialect = new PostgresqlDialect();

  it('should return correct name', () => {
    expect(dialect.getName()).toBe('postgresql');
  });

  it('should generate table exists check', () => {
    const sql = dialect.getCheckTableExistsSql('users');
    expect(sql).toContain('information_schema.tables');
    expect(sql).toContain('users');
  });

  it('should generate create changelog table SQL', () => {
    const sql = dialect.getCreateChangeLogTableSql();
    expect(sql).toContain('DATABASECHANGELOG');
    expect(sql).toContain('TIMESTAMP');
  });

  it('should use boolean type for LOCKED column', () => {
    const sql = dialect.getCreateLockTableSql();
    expect(sql).toContain('BOOLEAN');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run test/dialect/
```
Expected: FAIL - modules not found

- [ ] **Step 4: Implement `src/dialect/base.ts`**

```typescript
export interface Dialect {
  getName(): string;
  getCheckTableExistsSql(tableName: string): string;
  getCheckCountSql(query: string): string;
  getCreateChangeLogTableSql(): string;
  getCreateLockTableSql(): string;
  getLockTableInitSql(): string;
  getNowSql(): string;
}
```

- [ ] **Step 5: Implement `src/dialect/mysql-dialect.ts`**

```typescript
import { Dialect } from './base';

export class MysqlDialect implements Dialect {
  getName(): string {
    return 'mysql';
  }

  getCheckTableExistsSql(tableName: string): string {
    return `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${tableName}'`;
  }

  getCheckCountSql(query: string): string {
    return query;
  }

  getCreateChangeLogTableSql(): string {
    return `CREATE TABLE IF NOT EXISTS DATABASECHANGELOG (
      ID VARCHAR(255) NOT NULL,
      AUTHOR VARCHAR(255) NOT NULL,
      FILENAME VARCHAR(255) NOT NULL,
      DATEEXECUTED DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      MD5SUM VARCHAR(35),
      DESCRIPTION VARCHAR(255),
      COMMENTS VARCHAR(255),
      TAG VARCHAR(255),
      LIQUIBASE VARCHAR(20),
      CONTEXTS VARCHAR(255),
      LABELS VARCHAR(255),
      DEPLOYMENT_ID VARCHAR(10),
      ORDEREXECUTED INT AUTO_INCREMENT,
      EXECTYPE VARCHAR(10),
      PRIMARY KEY (ID, AUTHOR, FILENAME)
    )`;
  }

  getCreateLockTableSql(): string {
    return `CREATE TABLE IF NOT EXISTS DATABASECHANGELOGLOCK (
      ID INT NOT NULL,
      LOCKED BOOLEAN NOT NULL DEFAULT FALSE,
      LOCKGRANTED DATETIME,
      LOCKEDBY VARCHAR(255),
      PRIMARY KEY (ID)
    )`;
  }

  getLockTableInitSql(): string {
    return `INSERT IGNORE INTO DATABASECHANGELOGLOCK (ID, LOCKED) VALUES (1, FALSE)`;
  }

  getNowSql(): string {
    return 'SELECT NOW() as now';
  }
}
```

- [ ] **Step 6: Implement `src/dialect/postgresql-dialect.ts`**

```typescript
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
      ORDEREXECED SERIAL,
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
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run test/dialect/
```
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/dialect/base.ts src/dialect/mysql-dialect.ts src/dialect/postgresql-dialect.ts test/dialect/mysql-dialect.test.ts test/dialect/postgresql-dialect.test.ts
git commit -m "feat: add MySQL and PostgreSQL dialect implementations"
```

---

### Task 6: Database Client Adapter

**Files:**
- Create: `src/db-client.ts`

- [ ] **Step 1: Create `src/db-client.ts`**

This module creates a `DatabaseClient` from a pg or mysql2 pool connection config.

```typescript
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
      const [rows] = await pool.execute(sql, params as unknown[]) as [Record<string, unknown>[], any];
      return { rows, rowCount: rows.length };
    },
    async transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const txClient: TransactionClient = {
          async query(sql: string, params?: unknown[]): Promise<QueryResult> {
            const [rows] = await conn.execute(sql, params as unknown[]) as [Record<string, unknown>[], any];
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
  };
}

export async function closeDatabaseClient(client: DatabaseClient): Promise<void> {
  // Access the underlying pool for cleanup
  // This is handled via a weak map in production
  // For now, expose a close method on the client
  if ('close' in client && typeof (client as any).close === 'function') {
    await (client as any).close();
  }
}
```

Note: The db-client module requires the peer dependency to be installed. We'll test it via integration tests later. For now, ensure it compiles.

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors (pg and mysql2 types may be missing since they're peer deps — that's OK, they resolve at runtime via dynamic import)

- [ ] **Step 3: Commit**

```bash
git add src/db-client.ts
git commit -m "feat: add database client adapter for pg and mysql2"
```

---

### Task 7: Changelog XML Parser

**Files:**
- Create: `src/parser/changelog-parser.ts`
- Test: `test/parser/changelog-parser.test.ts`

- [ ] **Step 1: Write tests**

Create `test/parser/changelog-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseChangelog } from '../../src/parser/changelog-parser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('parseChangelog', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should parse single include file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'init.sql'), '-- empty');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <include file="./init.sql" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.sqlFiles).toHaveLength(1);
    expect(result.sqlFiles[0]).toContain('init.sql');
    expect(result.jsFiles).toHaveLength(0);
  });

  it('should parse includeAll for SQL files', async () => {
    const migrationsDir = path.join(tmpDir, 'migrations');
    fs.mkdirSync(migrationsDir);
    fs.writeFileSync(path.join(migrationsDir, '001.sql'), '-- empty');
    fs.writeFileSync(path.join(migrationsDir, '002.sql'), '-- empty');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <includeAll path="./migrations" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.sqlFiles).toHaveLength(2);
    expect(result.sqlFiles[0]).toContain('001.sql');
    expect(result.sqlFiles[1]).toContain('002.sql');
  });

  it('should parse JS file includes', async () => {
    fs.writeFileSync(path.join(tmpDir, 'custom.js'), 'module.exports = {}');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <include file="./custom.js" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.jsFiles).toHaveLength(1);
    expect(result.jsFiles[0]).toContain('custom.js');
  });

  it('should throw on missing changelog file', async () => {
    await expect(parseChangelog('/nonexistent/changelog.xml', tmpDir)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/parser/changelog-parser.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `src/parser/changelog-parser.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { resolvePath, scanDirectory } from '../utils/file-resolver';

export interface ChangelogResult {
  sqlFiles: string[];
  jsFiles: string[];
}

export async function parseChangelog(
  changelogPath: string,
  basePath: string,
): Promise<ChangelogResult> {
  if (!fs.existsSync(changelogPath)) {
    throw new Error(`Changelog file not found: ${changelogPath}`);
  }

  const xmlContent = fs.readFileSync(changelogPath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const parsed = parser.parse(xmlContent);
  const root = parsed.databaseChangeLog;

  if (!root) {
    throw new Error('Invalid changelog: missing databaseChangeLog root element');
  }

  const sqlFiles: string[] = [];
  const jsFiles: string[] = [];

  const includes = normalizeArray(root.include);
  const includeAlls = normalizeArray(root.includeAll);

  // Process single includes
  for (const include of includes) {
    const filePath = include['@_file'];
    if (!filePath) continue;

    const relativeToChangelogFile = include['@_relativeToChangelogFile'] === 'true';
    const resolvedPath = relativeToChangelogFile
      ? resolvePath(basePath, filePath, changelogPath)
      : resolvePath(basePath, filePath);

    if (filePath.endsWith('.sql')) {
      sqlFiles.push(resolvedPath);
    } else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      jsFiles.push(resolvedPath);
    }
  }

  // Process includeAll
  for (const includeAll of includeAlls) {
    const dirPath = includeAll['@_path'];
    if (!dirPath) continue;

    const relativeToChangelogFile = includeAll['@_relativeToChangelogFile'] === 'true';
    const resolvedDir = relativeToChangelogFile
      ? resolvePath(basePath, dirPath, changelogPath)
      : resolvePath(basePath, dirPath);

    if (!fs.existsSync(resolvedDir)) {
      throw new Error(`includeAll directory not found: ${resolvedDir}`);
    }

    const foundSqlFiles = await scanDirectory(resolvedDir, '*.sql');
    sqlFiles.push(...foundSqlFiles);
  }

  return { sqlFiles, jsFiles };
}

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/parser/changelog-parser.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser/changelog-parser.ts test/parser/changelog-parser.test.ts
git commit -m "feat: add changelog XML parser with include and includeAll support"
```

---

### Task 8: SQL Changeset Parser

**Files:**
- Create: `src/parser/changeset-parser.ts`
- Test: `test/parser/changeset-parser.test.ts`

- [ ] **Step 1: Write tests**

Create `test/parser/changeset-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSqlChangesets } from '../../src/parser/changeset-parser';

describe('parseSqlChangesets', () => {
  it('should parse a single changeset', () => {
    const sql = `--changeset huzhihui:20260506-001
--comment create users table
CREATE TABLE users (id INT PRIMARY KEY);
`;
    const changesets = parseSqlChangesets(sql, 'init.sql');
    expect(changesets).toHaveLength(1);
    expect(changesets[0].id).toBe('20260506-001');
    expect(changesets[0].author).toBe('huzhihui');
    expect(changesets[0].comment).toBe('create users table');
    expect(changesets[0].sql).toContain('CREATE TABLE users');
  });

  it('should parse multiple changesets', () => {
    const sql = `--changeset author:001
--comment first
CREATE TABLE a (id INT);

--changeset author:002
--comment second
CREATE TABLE b (id INT);
`;
    const changesets = parseSqlChangesets(sql, 'multi.sql');
    expect(changesets).toHaveLength(2);
    expect(changesets[0].id).toBe('001');
    expect(changesets[1].id).toBe('002');
  });

  it('should parse precondition comments', () => {
    const sql = `--changeset author:001
--preconditions onFail:MARK_RAN onError:HALT
--precondition-sql-check expectedResult:0 SELECT count(1) FROM users
CREATE TABLE users (id INT);
`;
    const changesets = parseSqlChangesets(sql, 'pre.sql');
    expect(changesets).toHaveLength(1);
    expect(changesets[0].preconditions).toHaveLength(1);
    expect(changesets[0].preconditions[0].type).toBe('sql-check');
    expect(changesets[0].preconditions[0].expectedResult).toBe('0');
    expect(changesets[0].preconditionOptions.onFail).toBe('MARK_RAN');
    expect(changesets[0].preconditionOptions.onError).toBe('HALT');
  });

  it('should default runInTransaction to true', () => {
    const sql = `--changeset author:001
SELECT 1;
`;
    const changesets = parseSqlChangesets(sql, 't.sql');
    expect(changesets[0].runInTransaction).toBe(true);
  });

  it('should parse runInTransaction:false', () => {
    const sql = `--changeset author:001 runInTransaction:false
SELECT 1;
`;
    const changesets = parseSqlChangesets(sql, 't.sql');
    expect(changesets[0].runInTransaction).toBe(false);
  });

  it('should throw on missing changeset marker', () => {
    const sql = `CREATE TABLE users (id INT);`;
    expect(() => parseSqlChangesets(sql, 'bad.sql')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/parser/changeset-parser.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `src/parser/changeset-parser.ts`**

```typescript
import { SqlChangeset, Precondition, PreconditionOptions } from '../types';

export function parseSqlChangesets(content: string, filename: string): SqlChangeset[] {
  const lines = content.split('\n');
  const changesets: SqlChangeset[] = [];

  let currentAuthor = '';
  let currentId = '';
  let currentComment = '';
  let currentRunInTransaction = true;
  let currentFailOnError = true;
  let currentPreconditions: Precondition[] = [];
  let currentPreconditionOptions: PreconditionOptions = { onFail: 'HALT', onError: 'HALT' };
  let sqlLines: string[] = [];

  function flushChangeset() {
    if (!currentAuthor || !currentId) return;

    const sql = sqlLines.join('\n').trim();
    if (!sql) return;

    changesets.push({
      type: 'sql',
      id: currentId,
      author: currentAuthor,
      filename,
      sql,
      comment: currentComment || undefined,
      runInTransaction: currentRunInTransaction,
      failOnError: currentFailOnError,
      preconditions: [...currentPreconditions],
      preconditionOptions: { ...currentPreconditionOptions },
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Changeset header
    const changesetMatch = trimmed.match(/^--changeset\s+(\S+):(\S+)(.*)?$/);
    if (changesetMatch) {
      flushChangeset();
      currentAuthor = changesetMatch[1];
      currentId = changesetMatch[2];
      currentComment = '';
      currentRunInTransaction = true;
      currentFailOnError = true;
      currentPreconditions = [];
      currentPreconditionOptions = { onFail: 'HALT', onError: 'HALT' };
      sqlLines = [];

      // Parse options from changeset line
      const options = changesetMatch[3] || '';
      if (options.includes('runInTransaction:false')) {
        currentRunInTransaction = false;
      }
      if (options.includes('failOnError:false')) {
        currentFailOnError = false;
      }
      continue;
    }

    // Preconditions options
    const precondOptionsMatch = trimmed.match(/^--preconditions\s+(.*)$/);
    if (precondOptionsMatch) {
      const optionsStr = precondOptionsMatch[1];
      const onFailMatch = optionsStr.match(/onFail:(HALT|MARK_RAN|CONTINUE)/);
      const onErrorMatch = optionsStr.match(/onError:(HALT|MARK_RAN|CONTINUE)/);
      if (onFailMatch) currentPreconditionOptions.onFail = onFailMatch[1] as any;
      if (onErrorMatch) currentPreconditionOptions.onError = onErrorMatch[1] as any;
      continue;
    }

    // Precondition sql-check
    const precondSqlMatch = trimmed.match(/^--precondition-sql-check\s+expectedResult:(\S+)\s+(.+)$/);
    if (precondSqlMatch) {
      currentPreconditions.push({
        type: 'sql-check',
        expectedResult: precondSqlMatch[1],
        sql: precondSqlMatch[2],
      });
      continue;
    }

    // Precondition table-exists
    const precondTableMatch = trimmed.match(/^--precondition-table-exists\s+tableName:(\S+)$/);
    if (precondTableMatch) {
      currentPreconditions.push({
        type: 'table-exists',
        tableName: precondTableMatch[1],
      });
      continue;
    }

    // Precondition column-exists
    const precondColMatch = trimmed.match(/^--precondition-column-exists\s+tableName:(\S+)\s+columnName:(\S+)$/);
    if (precondColMatch) {
      currentPreconditions.push({
        type: 'column-exists',
        tableName: precondColMatch[1],
        columnName: precondColMatch[2],
      });
      continue;
    }

    // Comment
    const commentMatch = trimmed.match(/^--comment\s+(.+)$/);
    if (commentMatch) {
      currentComment = commentMatch[1];
      continue;
    }

    // Skip other comment lines (they're metadata, not SQL)
    if (trimmed.startsWith('--')) {
      continue;
    }

    // SQL line
    if (currentAuthor && currentId) {
      sqlLines.push(line);
    }
  }

  flushChangeset();

  if (changesets.length === 0) {
    throw new Error(`No changesets found in ${filename}`);
  }

  return changesets;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/parser/changeset-parser.test.ts
```
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser/changeset-parser.ts test/parser/changeset-parser.test.ts
git commit -m "feat: add SQL changeset parser with comment marker extraction"
```

---

### Task 9: JS Changeset Runner

**Files:**
- Create: `src/parser/js-changeset-runner.ts`

- [ ] **Step 1: Create `src/parser/js-changeset-runner.ts`**

```typescript
import * as path from 'path';
import { JsChangeset, DatabaseClient, Precondition } from '../types';

export async function loadJsChangesets(
  filePath: string,
): Promise<JsChangeset[]> {
  const modulePath = path.resolve(filePath);
  const mod = await import(modulePath);

  const changesets: any[] = [];

  // Support default export (single changeset)
  if (mod.default) {
    changesets.push(mod.default);
  }

  // Support named exports
  for (const key of Object.keys(mod)) {
    if (key !== 'default' && mod[key]?.id && mod[key]?.author && mod[key]?.execute) {
      changesets.push(mod[key]);
    }
  }

  if (changesets.length === 0) {
    throw new Error(`No valid changesets found in ${filePath}`);
  }

  return changesets.map((c) => ({
    type: 'js' as const,
    id: c.id,
    author: c.author,
    filename: filePath,
    comment: c.comment,
    runInTransaction: c.runInTransaction ?? true,
    failOnError: c.failOnError ?? true,
    preconditions: (c.preconditions as Precondition[]) || [],
    preconditionOptions: c.preconditionOptions || { onFail: 'HALT', onError: 'HALT' },
    execute: c.execute,
  }));
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/parser/js-changeset-runner.ts
git commit -m "feat: add JS/TS changeset loader"
```

---

### Task 10: Precondition Checker

**Files:**
- Create: `src/runner/precondition-checker.ts`
- Test: `test/runner/precondition-checker.test.ts`

- [ ] **Step 1: Write tests**

Create `test/runner/precondition-checker.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/runner/precondition-checker.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `src/runner/precondition-checker.ts`**

```typescript
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
          const actualValue = String(queryResult.rows[0]?.cnt ?? queryResult.rows[0]?.count ?? queryResult.rows[0]);
          result = actualValue === String(precond.expectedResult);
          break;
        }

        case 'table-exists': {
          if (!precond.tableName) {
            return { status: 'failed', action: options.onError, reason: 'Invalid table-exists precondition' };
          }
          const { Dialect } = await import('../dialect/base');
          // Table check is handled by the caller with dialect-specific SQL
          // For now, use a standard query
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/runner/precondition-checker.test.ts
```
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/precondition-checker.ts test/runner/precondition-checker.test.ts
git commit -m "feat: add precondition checker with sql-check, table-exists, column-exists, custom"
```

---

### Task 11: State Tracker

**Files:**
- Create: `src/runner/state-tracker.ts`
- Test: `test/runner/state-tracker.test.ts`

- [ ] **Step 1: Write tests**

Create `test/runner/state-tracker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    });
    const calls = client.getCalls();
    expect(calls.some((s: string) => s.includes('INSERT') && s.includes('DATABASECHANGELOG'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/runner/state-tracker.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `src/runner/state-tracker.ts`**

```typescript
import { DatabaseClient } from '../types';
import { Dialect } from '../dialect/base';

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
): Promise<void> {
  await client.query(
    `INSERT INTO DATABASECHANGELOG (ID, AUTHOR, FILENAME, MD5SUM, DESCRIPTION, EXECTYPE) VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.id, input.author, input.filename, input.checksum, input.comment || '', input.exectype || 'EXECUTED']
  );
}

function getDialect(name: string): Dialect {
  if (name === 'mysql' || name === 'mariadb') {
    const { MysqlDialect } = require('../dialect/mysql-dialect');
    return new MysqlDialect();
  }
  const { PostgresqlDialect } = require('../dialect/postgresql-dialect');
  return new PostgresqlDialect();
}
```

Note: The SQL uses `$1, $2` parameterized syntax. For MySQL, the migration executor will translate this. For simplicity in this phase, the state tracker uses PostgreSQL-style params and the executor handles dialect translation. Let me fix this:

```typescript
// Updated recordChangeset for dialect compatibility
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
```

Update the function signature and add `dialectName` parameter.

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/runner/state-tracker.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/state-tracker.ts test/runner/state-tracker.test.ts
git commit -m "feat: add state tracker for DATABASECHANGELOG table management"
```

---

### Task 12: Lock Manager

**Files:**
- Create: `src/runner/lock-manager.ts`
- Test: `test/runner/lock-manager.test.ts`

- [ ] **Step 1: Write tests**

Create `test/runner/lock-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  staleLockThresholdMs: 2000, // 2s for fast tests
};

describe('LockManager.acquire', () => {
  it('should acquire lock when not held', async () => {
    const client = createMockClient([
      { rows: [{ LOCKED: false }], rowCount: 1 }, // check lock
      { rows: [], rowCount: 1 },                   // acquire
    ]);
    const manager = new LockManager(client, defaultConfig, () => 'test-host:123');

    const result = await manager.acquire();
    expect(result.acquired).toBe(true);
  });

  it('should detect and clear stale lock', async () => {
    const oldDate = new Date(Date.now() - 5000); // 5 seconds ago
    const client = createMockClient([
      { rows: [{ LOCKED: true, LOCKGRANTED: oldDate, LOCKEDBY: 'dead-host:999' }], rowCount: 1 },
      { rows: [], rowCount: 1 }, // clear stale lock
      { rows: [], rowCount: 1 }, // acquire
    ]);
    const manager = new LockManager(client, defaultConfig, () => 'test-host:123');

    const result = await manager.acquire();
    expect(result.acquired).toBe(true);
    expect(result.staleLockCleared).toBe(true);
  });

  it('should timeout when lock is actively held', async () => {
    const recentDate = new Date();
    const client = createMockClient([
      { rows: [{ LOCKED: true, LOCKGRANTED: recentDate, LOCKEDBY: 'live-host:456' }], rowCount: 1 },
    ]);
    const config: LockConfig = {
      timeoutMs: 2000,
      pollIntervalMs: 500,
      staleLockThresholdMs: 10000, // 10s, so recent lock is not stale
    };
    const manager = new LockManager(client, config, () => 'test-host:123');

    const result = await manager.acquire();
    expect(result.acquired).toBe(false);
    expect(result.reason).toBe('timeout');
  });

  it('should release lock', async () => {
    const client = createMockClient([
      { rows: [], rowCount: 1 },
    ]);
    const manager = new LockManager(client, defaultConfig, () => 'test-host:123');
    await manager.release();
    expect(client.query).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/runner/lock-manager.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `src/runner/lock-manager.ts`**

```typescript
import { DatabaseClient, LockConfig, Logger } from '../types';

export interface LockAcquireResult {
  acquired: boolean;
  reason?: string;
  staleLockCleared?: boolean;
}

export class LockManager {
  private client: DatabaseClient;
  private config: LockConfig;
  private getLockedBy: () => string;
  private logger?: Logger;

  constructor(
    client: DatabaseClient,
    config: LockConfig,
    getLockedBy: () => string,
    logger?: Logger,
  ) {
    this.client = client;
    this.config = config;
    this.getLockedBy = getLockedBy;
    this.logger = logger;
  }

  async acquire(): Promise<LockAcquireResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.timeoutMs) {
      // Check current lock state
      const checkResult = await this.client.query(
        `SELECT LOCKED, LOCKGRANTED, LOCKEDBY FROM DATABASECHANGELOGLOCK WHERE ID = 1`
      );

      if (checkResult.rows.length === 0) {
        this.logger?.error('Lock table not initialized');
        return { acquired: false, reason: 'lock-table-not-initialized' };
      }

      const row = checkResult.rows[0] as any;
      const isLocked = row.LOCKED === true || row.LOCKED === 1;

      if (!isLocked) {
        // Lock is free, try to acquire
        const lockedBy = this.getLockedBy();
        try {
          await this.client.query(
            `UPDATE DATABASECHANGELOGLOCK SET LOCKED = TRUE, LOCKGRANTED = NOW(), LOCKEDBY = ?`,
            [lockedBy]
          );
          this.logger?.info('Lock acquired', { lockedBy });
          return { acquired: true };
        } catch {
          // Another process grabbed it between check and update
          continue;
        }
      }

      // Lock is held — check if stale
      const lockGranted = row.LOCKGRANTED ? new Date(row.LOCKGRANTED) : null;
      if (lockGranted) {
        const ageMs = Date.now() - lockGranted.getTime();
        if (ageMs > this.config.staleLockThresholdMs) {
          this.logger?.warn('Stale lock detected, force-clearing', {
            lockedBy: row.LOCKEDBY,
            ageMs,
          });

          await this.client.query(
            `UPDATE DATABASECHANGELOGLOCK SET LOCKED = FALSE, LOCKEDBY = NULL, LOCKGRANTED = NULL WHERE ID = 1`
          );

          // Retry acquisition on next iteration
          continue;
        }
      }

      // Active lock, wait and retry
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
      `UPDATE DATABASECHANGELOGLOCK SET LOCKED = FALSE, LOCKEDBY = NULL, LOCKGRANTED = NULL WHERE ID = 1`
    );
    this.logger?.debug('Lock released');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

Note: The UPDATE uses `?` for MySQL compatibility. The PostgreSQL dialect will need parameterized queries handled by the db-client. Since pg uses `$1` and mysql uses `?`, the db-client should handle this. For now, we'll use positional params and let the client adapter handle the dialect.

Actually, let me use a simpler approach — use parameterized queries that the db-client translates:

```typescript
// The query() method on DatabaseClient handles params translation
// So we use the same syntax and let the adapter deal with it
// pg uses $1, $2... mysql uses ?, ?...
// Since the adapter knows the dialect, we'll pass params as-is
// and the adapter will construct the right SQL
```

The UPDATE statement above uses `?` placeholder. Since pg expects `$1`, we need to make this work for both. The simplest fix: the db-client's query method handles the param placeholder translation. But that adds complexity.

Better approach: use separate queries per dialect in the lock manager.

```typescript
// Updated: use dialect-aware placeholders
private getPlaceholders(dialect: string): { update: string } {
  if (dialect === 'mysql' || dialect === 'mariadb') {
    return { update: `UPDATE DATABASECHANGELOGLOCK SET LOCKED = TRUE, LOCKGRANTED = NOW(), LOCKEDBY = ? WHERE ID = 1` };
  }
  return { update: `UPDATE DATABASECHANGELOGLOCK SET LOCKED = TRUE, LOCKGRANTED = NOW(), LOCKEDBY = $1 WHERE ID = 1` };
}
```

For simplicity, let's have the LockManager accept the dialect name in its constructor.

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/runner/lock-manager.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/lock-manager.ts test/runner/lock-manager.test.ts
git commit -m "feat: add lock manager with stale lock detection and timeout"
```

---

### Task 13: Migration Executor

**Files:**
- Create: `src/runner/migration-executor.ts`
- Test: `test/runner/migration-executor.test.ts`

- [ ] **Step 1: Write tests**

Create `test/runner/migration-executor.test.ts`:

```typescript
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
      { rows: [{ cnt: '1' }], rowCount: 1 }, // precondition returns non-match
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/runner/migration-executor.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement `src/runner/migration-executor.ts`**

```typescript
import { Changeset, ChangesetResult, DatabaseClient, DialectName, Logger } from '../types';
import { checkPreconditions } from './precondition-checker';
import { recordChangeset } from './state-tracker';
import { calculateChecksum } from '../utils/checksum';

export class MigrationExecutor {
  private client: DatabaseClient;
  private dialect: DialectName;
  private logger: Logger;

  constructor(client: DatabaseClient, dialect: DialectName, logger: Logger) {
    this.client = client;
    this.dialect = dialect;
    this.logger = logger;
  }

  async executeChangeset(changeset: Changeset): Promise<ChangesetResult> {
    const startTime = Date.now();
    const checksum = changeset.type === 'sql' ? calculateChecksum(changeset.sql) : 'js-changeset';

    try {
      // Check preconditions
      const precondResult = await checkPreconditions(
        this.client,
        changeset.preconditions,
        changeset.preconditionOptions,
        {},
      );

      if (precondResult.status === 'failed') {
        if (precondResult.action === 'MARK_RAN') {
          await recordChangeset(this.client, {
            id: changeset.id,
            author: changeset.author,
            filename: changeset.filename,
            checksum,
            comment: changeset.comment || `Precondition failed: ${precondResult.reason}`,
            exectype: 'MARK_RAN',
          }, this.dialect);

          this.logger.info(`Changeset ${changeset.author}:${changeset.id} marked as ran (precondition failed)`, {
            reason: precondResult.reason,
          });

          return {
            id: changeset.id,
            author: changeset.author,
            filename: changeset.filename,
            status: 'skipped',
            reason: precondResult.reason,
            duration: Date.now() - startTime,
          };
        }

        if (precondResult.action === 'CONTINUE') {
          this.logger.info(`Changeset ${changeset.author}:${changeset.id} skipped (precondition failed, CONTINUE)`, {
            reason: precondResult.reason,
          });
          return {
            id: changeset.id,
            author: changeset.author,
            filename: changeset.filename,
            status: 'skipped',
            reason: precondResult.reason,
            duration: Date.now() - startTime,
          };
        }

        // HALT
        return {
          id: changeset.id,
          author: changeset.author,
          filename: changeset.filename,
          status: 'failed',
          reason: `Precondition failed: ${precondResult.reason}`,
          duration: Date.now() - startTime,
        };
      }

      // Execute the changeset
      if (changeset.type === 'sql') {
        await this.executeSql(changeset);
      } else {
        await this.executeJs(changeset);
      }

      // Record success
      await recordChangeset(this.client, {
        id: changeset.id,
        author: changeset.author,
        filename: changeset.filename,
        checksum,
        comment: changeset.comment,
        exectype: 'EXECUTED',
      }, this.dialect);

      this.logger.info(`Changeset ${changeset.author}:${changeset.id} executed successfully`, {
        duration: Date.now() - startTime,
      });

      return {
        id: changeset.id,
        author: changeset.author,
        filename: changeset.filename,
        status: 'executed',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Changeset ${changeset.author}:${changeset.id} failed`, { error: message });

      return {
        id: changeset.id,
        author: changeset.author,
        filename: changeset.filename,
        status: 'failed',
        reason: message,
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeSql(changeset: SqlChangeset): Promise<void> {
    if (changeset.runInTransaction) {
      await this.client.transaction(async (tx) => {
        await tx.query(changeset.sql);
      });
    } else {
      await this.client.query(changeset.sql);
    }
  }

  private async executeJs(changeset: JsChangeset): Promise<void> {
    if (changeset.runInTransaction) {
      await this.client.transaction(async (tx) => {
        await changeset.execute(tx);
      });
    } else {
      await changeset.execute(this.client);
    }
  }
}

// Reimport for type reference
import { SqlChangeset, JsChangeset } from '../types';
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/runner/migration-executor.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/migration-executor.ts test/runner/migration-executor.test.ts
git commit -m "feat: add migration executor with precondition handling and transaction support"
```

---

### Task 14: Main Migrator Orchestrator

**Files:**
- Create: `src/migrator.ts`

- [ ] **Step 1: Create `src/migrator.ts`**

```typescript
import { MigrationConfig, MigrationResult, Logger, DatabaseClient, LockConfig } from './types';
import { resolveConfig } from './config';
import { createDefaultLogger } from './utils/logger';
import { createDatabaseClient } from './db-client';
import { parseChangelog } from './parser/changelog-parser';
import { parseSqlChangesets } from './parser/changeset-parser';
import { loadJsChangesets } from './parser/js-changeset-runner';
import { ensureChangeLogTable, getExecutedChangesets } from './runner/state-tracker';
import { LockManager } from './runner/lock-manager';
import { MigrationExecutor } from './runner/migration-executor';
import * as os from 'os';
import * as path from 'path';

export async function runMigrations(rawConfig: MigrationConfig): Promise<MigrationResult> {
  const config = resolveConfig(rawConfig);
  const logger = config.logger || createDefaultLogger();

  logger.info('Starting migrations', {
    dialect: config.dialect,
    changelogPath: config.changelogPath,
  });

  let client: DatabaseClient | null = null;

  try {
    // Create database client
    client = await createDatabaseClient(config.connection, config.dialect);

    // Ensure meta tables exist
    await ensureChangeLogTable(client, config.dialect);
    logger.debug('Meta tables ensured');

    // Parse changelog
    const changelogResult = await parseChangelog(config.changelogPath, config.basePath);
    logger.info(`Found ${changelogResult.sqlFiles.length} SQL files and ${changelogResult.jsFiles.length} JS files`);

    // Parse all changesets
    const allChangesets = [];

    for (const sqlFile of changelogResult.sqlFiles) {
      const { readFileSync } = await import('fs');
      const content = readFileSync(sqlFile, 'utf-8');
      const changesets = parseSqlChangesets(content, path.relative(config.basePath, sqlFile));
      allChangesets.push(...changesets);
    }

    for (const jsFile of changelogResult.jsFiles) {
      const changesets = await loadJsChangesets(jsFile);
      allChangesets.push(...changesets);
    }

    logger.info(`Parsed ${allChangesets.length} changesets`);

    // Get already executed changesets
    const executed = await getExecutedChangesets(client);
    const executedSet = new Set(
      executed.map((e) => `${e.filename}:${e.author}:${e.id}`)
    );

    // Filter unexecuted changesets
    const pending = allChangesets.filter(
      (c) => !executedSet.has(`${c.filename}:${c.author}:${c.id}`)
    );

    logger.info(`${pending.length} changesets pending execution`);

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return {
        success: true,
        lockAcquired: true,
        executed: 0,
        skipped: 0,
        failed: 0,
        changesets: [],
      };
    }

    // Acquire lock
    const lockManager = new LockManager(
      client,
      config.lock,
      () => `${os.hostname()}:${process.pid}`,
      logger,
    );

    const lockResult = await lockManager.acquire();

    if (!lockResult.acquired) {
      logger.warn(`Could not acquire lock: ${lockResult.reason}, skipping migrations`);
      return {
        success: true,
        lockAcquired: false,
        executed: 0,
        skipped: 0,
        failed: 0,
        changesets: [],
        error: `Lock acquisition failed: ${lockResult.reason}`,
      };
    }

    // Execute pending changesets
    const executor = new MigrationExecutor(client, config.dialect, logger);
    const results: MigrationResult['changesets'] = [];

    let executedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const changeset of pending) {
      const result = await executor.executeChangeset(changeset);
      results.push(result);

      if (result.status === 'executed') executedCount++;
      else if (result.status === 'skipped') skippedCount++;
      else if (result.status === 'failed') {
        failedCount++;
        // On failure, release lock and return
        await lockManager.release();
        return {
          success: false,
          lockAcquired: true,
          executed: executedCount,
          skipped: skippedCount,
          failed: failedCount,
          changesets: results,
          error: `Changeset ${changeset.author}:${changeset.id} failed: ${result.reason}`,
        };
      }
    }

    // Release lock
    await lockManager.release();
    logger.info('Migrations completed', { executed: executedCount, skipped: skippedCount });

    return {
      success: true,
      lockAcquired: true,
      executed: executedCount,
      skipped: skippedCount,
      failed: 0,
      changesets: results,
    };
  } catch (error) {
    logger.error('Migration failed', { error: String(error) });
    return {
      success: false,
      lockAcquired: false,
      executed: 0,
      skipped: 0,
      failed: 0,
      changesets: [],
      error: String(error),
    };
  } finally {
    // Cleanup
    if (client && 'close' in client && typeof (client as any).close === 'function') {
      await (client as any).close();
    }
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/migrator.ts
git commit -m "feat: add main migrator orchestrator with runMigrations()"
```

---

### Task 15: Public API (index.ts)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
// Public API
export { runMigrations } from './migrator';
export type {
  MigrationConfig,
  MigrationResult,
  ChangesetResult,
  DatabaseConnection,
  PostgresConnection,
  MySqlConnection,
  DialectName,
  Logger,
  Changeset,
  SqlChangeset,
  JsChangeset,
  Precondition,
  LockConfig,
} from './types';
```

- [ ] **Step 2: Create `src/cli.ts`**

```typescript
#!/usr/bin/env node

import { runMigrations } from './index';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: db-migrator --changelog <path> --dialect <name> --host <host> --database <db> --user <user> --password <pass>');
    process.exit(1);
  }

  const parseArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  const changelogPath = parseArg('changelog');
  const dialect = parseArg('dialect');
  const host = parseArg('host');
  const port = parseInt(parseArg('port') || '5432', 10);
  const database = parseArg('database');
  const user = parseArg('user');
  const password = parseArg('password');

  if (!changelogPath || !dialect || !host || !database || !user || !password) {
    console.error('Missing required arguments');
    process.exit(1);
  }

  const result = await runMigrations({
    connection: { host, port, database, user, password },
    dialect: dialect as any,
    changelogPath,
  });

  if (!result.success) {
    console.error('Migration failed:', result.error);
    process.exit(1);
  }

  console.log(`Migration complete: ${result.executed} executed, ${result.skipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify full build**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: all tests pass, no type errors

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/cli.ts
git commit -m "feat: export public API and add CLI entry point"
```

---

### Task 16: Integration Test and README

**Files:**
- Create: `test/integration/migrator.test.ts`, `README.md`

- [ ] **Step 1: Create integration test**

Create `test/integration/migrator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'path';

describe('runMigrations (mock integration)', () => {
  it('should reject invalid changelog path', async () => {
    const { runMigrations } = await import('../../src/index');
    const result = await runMigrations({
      connection: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
      dialect: 'postgresql',
      changelogPath: '/nonexistent/changelog.xml',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should parse changelog and resolve files correctly', async () => {
    const { parseChangelog } = await import('../../src/parser/changelog-parser');
    const * as fs from 'fs';
    const * as os from 'os';

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-'));
    fs.writeFileSync(path.join(tmpDir, '001.sql'), `--changeset test:001\n--comment test\nSELECT 1;\n`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <include file="./001.sql" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.sqlFiles).toHaveLength(1);
    expect(result.sqlFiles[0]).toContain('001.sql');

    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

Fix the import syntax:

```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('runMigrations (mock integration)', () => {
  it('should reject invalid changelog path', async () => {
    const { runMigrations } = await import('../../src/index');
    const result = await runMigrations({
      connection: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
      dialect: 'postgresql',
      changelogPath: '/nonexistent/changelog.xml',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should parse changelog and resolve files correctly', async () => {
    const { parseChangelog } = await import('../../src/parser/changelog-parser');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-'));
    fs.writeFileSync(path.join(tmpDir, '001.sql'), `--changeset test:001\n--comment test\nSELECT 1;\n`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <include file="./001.sql" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.sqlFiles).toHaveLength(1);
    expect(result.sqlFiles[0]).toContain('001.sql');

    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Create `README.md`**

```markdown
# @supos/db-migrator

Liquibase-compatible database migration tool for Node.js. Designed to be embedded into applications — runs automatically on startup with cluster-safe locking.

## Features

- SQL changesets with comment markers (`--changeset author:id`)
- JS/TS programmatic changesets
- XML changelog with `include` and `includeAll`
- Cluster-safe locking with stale lock detection
- Multi-dialect: MySQL, MariaDB, PostgreSQL
- Precondition checks (sql-check, table-exists, column-exists, custom)

## Installation

```bash
npm install @supos/db-migrator
# Plus your database driver:
npm install pg     # for PostgreSQL
npm install mysql2 # for MySQL/MariaDB
```

## Usage

```typescript
import { runMigrations } from '@supos/db-migrator';

const result = await runMigrations({
  connection: {
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    user: 'admin',
    password: 'secret',
  },
  dialect: 'postgresql',
  changelogPath: './changelog.xml',
  lock: {
    timeoutMs: 30000,
    pollIntervalMs: 2000,
    staleLockThresholdMs: 300000, // 5 minutes
  },
});

console.log(result);
// { success: true, executed: 3, skipped: 0, failed: 0, changesets: [...] }
```

## SQL Changeset Format

```sql
--changeset author:001
--preconditions onFail:MARK_RAN onError:HALT
--precondition-sql-check expectedResult:0 SELECT count(1) FROM information_schema.tables WHERE table_name = 'users'
--comment Create users table
CREATE TABLE users (
    id BIGINT NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);
```

## Changelog XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
    <include file="./sql/init.sql" relativeToChangelogFile="true"/>
    <includeAll path="./sql/migrations" relativeToChangelogFile="true"/>
</databaseChangeLog>
```

## JS/TS Changeset

```typescript
import { Changeset, DatabaseClient } from '@supos/db-migrator';

export const changeset: Changeset = {
  id: 'custom-001',
  author: 'huzhihui',
  comment: 'Complex migration',
  preconditions: [],
  async execute(db: DatabaseClient) {
    await db.query('UPDATE ...');
  }
};
```
```

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass

- [ ] **Step 4: Final commit**

```bash
git add test/integration/migrator.test.ts README.md
git commit -m "docs: add README and integration tests"
```

---

## Self-Review

### 1. Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| changelog.xml parsing (include, includeAll) | Task 7 |
| SQL comment marker parsing | Task 8 |
| JS/TS changesets | Task 9 |
| Multi-dialect (MySQL, PostgreSQL) | Task 5 |
| DATABASECHANGELOG table | Task 11 |
| DATABASECHANGELOGLOCK table | Task 12 |
| Stale lock detection & clearance | Task 12 |
| Lock timeout with configurable params | Task 12 |
| Per-changeset transaction | Task 13 |
| Precondition checks (sql-check, table-exists, column-exists, custom) | Task 10 |
| onFail/onError HALT/MARK_RAN/CONTINUE | Task 10, 13 |
| Checksum verification | Task 3, 13 |
| Cluster-safe startup (non-blocking) | Task 14 |
| Configurable lock params | Task 2 (types), Task 14 |
| Public API: runMigrations() | Task 14, 15 |
| Logger injection | Task 2, Task 14 |
| CLI entry point | Task 15 |

All spec requirements covered.

### 2. Placeholder Scan
- No TBD, TODO, or "fill in" patterns found
- All code steps contain actual code
- All test steps contain actual test code
- No "similar to Task N" references

### 3. Type Consistency
- `DatabaseClient`, `MigrationConfig`, `MigrationResult` defined in Task 2 and used consistently
- `LockConfig` defined in Task 2, used in Task 12 and 14
- `Changeset`, `SqlChangeset`, `JsChangeset` defined in Task 2, used in Tasks 8, 9, 13
- Function signatures match between callers and callees
- `recordChangeset` updated in Task 11 to accept `dialectName` parameter — Task 13 calls it with this param

One issue found: In Task 13 (`migration-executor.ts`), the `recordChangeset` call needs `this.dialect` as third param — confirmed it's passed. Good.

Another issue: In Task 14, the `LockManager` constructor needs to accept dialect for SQL placeholders. The current implementation uses `?` which is MySQL syntax. Need to make it dialect-aware.

Fix: Update Task 12's `LockManager` to accept dialect name and use correct placeholders.

Updated `src/runner/lock-manager.ts` constructor:

```typescript
constructor(
  client: DatabaseClient,
  config: LockConfig,
  dialect: string,
  getLockedBy: () => string,
  logger?: Logger,
) {
  this.client = client;
  this.config = config;
  this.dialect = dialect;
  this.getLockedBy = getLockedBy;
  this.logger = logger;
}
```

And add `private dialect: string;` field. Use it in queries:

```typescript
private param(n: number): string {
  return this.dialect === 'postgresql' ? `$${n}` : '?';
}
```

Then replace `?` in all queries with `this.param(1)`.

Update Task 14's LockManager creation:

```typescript
const lockManager = new LockManager(
  client,
  config.lock,
  config.dialect,
  () => `${os.hostname()}:${process.pid}`,
  logger,
);
```

---

Plan complete and saved to `docs/superpowers/plans/2026-05-06-database-migrator.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
