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
