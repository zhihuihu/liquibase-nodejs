---
name: database-migrator-design
description: Design for a standalone Node.js database migration tool (Liquibase-compatible)
type: project
---

# Database Migrator Design

## Overview

A standalone Node.js package (`@supos/db-migrator`) that provides Liquibase-compatible database version management. Designed to be embedded into applications — runs automatically on startup with cluster-safe locking.

## Project Structure

```
@supos/db-migrator/
├── src/
│   ├── index.ts                      # Public API
│   ├── types.ts                      # TypeScript type definitions
│   ├── config.ts                     # Configuration schema & defaults
│   ├── cli.ts                        # Optional CLI for manual triggers
│   ├── dialect/
│   │   ├── base.ts                   # Abstract dialect interface
│   │   ├── mysql-dialect.ts          # MySQL / MariaDB specifics
│   │   └── postgresql-dialect.ts     # PostgreSQL / Kingbase specifics
│   ├── parser/
│   │   ├── changelog-parser.ts       # XML changelog parsing (include, includeAll)
│   │   ├── changeset-parser.ts       # SQL file comment marker extraction
│   │   └── js-changeset-runner.ts    # JS/TS changeset execution
│   ├── runner/
│   │   ├── lock-manager.ts           # DATABASECHANGELOGLOCK handling
│   │   ├── state-tracker.ts          # DATABASECHANGELOG table management
│   │   ├── precondition-checker.ts   # Precondition evaluation
│   │   └── migration-executor.ts     # Changeset execution with transactions
│   └── utils/
│       ├── checksum.ts               # MD5 checksum calculation
│       ├── file-resolver.ts          # Path resolution & glob for includeAll
│       └── logger.ts                 # Structured logging
├── package.json
├── tsconfig.json
└── README.md
```

## Core Flow

```
Application Startup
    │
    ▼
runMigrations(config)
    │
    ├── 1. Parse changelog.xml → resolve all includes
    │
    ├── 2. Parse SQL/JS files → extract changesets with metadata
    │
    ├── 3. Create meta tables if not exists
    │       DATABASECHANGELOG
    │       DATABASECHANGELOGLOCK
    │
    ├── 4. Acquire lock (with timeout + stale detection)
    │       ├── Stale lock? → Force clear, log warning
    │       ├── Active lock? → Poll, retry until timeout
    │       └── Timeout? → Log warning, skip migration, DO NOT block startup
    │
    ├── 5. Query DATABASECHANGELOG → filter unexecuted changesets
    │
    ├── 6. Execute each changeset in order:
    │       ├── BEGIN TRANSACTION
    │       ├── Check preconditions
    │       │   ├── onFail:HALT → rollback & stop
    │       │   └── onFail:MARK_RAN → skip, record as EXECUTED
    │       ├── Execute SQL / JS logic
    │       ├── Checksum verification (detect modified changesets)
    │       ├── INSERT into DATABASECHANGELOG
    │       └── COMMIT
    │
    ├── 7. Release lock
    │
    └── 8. Return result summary
```

## Configuration

```typescript
interface MigrationConfig {
  // Database connection (passes through to driver)
  connection: DatabaseConnection;

  // Dialect: 'mysql' | 'mariadb' | 'postgresql'
  dialect: string;

  // Changelog XML file path
  changelogPath: string;

  // Base path for resolving relative includes
  basePath?: string;

  // Lock settings
  lock: {
    // Max wait time for lock (ms), default 30000
    timeoutMs: number;
    // Poll interval (ms), default 2000
    pollIntervalMs: number;
    // Stale lock threshold — locks older than this are force-cleared (ms), default 300000
    staleLockThresholdMs: number;
  };

  // Logging
  logger?: Logger;
}
```

## Key Design Decisions

### Changeset Identity

Each changeset is uniquely identified by `{author}:{id}`. Combined with the filename, this forms the global key:

```
FILENAME:AUTHOR:ID
```

### Checksum

MD5 of the SQL content (excluding comment markers). On execution, compares stored checksum — if mismatched, the changeset was modified after execution. Default behavior: log warning, mark as `INVALID`, configurable via `onUpdate`.

### Lock Strategy

`DATABASECHANGELOGLOCK` table with `ID` (PK), `LOCKED` (BOOLEAN), `LOCKGRANTED` (TIMESTAMP), `LOCKEDBY` (VARCHAR).

Lock acquisition flow:

1. Check if lock exists and is held
2. If locked: evaluate whether it is **stale** (异常锁)
   - A lock is stale if `LOCKGRANTED` is older than `staleLockThresholdMs` (configurable, default 5 minutes)
   - On stale lock: **force clear** it, log warning, then proceed to acquire
3. If locked and not stale: poll every `pollIntervalMs` until `timeoutMs`
4. On timeout: log warning, return `{ acquired: false, reason: 'timeout' }`, skip migration
5. **Never block application startup on lock timeout**
6. Lock holder identifier: hostname + PID for traceability

```typescript
interface LockConfig {
  // Max wait time for lock (ms), default 30000
  timeoutMs: number;
  // Poll interval (ms), default 2000
  pollIntervalMs: number;
  // Stale lock threshold — locks older than this are force-cleared (ms), default 300000
  staleLockThresholdMs: number;
}
```

### Stale Lock Recovery

Scenario: Instance A acquires lock, crashes before releasing. Instance B starts 10 minutes later, finds lock still held.

