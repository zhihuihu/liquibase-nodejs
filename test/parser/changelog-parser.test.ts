import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseChangelog } from '../../src/parser/changelog-parser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('parseChangelog', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should parse single include file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'init.sql'), '-- empty');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <include file="./init.sql" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.sqlFiles).toHaveLength(1);
    expect(result.sqlFiles[0]).toContain('init.sql');
    expect(result.jsFiles).toHaveLength(0);
  });

  it('should parse includeAll for SQL files', async () => {
    const migrationsDir = path.join(tmpDir, 'migrations');
    fs.mkdirSync(migrationsDir);
    fs.writeFileSync(path.join(migrationsDir, '001.sql'), '-- empty');
    fs.writeFileSync(path.join(migrationsDir, '002.sql'), '-- empty');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <includeAll path="./migrations" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.sqlFiles).toHaveLength(2);
    expect(result.sqlFiles[0]).toContain('001.sql');
    expect(result.sqlFiles[1]).toContain('002.sql');
  });

  it('should parse JS file includes', async () => {
    fs.writeFileSync(path.join(tmpDir, 'custom.js'), 'module.exports = {}');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <include file="./custom.js" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.jsFiles).toHaveLength(1);
    expect(result.jsFiles[0]).toContain('custom.js');
  });

  it('should throw on missing changelog file', async () => {
    await expect(parseChangelog('/nonexistent/changelog.xml', tmpDir)).rejects.toThrow();
  });
});
