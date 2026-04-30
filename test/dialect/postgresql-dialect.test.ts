import { describe, it, expect } from 'vitest';
import { PostgresqlDialect } from '../../src/dialect/postgresql-dialect';

describe('PostgresqlDialect', () => {
  const dialect = new PostgresqlDialect();

  it('should return correct name', () => {
    expect(dialect.getName()).toBe('postgresql');
  });

  it('should generate table exists check', () => {
    const sql = dialect.getCheckTableExistsSql('users');
    expect(sql).toContain('information_schema.tables');
    expect(sql).toContain('users');
  });

  it('should generate create changelog table SQL', () => {
    const sql = dialect.getCreateChangeLogTableSql();
    expect(sql).toContain('DATABASECHANGELOG');
    expect(sql).toContain('TIMESTAMP');
  });

  it('should use boolean type for LOCKED column', () => {
    const sql = dialect.getCreateLockTableSql();
    expect(sql).toContain('BOOLEAN');
  });
});
