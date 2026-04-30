# @nisec/liquibase

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
npm install @nisec/liquibase
# Plus your database driver:
npm install pg     # for PostgreSQL
npm install mysql2 # for MySQL/MariaDB
```

## Usage

```typescript
import { liquibase } from '@nisec/liquibase';

const result = await liquibase({
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
import { Changeset, DatabaseClient } from '@nisec/liquibase';

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
