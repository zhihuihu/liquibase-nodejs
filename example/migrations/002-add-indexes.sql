--changeset huzhihui:005
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:0 SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'posts' AND index_name = 'idx_posts_user_id'
--comment 添加索引
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_published ON posts(published);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email ON users(email);
