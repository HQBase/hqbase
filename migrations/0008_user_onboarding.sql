PRAGMA foreign_keys = ON;

CREATE TABLE user_onboarding (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('email_invite', 'temporary_password')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete')),
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  invitation_sent_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX user_onboarding_status_idx
ON user_onboarding(status, method, created_at);
