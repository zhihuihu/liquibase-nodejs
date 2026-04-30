# @nisec/liquibase

兼容 Liquibase 的 Node.js 数据库版本管理工具。设计为可嵌入其他应用的库，应用启动时自动运行，支持集群安全锁定。

## 功能

- SQL 变更集（注释标记格式 `--changeset author:id`）
- JS/TS 编程式变更集
- XML 变更日志，支持 `include` 和 `includeAll`
- 集群安全锁 + 过期锁自动检测与清除
- 多数据库支持：MySQL、MariaDB、PostgreSQL
- 前置条件检查（sql-check、table-exists、column-exists、自定义）

## 安装

```bash
npm install @nisec/liquibase
# 同时安装对应的数据库驱动：
npm install pg        # PostgreSQL
npm install mysql2    # MySQL / MariaDB
```

## 配置参数

`liquibase()` 函数接受一个 `MigrationConfig` 对象，以下是所有可配置参数：

### 必需参数

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `connection` | `object` | 数据库连接信息 | `{ host, port, database, user, password }` |
| `dialect` | `string` | 数据库类型：`'mysql'`、`'mariadb'`、`'postgresql'` | `'postgresql'` |
| `changelogPath` | `string` | changelog.xml 文件路径（绝对路径或相对路径） | `'./changelog.xml'` |

### connection 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `host` | `string` | 数据库主机地址 |
| `port` | `number` | 数据库端口 |
| `database` | `string` | 数据库名称 |
| `user` | `string` | 用户名 |
| `password` | `string` | 密码 |

### 可选参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `basePath` | `string` | `process.cwd()` | 变更集文件的基准路径，用于解析相对路径 |
| `logger` | `Logger` | 内置默认日志 | 自定义日志实现，需包含 `info/warn/error/debug` 方法 |
| `lock` | `object` | 见下表 | 集群锁配置 |

### lock 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `timeoutMs` | `number` | `30000` (30秒) | 获取锁的最大等待时间，超时后放弃执行 |
| `pollIntervalMs` | `number` | `2000` (2秒) | 轮询检查锁状态的间隔时间 |
| `staleLockThresholdMs` | `number` | `300000` (5分钟) | 过期锁判定阈值，超过此时间的锁会被强制清除 |

## 完整使用案例

按执行顺序，一个典型项目的文件结构如下：

```
project/
├── changelog.xml              # 入口：变更日志主文件
├── migrations/
│   ├── sql/
│   │   ├── 001-init.sql       # 第一个 SQL 变更集：建表
│   │   └── 002-add-index.sql  # 第二个 SQL 变更集：加索引
│   └── ts/
│       └── 003-seed-users.ts  # JS/TS 变更集：初始化数据
└── src/
    └── index.ts               # 应用入口：调用 liquibase()
```

### 第一步：创建 XML 变更日志入口

**`changelog.xml`**（项目根目录）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
    <!-- 按顺序引入 SQL 变更集 -->
    <include file="./migrations/sql/001-init.sql" relativeToChangelogFile="true"/>
    <include file="./migrations/sql/002-add-index.sql" relativeToChangelogFile="true"/>

    <!-- 引入整个目录，自动按文件名排序 -->
    <includeAll path="./migrations/sql/v2" relativeToChangelogFile="true"/>

    <!-- 引入 TS 编程式变更集 -->
    <include file="./migrations/ts/003-seed-users.ts" relativeToChangelogFile="true"/>
