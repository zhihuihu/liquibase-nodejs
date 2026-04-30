# @nisec/liquibase 使用示例

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置数据库连接
cp .env.example .env
# 编辑 .env，填入你的 MySQL 连接信息

# 3. 运行迁移
npm start
# 或: npx tsx src/index.ts
```

## 目录结构

```
example/
├── src/                     # 应用代码
│   └── index.ts             # 入口：调用 liquibase()
├── migrations/              # 迁移文件
│   ├── changelog.xml        # 主变更日志（入口）
│   ├── 001-initial-schema.sql
│   ├── 002-add-indexes.sql
│   └── 003-seed-data.sql
├── .env.example
├── package.json
└── tsconfig.json            # 可选，编译时使用
```

## 迁移文件编写规范

SQL 文件使用 Liquibase 风格的注释标记：

```sql
--changeset author:id
--comment: 变更描述
-- 你的 SQL 语句
```

支持的功能：
- 多语句（自动按分号拆分逐条执行）
- 前置条件检查（`--precondition-table-exists`、`--precondition-sql-check`）
- 失败策略（`--precondition-on-fail: HALT | MARK_RAN | CONTINUE`）

## 在你的项目中使用

```typescript
import { liquibase } from '@nisec/liquibase';

await liquibase({
  connection: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  dialect: 'mysql',
  changelogPath: path.resolve(__dirname, 'migrations/changelog.xml'),
  basePath: path.resolve(__dirname, 'migrations'),
});
```
