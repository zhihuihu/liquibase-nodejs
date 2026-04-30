import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('liquibase (mock integration)', () => {
  it('should reject invalid changelog path', async () => {
    const { liquibase } = await import('../../src/index');
    const result = await liquibase({
      connection: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
      dialect: 'postgresql',
      changelogPath: '/nonexistent/changelog.xml',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should parse changelog and resolve files correctly', async () => {
    const { parseChangelog } = await import('../../src/parser/changelog-parser');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-'));
    fs.writeFileSync(path.join(tmpDir, '001.sql'), `--changeset test:001\n--comment test\nSELECT 1;\n`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">
  <include file="./001.sql" relativeToChangelogFile="true"/>
</databaseChangeLog>`;
    const changelogPath = path.join(tmpDir, 'changelog.xml');
    fs.writeFileSync(changelogPath, xml);

    const result = await parseChangelog(changelogPath, tmpDir);
    expect(result.sqlFiles).toHaveLength(1);
    expect(result.sqlFiles[0]).toContain('001.sql');

    fs.rmSync(tmpDir, { recursive: true });
  });
});
