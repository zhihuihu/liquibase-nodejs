import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { resolvePath, scanDirectory } from '../utils/file-resolver';

export interface ChangelogResult {
  sqlFiles: string[];
  jsFiles: string[];
}

export async function parseChangelog(
  changelogPath: string,
  basePath: string,
): Promise<ChangelogResult> {
  if (!fs.existsSync(changelogPath)) {
    throw new Error(`Changelog file not found: ${changelogPath}`);
  }

  const xmlContent = fs.readFileSync(changelogPath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const parsed = parser.parse(xmlContent);
  const root = parsed.databaseChangeLog;

  if (!root) {
    throw new Error('Invalid changelog: missing databaseChangeLog root element');
  }

  const sqlFiles: string[] = [];
  const jsFiles: string[] = [];

  const includes = normalizeArray(root.include);
  const includeAlls = normalizeArray(root.includeAll);

  // Process single includes
  for (const include of includes) {
    const filePath = include['@_file'];
    if (!filePath) continue;

    const relativeToChangelogFile = include['@_relativeToChangelogFile'] === 'true';
    const resolvedPath = relativeToChangelogFile
      ? resolvePath(basePath, filePath, changelogPath)
      : resolvePath(basePath, filePath);

    if (filePath.endsWith('.sql')) {
      sqlFiles.push(resolvedPath);
    } else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      jsFiles.push(resolvedPath);
    }
  }

  // Process includeAll
  for (const includeAll of includeAlls) {
    const dirPath = includeAll['@_path'];
    if (!dirPath) continue;

    const relativeToChangelogFile = includeAll['@_relativeToChangelogFile'] === 'true';
    const resolvedDir = relativeToChangelogFile
      ? resolvePath(basePath, dirPath, changelogPath)
      : resolvePath(basePath, dirPath);

    if (!fs.existsSync(resolvedDir)) {
      throw new Error(`includeAll directory not found: ${resolvedDir}`);
    }

    const foundSqlFiles = await scanDirectory(resolvedDir, '*.sql');
    sqlFiles.push(...foundSqlFiles);
  }

  return { sqlFiles, jsFiles };
}

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
