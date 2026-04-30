import { describe, it, expect } from 'vitest';
import { parseSqlChangesets } from '../../src/parser/changeset-parser';

describe('parseSqlChangesets', () => {
  it('should parse a single changeset', () => {
    const sql = `--changeset huzhihui:20260506-001
--comment create users table
CREATE TABLE users (id INT PRIMARY KEY);
`;
    const changesets = parseSqlChangesets(sql, 'init.sql');
    expect(changesets).toHaveLength(1);
    expect(changesets[0].id).toBe('20260506-001');
    expect(changesets[0].author).toBe('huzhihui');
    expect(changesets[0].comment).toBe('create users table');
    expect(changesets[0].sql).toContain('CREATE TABLE users');
  });

  it('should parse multiple changesets', () => {
    const sql = `--changeset author:001
--comment first
CREATE TABLE a (id INT);

--changeset author:002
--comment second
CREATE TABLE b (id INT);
`;
    const changesets = parseSqlChangesets(sql, 'multi.sql');
    expect(changesets).toHaveLength(2);
    expect(changesets[0].id).toBe('001');
    expect(changesets[1].id).toBe('002');
  });

  it('should parse precondition comments', () => {
    const sql = `--changeset author:001
--preconditions onFail:MARK_RAN onError:HALT
--precondition-sql-check expectedResult:0 SELECT count(1) FROM users
CREATE TABLE users (id INT);
`;
    const changesets = parseSqlChangesets(sql, 'pre.sql');
    expect(changesets).toHaveLength(1);
    expect(changesets[0].preconditions).toHaveLength(1);
    expect(changesets[0].preconditions[0].type).toBe('sql-check');
    expect(changesets[0].preconditions[0].expectedResult).toBe('0');
    expect(changesets[0].preconditionOptions.onFail).toBe('MARK_RAN');
    expect(changesets[0].preconditionOptions.onError).toBe('HALT');
  });

  it('should default runInTransaction to true', () => {
    const sql = `--changeset author:001
SELECT 1;
`;
    const changesets = parseSqlChangesets(sql, 't.sql');
    expect(changesets[0].runInTransaction).toBe(true);
  });

  it('should parse runInTransaction:false', () => {
    const sql = `--changeset author:001 runInTransaction:false
SELECT 1;
`;
    const changesets = parseSqlChangesets(sql, 't.sql');
    expect(changesets[0].runInTransaction).toBe(false);
  });

  it('should throw on missing changeset marker', () => {
    const sql = `CREATE TABLE users (id INT);`;
    expect(() => parseSqlChangesets(sql, 'bad.sql')).toThrow();
  });
});
