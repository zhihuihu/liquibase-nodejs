--changeset huzhihui:006
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:0 SELECT COUNT(*) FROM users
--comment 插入种子数据
INSERT INTO users (username, email) VALUES
  ('张三', 'zhangsan@example.com'),
  ('李四', 'lisi@example.com'),
  ('王五', 'wangwu@example.com');

INSERT INTO posts (user_id, title, content, published) VALUES
  (1, 'Hello World', '这是我的第一篇文章', TRUE),
  (1, 'TypeScript 最佳实践', 'TypeScript 是一种强类型语言...', FALSE),
  (2, 'Node.js 入门指南', 'Node.js 是一个运行时环境...', TRUE);

INSERT INTO tags (name) VALUES
  ('TypeScript'),
  ('Node.js'),
  ('教程');

INSERT INTO post_tags (post_id, tag_id) VALUES
  (1, 3),
  (2, 1),
  (2, 3),
  (3, 2),
  (3, 3);
