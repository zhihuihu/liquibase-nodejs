import { MigrationConfig, MigrationResult, Logger, DatabaseClient, LockConfig, DialectName } from './types';
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
import * as fs from 'fs';

export async function liquibase(rawConfig: MigrationConfig): Promise<MigrationResult> {
  const config = resolveConfig(rawConfig);
  const logger = config.logger || createDefaultLogger();

  logger.info('Starting migrations', {
    dialect: config.dialect,
    changelogPath: config.changelogPath,
  });

  let client: DatabaseClient | null = null;

  try {
    client = await createDatabaseClient(config.connection, config.dialect);

    await ensureChangeLogTable(client, config.dialect);
    logger.debug('Meta tables ensured');

    const changelogResult = await parseChangelog(config.changelogPath, config.basePath!);
    logger.info(`Found ${changelogResult.sqlFiles.length} SQL files and ${changelogResult.jsFiles.length} JS files`);

    const allChangesets = [];

    for (const sqlFile of changelogResult.sqlFiles) {
      const content = fs.readFileSync(sqlFile, 'utf-8');
      const changesets = parseSqlChangesets(content, path.relative(config.basePath!, sqlFile));
      allChangesets.push(...changesets);
    }

    for (const jsFile of changelogResult.jsFiles) {
      const changesets = await loadJsChangesets(jsFile);
      allChangesets.push(...changesets);
    }

    logger.info(`Parsed ${allChangesets.length} changesets`);

    const executed = await getExecutedChangesets(client);
    const executedSet = new Set(
      executed.map((e) => `${e.filename}:${e.author}:${e.id}`)
    );

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

    const lockManager = new LockManager(
      client,
      config.lock,
      config.dialect,
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
    if (client && 'close' in client && typeof (client as any).close === 'function') {
      await (client as any).close();
    }
  }
}
