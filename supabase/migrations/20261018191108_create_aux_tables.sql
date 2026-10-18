-- Auxiliary tables for the full Brilhante's Imóveis schema

-- USER_SESSIONS (Google OAuth + JWT sessions)
CREATE TABLE user_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOGIN_ATTEMPTS (rate limiting / brute-force protection)
CREATE TABLE login_attempts (
  id SERIAL PRIMARY KEY,
  identifier TEXT,
  email TEXT,
  attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_login_attempts_identifier ON login_attempts(identifier);
CREATE INDEX idx_login_attempts_email ON login_attempts(email);

-- PASSWORD_RESET_REQUESTS (rate limiting for forgot-password, 15 min TTL)
CREATE TABLE password_reset_requests (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_password_reset_requests_email ON password_reset_requests(email, created_at);

-- PASSWORD_RESET_TOKENS (one-time reset tokens)
CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  used BOOLEAN DEFAULT FALSE
);

-- APPOINTMENTS (calendar/agenda)
CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  owner_id TEXT DEFAULT '',
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  date TEXT DEFAULT '',
  time TEXT DEFAULT '',
  duration INTEGER DEFAULT 30,
  done BOOLEAN DEFAULT FALSE,
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_date ON appointments(date);

-- LOT_VIDEOS
CREATE TABLE lot_videos (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  type TEXT DEFAULT 'link',
  url TEXT DEFAULT '',
  storage_path TEXT DEFAULT '',
  filename TEXT DEFAULT '',
  content_type TEXT DEFAULT '',
  size BIGINT DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lot_videos_lot_id ON lot_videos(lot_id);

-- COMM_RECEIPTS (commission payment receipts)
CREATE TABLE comm_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sale_id TEXT DEFAULT '',
  installment_number INTEGER,
  storage_path TEXT DEFAULT '',
  filename TEXT DEFAULT '',
  content_type TEXT DEFAULT '',
  size BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ATTACHMENTS (per-sale file attachments, base64 in DB)
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  filename TEXT DEFAULT '',
  content_type TEXT DEFAULT '',
  size BIGINT DEFAULT 0,
  data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_attachments_sale_id ON attachments(sale_id);

-- CRON_RUNS (idempotency log for cron webhooks)
CREATE TABLE cron_runs (
  run_id TEXT PRIMARY KEY,
  cron_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAUTH_STATES (Google Calendar OAuth state tokens)
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to existing tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar JSONB;

ALTER TABLE loteamentos ADD COLUMN IF NOT EXISTS knowledge JSONB DEFAULT '[]';
ALTER TABLE loteamentos ADD COLUMN IF NOT EXISTS questions JSONB DEFAULT '[]';
ALTER TABLE loteamentos ADD COLUMN IF NOT EXISTS visible_tabs JSONB DEFAULT '[]';
ALTER TABLE loteamentos ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT '';
ALTER TABLE loteamentos ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_reason TEXT DEFAULT '';

ALTER TABLE sales_history ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE sales_history ADD COLUMN IF NOT EXISTS cancelled_at TEXT;
ALTER TABLE sales_history ADD COLUMN IF NOT EXISTS cancelled_reason TEXT DEFAULT '';

-- Enable RLS on all new tables
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Same open policies as before (backend handles auth/ownership)
CREATE POLICY "read_all_user_sessions" ON user_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_login_attempts" ON login_attempts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_password_reset_requests" ON password_reset_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_password_reset_tokens" ON password_reset_tokens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_appointments" ON appointments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_lot_videos" ON lot_videos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_comm_receipts" ON comm_receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_attachments" ON attachments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_cron_runs" ON cron_runs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_all_oauth_states" ON oauth_states FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);