/**
 * JS/TS 迁移示例
 *
 * 支持两种导出方式：
 * - default export: 单个 changeset
 * - named export: 多个 changeset
 */

// 默认导出：单个 changeset
export default {
  id: '007',
  author: 'huzhihui',
  comment: '使用 JS 迁移添加用户字段',
  preconditions: [],
  preconditionOptions: { onFail: 'HALT', onError: 'HALT' },
  runInTransaction: true,
  failOnError: true,
  async execute(db) {
    const { rows } = await db.query(`
      SELECT COUNT(*) as cnt FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'phone'
    `);
    const exists = rows[0].cnt > 0;
    if (!exists) {
      await db.query(`ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL`);
    }
  },
};
