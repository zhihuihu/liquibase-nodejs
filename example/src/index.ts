/**
 * 应用入口
 *
 * 用法:
 *   npm start
 *   # 或: npx tsx src/index.ts
 */
import path from 'path';
import fs from 'fs';
import { liquibase } from '@nisec/liquibase';

// 获取项目根目录
const rootDir = process.cwd();

// 解析 .env 文件
function loadEnv(): Record<string, string> {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(
      '未找到 .env 文件，请复制 .env.example 为 .env 并填入你的 MySQL 连接信息'
    );
  }

  const env: Record<string, string> = {};
  fs.readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .forEach(line => {
      const [key, ...valueParts] = line.split('=');
      env[key.trim()] = valueParts.join('=').trim();
    });
  return env;
}

async function runMigrations() {
  const env = loadEnv();

  const result = await liquibase({
    connection: {
      host: env.DB_HOST,
      port: parseInt(env.DB_PORT || '3306'),
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },
    dialect: 'mysql',
    changelogPath: path.join(rootDir, 'migrations', 'changelog.xml'),
    basePath: path.join(rootDir, 'migrations'),
  });

  console.log(result.success ? '✅ 迁移成功!' : '❌ 迁移失败!');
  console.log(`   已执行: ${result.executed}`);
  console.log(`   已跳过: ${result.skipped}`);
  console.log(`   失败:   ${result.failed}`);

  for (const cs of result.changesets) {
    const icon = cs.status === 'executed' ? '  →' : cs.status === 'skipped' ? '  ✓' : '  ✗';
    console.log(`${icon} ${cs.filename} ${cs.author}:${cs.id} [${cs.status}]`);
  }

  if (!result.success) {
    process.exit(1);
  }
}

runMigrations().catch(e => {
  console.error(e.message);
  process.exit(1);
});
