import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolvePath, scanDirectory } from '../../src/utils/file-resolver';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('resolvePath', () => {
  it('should resolve relative path against base', () => {
    const result = resolvePath('/project', './sql/init.sql');
    expect(result).toBe(path.resolve('/project', 'sql', 'init.sql'));
  });

  it('should use absolute path directly', () => {
    const absPath = path.resolve('/absolute/sql/init.sql');
    const result = resolvePath('/project', absPath);
    expect(result).toBe(absPath);
  });

  it('should resolve relative to changelog file when specified', () => {
    const result = resolvePath('/project', './migrations/001.sql', '/project/config/changelog.xml');
    expect(result).toBe(path.resolve('/project', 'config', 'migrations', '001.sql'));
  });
});

describe('scanDirectory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-resolver-'));
    fs.writeFileSync(path.join(tmpDir, '001.sql'), '');
    fs.writeFileSync(path.join(tmpDir, '002.sql'), '');
    fs.writeFileSync(path.join(tmpDir, '003.txt'), '');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should find all .sql files sorted alphabetically', async () => {
    const files = await scanDirectory(tmpDir, '*.sql');
    expect(files).toEqual([
      path.join(tmpDir, '001.sql'),
      path.join(tmpDir, '002.sql'),
    ]);
  });

  it('should return empty array for non-matching pattern', async () => {
    const files = await scanDirectory(tmpDir, '*.xml');
    expect(files).toEqual([]);
  });
});
