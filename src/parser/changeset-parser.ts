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

    // Skip other comment lines
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
