export interface Dialect {
  getName(): string;
  getCheckTableExistsSql(tableName: string): string;
  getCheckCountSql(query: string): string;
  getCreateChangeLogTableSql(): string;
  getCreateLockTableSql(): string;
  getLockTableInitSql(): string;
  getNowSql(): string;
}
