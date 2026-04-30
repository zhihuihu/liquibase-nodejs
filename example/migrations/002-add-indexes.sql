--changeset huzhihui:002-add-indexes
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_published ON posts(published);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email ON users(email);
