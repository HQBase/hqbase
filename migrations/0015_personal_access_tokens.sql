PRAGMA foreign_keys = ON;

CREATE TABLE personal_access_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  token_hash TEXT NOT NULL UNIQUE
    CHECK (length(token_hash) = 43 AND token_hash NOT GLOB '*[^A-Za-z0-9_-]*'),
  token_suffix TEXT NOT NULL
    CHECK (length(token_suffix) = 4 AND token_suffix NOT GLOB '*[^A-Za-z0-9_-]*'),
  created_at TEXT NOT NULL
    CHECK (length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  expires_at TEXT
    CHECK (expires_at IS NULL OR (length(expires_at) = 24 AND substr(expires_at, 24, 1) = 'Z')),
  revoked_at TEXT
    CHECK (revoked_at IS NULL OR (length(revoked_at) = 24 AND substr(revoked_at, 24, 1) = 'Z'))
);

CREATE INDEX personal_access_tokens_user_idx
ON personal_access_tokens(user_id, created_at DESC);

CREATE INDEX personal_access_tokens_list_idx
ON personal_access_tokens(created_at DESC, id DESC);
