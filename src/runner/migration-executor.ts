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

        return {
          id: changeset.id,
          author: changeset.author,
          filename: changeset.filename,
          status: 'failed',
          reason: `Precondition failed: ${precondResult.reason}`,
          duration: Date.now() - startTime,
        };
      }

      if (changeset.type === 'sql') {
        await this.executeSql(changeset);
      } else {
        await this.executeJs(changeset);
      }

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

  private async executeSql(changeset: import('../types').SqlChangeset): Promise<void> {
    if (changeset.runInTransaction) {
      await this.client.transaction(async (tx) => {
        await tx.query(changeset.sql);
      });
    } else {
      await this.client.query(changeset.sql);
    }
  }

  private async executeJs(changeset: import('../types').JsChangeset): Promise<void> {
    if (changeset.runInTransaction) {
      await this.client.transaction(async (tx) => {
        await changeset.execute(tx);
      });
    } else {
      await changeset.execute(this.client);
    }
  }
}