Without stale detection: Instance B waits forever or times out, migrations never run.
With stale detection: Instance B sees lock is 10 minutes old (> 5 min threshold), force-clears it, runs migrations.

Stale lock clearing logic:
```
SELECT LOCKGRANTED, LOCKEDBY FROM DATABASECHANGELOGLOCK WHERE ID = 1;
→ LOCKGRANTED = '2026-05-06 10:00:00', LOCKEDBY = 'host-a:12345'
→ NOW() - LOCKGRANTED = 10 minutes
→ 10 min > staleLockThresholdMs (5 min) → STALE
→ UPDATE DATABASECHANGELOGLOCK SET LOCKED = FALSE, LOCKEDBY = NULL, LOCKGRANTED = NULL;
→ Log: "Stale lock detected (held by host-a:12345 since 10:00:00), force-cleared"
→ Proceed to acquire lock normally
```

### Multi-Database Support

Abstract `Dialect` interface:

```typescript
interface Dialect {
  getName(): string;
  getCheckTableExistsSql(tableName: string): string;
  getCheckCountSql(query: string): string;
  getCreateChangeLogTableSql(): string;
  getCreateLockTableSql(): string;
  getLockTableInitSql(): string;
}
```

MySQL/MariaDB use `information_schema.tables`, PostgreSQL uses `information_schema.tables` (standard SQL). Kingbase uses PostgreSQL dialect.

### Changeset Execution

Each changeset runs in its own transaction:

```
BEGIN
  → precondition check
  → execute SQL
  → insert into DATABASECHANGELOG
COMMIT
```

On failure: `ROLLBACK`, stop migration (unless `onError:MARK_RAN`).

### Precondition Types

| Type | Description |
|------|-------------|
| `sql-check` | Execute SQL, compare result with `expectedResult` |
| `table-exists` | Check if table exists |
| `column-exists` | Check if column exists in table |
| `custom-precondition` | JS/TS function returns boolean |

Precondition behavior per changeset:

- `onFail`: `HALT` (stop) | `MARK_RAN` (skip & record) | `CONTINUE` (skip, no record)
- `onError`: `HALT` | `MARK_RAN` | `CONTINUE`

### Changeset Metadata (SQL comment markers)

```sql
--changeset author:id runInTransaction:true failOnError:true
--preconditions onFail:MARK_RAN onError:HALT
--precondition-sql-check expectedResult:0 SELECT count(1) FROM ...
--comment Description of this changeset
--rollback NOT SUPPORTED
<actual SQL here>
```

Parsed attributes: `author`, `id`, `runInTransaction`, `failOnError`, preconditions, comment.

### includeAll

```xml
<includeAll path="/sql/mysql/migrations" relativeToChangelogFile="true"/>
```

Scans directory using glob pattern `*.sql`. Files sorted alphabetically to guarantee execution order.

### JS/TS Changesets

```typescript
import { Changeset } from '@supos/db-migrator';

export const changeset: Changeset = {
  id: 'custom-001',
  author: 'huzhihui',
  comment: 'Complex migration with programmatic logic',
  preconditions: [
    { type: 'sql-check', expectedResult: 0, sql: "SELECT count(1) FROM users WHERE role='admin'" }
  ],
  async execute(db: DatabaseClient) {
    // Arbitrary logic here
    await db.query('UPDATE ...');
  }
};
```

JS/TS files are discovered via `<include file="...">` in changelog.xml pointing to `.js` or `.ts` files, or via `<includeAll>` scanning.

### Error Handling

- Parse errors → throw immediately, no tables created
- Connection errors → throw, app decides whether to continue
- Lock timeout → warn, skip, do NOT block
- Changeset failure → rollback current changeset, stop (unless `onError:MARK_RAN`)
- Modified changeset (checksum mismatch) → configurable: `HALT` | `MARK_RAN` | `WARN`

### Logging

Structured logger interface:

```typescript
interface Logger {
  info(msg: string, ctx?: Record<string, any>): void;
  warn(msg: string, ctx?: Record<string, any>): void;
  error(msg: string, ctx?: Record<string, any>): void;
  debug(msg: string, ctx?: Record<string, any>): void;
}
```

Default: console logger with timestamp. User can inject custom logger (pino, winston, etc.).

## Public API

```typescript
import { runMigrations, MigrationConfig, MigrationResult } from '@supos/db-migrator';

const result: MigrationResult = await runMigrations({
  connection: { host: 'localhost', port: 5432, database: 'mydb', user: 'admin', password: 'secret' },
  dialect: 'postgresql',
  changelogPath: './changelog.xml',
  basePath: __dirname,
  lock: { timeoutMs: 30000, pollIntervalMs: 2000 },
});

console.log(result);
// {
//   executed: 5,
//   skipped: 2,
//   failed: 0,
//   changesets: [
//     { id: '001', author: 'huzhihui', status: 'executed', duration: 123 },
//     { id: '002', author: 'huzhihui', status: 'skipped', reason: 'precondition-failed' }
//   ]
// }
```

## Dependencies

- `xml2js` or `fast-xml-parser` — XML parsing
- `glob` — includeAll file scanning
- `md5` — checksum calculation
- `mysql2` / `pg` — database drivers (peer dependencies, user installs the one they need)

## Non-Goals

- No rollback support
- No CLI migration generation from entity diffs
- No visual diff of schema changes
- No dry-run mode (future enhancement)
