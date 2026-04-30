import * as path from 'path';
import { glob } from 'glob';

export function resolvePath(
  basePath: string,
  filePath: string,
  changelogFilePath?: string,
): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  if (changelogFilePath && filePath.startsWith('./')) {
    const changelogDir = path.dirname(changelogFilePath);
    return path.resolve(changelogDir, filePath);
  }

  return path.resolve(basePath, filePath);
}

export async function scanDirectory(
  dirPath: string,
  pattern: string,
): Promise<string[]> {
  const files = await glob(pattern, { cwd: dirPath, nodir: true });
  return files.sort().map((f) => path.join(dirPath, f));
}
