import { describe, it, expect } from 'vitest';
import { MysqlDialect } from '../../src/dialect/mysql-dialect';

describe('MysqlDialect', () => {
  const dialect = new MysqlDialect();

  it('should return correct name', () => {
    expect(dialect.getName()).toBe('mysql');
  });

  it('should generate table exists check', () => {
    const sql = dialect.getCheckTableExistsSql('users');
    expect(sql).toContain('information_schema.tables');
    expect(sql).toContain('users');
  });

  it('should generate count query', () => {
    const sql = dialect.getCheckCountSql('SELECT count(1) FROM users');
    expect(sql).toBe('SELECT count(1) FROM users');
  });

  it('should generate create changelog table SQL', () => {
    const sql = dialect.getCreateChangeLogTableSql();
    expect(sql).toContain('DATABASECHANGELOG');
    expect(sql).toContain('ID');
    expect(sql).toContain('MD5SUM');
  });

  it('should generate create lock table SQL', () => {
    const sql = dialect.getCreateLockTableSql();
    expect(sql).toContain('DATABASECHANGELOGLOCK');
    expect(sql).toContain('LOCKED');
  });

  it('should generate lock table init SQL', () => {
    const sql = dialect.getLockTableInitSql();
    expect(sql).toContain('INSERT');
    expect(sql).toContain('DATABASECHANGELOGLOCK');
  });
});