</databaseChangeLog>
```

### 第二步：编写 SQL 变更集

**`migrations/sql/001-init.sql`**（第一个执行）

```sql
--changeset huzhihui:001
--preconditions onFail:HALT onError:HALT
--comment 创建用户表和角色表
CREATE TABLE users (
    id BIGINT NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    id BIGINT NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--changeset huzhihui:002
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:0 SELECT count(*) FROM information_schema.tables WHERE table_name = 'orders'
--comment 创建订单表（依赖 users 表）
CREATE TABLE orders (
    id BIGINT NOT NULL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**`migrations/sql/002-add-index.sql`**（第二个执行）

```sql
--changeset huzhihui:003
--comment 为常用查询添加索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
```

### 第三步：编写 TS 变更集（可选，用于复杂逻辑）

**`migrations/ts/003-seed-users.ts`**

```typescript
import { Changeset, DatabaseClient } from '@nisec/liquibase';

export const changeset: Changeset = {
  id: 'seed-users-001',
  author: 'huzhihui',
  comment: '初始化默认角色和测试用户',
  preconditions: [
    {
      type: 'table-exists',
      tableName: 'users',
      onFail: 'HALT',
      onError: 'HALT',
    },
    {
      type: 'table-exists',
      tableName: 'roles',
      onFail: 'HALT',
      onError: 'HALT',
    },
  ],
  async execute(db: DatabaseClient) {
    // 插入默认角色
    await db.query("INSERT INTO roles (id, name) VALUES (1, 'admin')");
    await db.query("INSERT INTO roles (id, name) VALUES (2, 'user')");

    // 插入测试用户
    await db.query("INSERT INTO users (id, name, email, role_id) VALUES (1, '张三', 'zhangsan@example.com', 1)");
    await db.query("INSERT INTO users (id, name, email, role_id) VALUES (2, '李四', 'lisi@example.com', 2)");
  },
};
```

### 第四步：在应用启动时调用

**`src/index.ts`**

```typescript
import { liquibase } from '@nisec/liquibase';
import { createApp } from './server';

async function bootstrap() {
  // 1. 启动时先执行数据库迁移
  const result = await liquibase({
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'mydb',
      user: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD || 'secret',
    },
    dialect: (process.env.DB_DIALECT as any) || 'postgresql',
    changelogPath: './changelog.xml',
  });

  if (!result.success) {
    console.error('数据库迁移失败:', result.error);
    process.exit(1);
  }

  console.log(`迁移完成：执行 ${result.executed} 个变更集，跳过 ${result.skipped} 个`);

  // 2. 迁移成功后启动 HTTP 服务
  const app = createApp();
  app.listen(3000, () => {
    console.log('服务已启动: http://localhost:3000');
  });
}

bootstrap();
```

## 其他使用方式

### CLI 命令行

```bash
nisec-liquibase \
  --changelog ./changelog.xml \
  --dialect postgresql \
  --host localhost \
  --port 5432 \
  --database mydb \
  --user admin \
  --password secret
```

### 仅调用 liquibase() 函数

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
});

console.log(result);
// {
//   success: true,
//   executed: 3,
//   skipped: 0,
//   failed: 0,
//   changesets: [...]
// }
```

## 变更集语法

### SQL 变更集

每个变更集以 `--changeset` 开头，格式为 `author:id`：

```sql
--changeset author:unique-id
--preconditions onFail:HALT onError:HALT
--comment 变更集描述
-- 你的 SQL 语句...
```

`--preconditions` 参数说明：
- `onFail`：前置条件不通过时的行为 — `HALT`（终止）、`MARK_RAN`（标记为已执行跳过）、`CONTINUE`（继续）
- `onError`：SQL 执行出错时的行为 — 同上

### JS/TS 变更集

```typescript
import { Changeset, DatabaseClient } from '@nisec/liquibase';

export const changeset: Changeset = {
  id: 'unique-id',
  author: 'your-name',
  comment: '描述',
  preconditions: [],  // 可选，见下表
  async execute(db: DatabaseClient) {
    await db.query('...');
  },
};
```

## 前置条件类型

| 类型 | 说明 |
|------|------|
| `sql-check` | 执行 SQL，校验返回结果是否等于预期值 |
| `table-exists` | 检查表是否存在 |
| `column-exists` | 检查某表的列是否存在 |
| 自定义 | JS 变更集中可编写任意前置条件逻辑 |

## 集群锁定机制

多实例同时启动时，通过 `DATABASECHANGELOGLOCK` 表保证只有一个实例执行迁移：

1. 第一个实例获取锁，开始执行变更
2. 其他实例轮询等待（默认每 2 秒检查一次，最长等待 30 秒）
3. 超过等待时间后自动退出（不阻塞应用启动失败）
4. 若某个实例异常退出导致锁残留，超过配置的 `staleLockThresholdMs` 后自动清除
