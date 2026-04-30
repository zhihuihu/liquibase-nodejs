# CLAUDE.md

此文件为 Claude Code 在处理本仓库时提供指导。

## 项目概述

`@nisec/liquibase` — 一个独立的 Node.js 包，提供兼容 Liquibase 的数据库版本管理。设计为可嵌入其他应用的库，而非独立服务。在应用启动时自动运行，支持集群安全锁定。

**CLI 命令：** `nisec-liquibase`
**主导出函数：** `liquibase()`

## 技术栈

- TypeScript（严格模式）
- Vitest 测试框架（要求 80%+ 覆盖率）
- 对等依赖：`pg`（PostgreSQL）、`mysql2`（MySQL/MariaDB）— 可选，动态加载
- 运行依赖：`fast-xml-parser`、`glob`、`md5`

## 常用命令

```bash
npm run build       # tsc 编译
npm run test        # 运行 vitest 测试
npm run typecheck   # tsc 类型检查，不输出文件
```

## 目录结构

```
src/
├── index.ts              # 公共 API：export { liquibase }
├── migrator.ts           # 主编排函数：liquibase()
├── cli.ts                # CLI 入口（#!/usr/bin/env node）
├── config.ts             # DEFAULT_LOCK_CONFIG、resolveConfig()
├── db-client.ts          # 动态加载对等依赖（pg / mysql2）
├── types.ts              # 所有类型：MigrationConfig、Changeset 等
├── dialect/              # SQL 方言抽象
│   ├── base.ts           # 基础方言接口
│   ├── mysql-dialect.ts  # MySQL/MariaDB 方言
│   └── postgresql-dialect.ts
├── parser/               # 变更日志与变更集解析
│   ├── changelog-parser.ts   # XML 解析（include、includeAll）
│   ├── changeset-parser.ts   # SQL 注释标记解析
│   └── js-changeset-runner.ts # JS/TS 变更集动态导入执行
├── runner/               # 迁移执行
│   ├── lock-manager.ts       # 集群安全锁 + 过期锁检测
│   ├── migration-executor.ts # 带事务执行单个变更集
│   ├── precondition-checker.ts # 前置条件检查
│   └── state-tracker.ts      # DATABASECHANGELOG 表管理
└── utils/
    ├── checksum.ts       # MD5 校验变更集内容
    ├── file-resolver.ts  # include/includeAll 路径解析
    └── logger.ts         # 默认日志实现
```

## 关键设计决策

- **数据库驱动为对等依赖**：`pg` 和 `mysql2` 是可选的对等依赖，运行时动态加载，避免强制安装两者。
- **每个变更集独立事务**：每个 changeset 在各自事务中执行。
- **集群安全锁**：`DATABASECHANGELOGLOCK` 表 + 轮询 + 过期锁自动检测（可配置阈值，默认 5 分钟）。
- **不支持回滚**：变更集仅支持正向执行。
- **过期锁恢复**：超过 `staleLockThresholdMs` 的锁会被自动强制清除。

## 开发规范

- TDD：先写测试，覆盖率 80%+
- 每次重要修改后进行代码审查
- 生产代码中禁止使用 `console.log`
- 不可变性：创建新对象，绝不修改现有对象
- 文件聚焦，不超过 800 行；函数不超过 50 行
- 安全：禁止硬编码密钥，在系统边界进行输入校验
