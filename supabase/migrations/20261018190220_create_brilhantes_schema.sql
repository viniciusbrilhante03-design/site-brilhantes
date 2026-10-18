-- Brilhante's Imóveis - Full schema from MongoDB backup
-- Using JSONB for complex nested fields to preserve exact structure

-- USERS
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  picture TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  active BOOLEAN DEFAULT TRUE,
  manual BOOLEAN DEFAULT FALSE,
  cpf TEXT DEFAULT '',
  creci TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  war_name TEXT DEFAULT '',
  ranking_opt_out BOOLEAN DEFAULT FALSE,
  token_version INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BROKERS
CREATE TABLE brokers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  war_name TEXT DEFAULT '',
  full_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  creci TEXT DEFAULT '',
  email TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SALES
CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  owner_id TEXT DEFAULT '',
  owner_name TEXT DEFAULT '',
  property_name TEXT DEFAULT '',
  quadra TEXT DEFAULT '',
  lote TEXT DEFAULT '',
  client_name TEXT DEFAULT '',
  client_phone TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  client_cpf TEXT DEFAULT '',
  client_birthdate TEXT DEFAULT '',
  client_has_spouse BOOLEAN DEFAULT FALSE,
  client_spouse JSONB,
  client_origin TEXT DEFAULT '',
  client_origin_other TEXT DEFAULT '',
  client_notes TEXT DEFAULT '',
  client_id TEXT DEFAULT '',
  broker_name TEXT DEFAULT '',
  broker_ids JSONB DEFAULT '[]',
  brokers JSONB DEFAULT '[]',
  sale_date TEXT DEFAULT '',
  sale_value DOUBLE PRECISION DEFAULT 0,
  commission_rate DOUBLE PRECISION DEFAULT 0,
  commission_value DOUBLE PRECISION DEFAULT 0,
  commission_base TEXT DEFAULT 'sale',
  commission_gross DOUBLE PRECISION DEFAULT 0,
  commission_net DOUBLE PRECISION DEFAULT 0,
  commission_received BOOLEAN DEFAULT FALSE,
  commission_received_at TEXT,
  broker_split DOUBLE PRECISION DEFAULT 60.0,
  broker_commission DOUBLE PRECISION DEFAULT 0,
  agency_commission DOUBLE PRECISION DEFAULT 0,
  financed_value DOUBLE PRECISION DEFAULT 0,
  discounts JSONB DEFAULT '[]',
  entrada DOUBLE PRECISION DEFAULT 0,
  parcelado BOOLEAN DEFAULT FALSE,
  installments JSONB DEFAULT '[]',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SALES_HISTORY (deleted sales)
CREATE TABLE sales_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  owner_id TEXT DEFAULT '',
  owner_name TEXT DEFAULT '',
  property_name TEXT DEFAULT '',
  quadra TEXT DEFAULT '',
  lote TEXT DEFAULT '',
  client_name TEXT DEFAULT '',
  client_phone TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  client_cpf TEXT DEFAULT '',
  client_birthdate TEXT DEFAULT '',
  client_has_spouse BOOLEAN DEFAULT FALSE,
  client_spouse JSONB,
  client_origin TEXT DEFAULT '',
  client_origin_other TEXT DEFAULT '',
  client_notes TEXT DEFAULT '',
  client_id TEXT DEFAULT '',
  broker_name TEXT DEFAULT '',
  broker_ids JSONB DEFAULT '[]',
  brokers JSONB DEFAULT '[]',
  sale_date TEXT DEFAULT '',
  sale_value DOUBLE PRECISION DEFAULT 0,
  commission_rate DOUBLE PRECISION DEFAULT 0,
  commission_value DOUBLE PRECISION DEFAULT 0,
  commission_base TEXT DEFAULT 'sale',
  commission_gross DOUBLE PRECISION DEFAULT 0,
  commission_net DOUBLE PRECISION DEFAULT 0,
  commission_received BOOLEAN DEFAULT FALSE,
  commission_received_at TEXT,
  broker_split DOUBLE PRECISION DEFAULT 60.0,
  broker_commission DOUBLE PRECISION DEFAULT 0,
  agency_commission DOUBLE PRECISION DEFAULT 0,
  financed_value DOUBLE PRECISION DEFAULT 0,
  discounts JSONB DEFAULT '[]',
  entrada DOUBLE PRECISION DEFAULT 0,
  parcelado BOOLEAN DEFAULT FALSE,
  installments JSONB DEFAULT '[]',
  notes TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT DEFAULT '',
  deleted_by_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SALE_AUDIT
CREATE TABLE sale_audit (
  id TEXT PRIMARY KEY,
  action TEXT DEFAULT '',
  sale_id TEXT DEFAULT '',
  property_name TEXT DEFAULT '',
  quadra TEXT DEFAULT '',
  lote TEXT DEFAULT '',
  client_name TEXT DEFAULT '',
  broker_name TEXT DEFAULT '',
  sale_value DOUBLE PRECISION DEFAULT 0,
  detail TEXT DEFAULT '',
  by TEXT DEFAULT '',
  by_id TEXT DEFAULT '',
  at TIMESTAMPTZ DEFAULT NOW()
);

-- CLIENTS
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  name_key TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  cpf TEXT DEFAULT '',
  cpf_key TEXT DEFAULT '',
  birthdate TEXT DEFAULT '',
  has_spouse BOOLEAN DEFAULT FALSE,
  spouse JSONB,
  origin TEXT DEFAULT '',
  origin_other TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOTEAMENTOS
CREATE TABLE loteamentos (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  name_lower TEXT DEFAULT '',
  ai_training TEXT DEFAULT '',
  copy TEXT DEFAULT '',
  copies JSONB DEFAULT '[]',
  fields JSONB DEFAULT '[]',
  specs JSONB DEFAULT '{}',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  details_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOT_IMAGES
CREATE TABLE lot_images (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL,
  type TEXT DEFAULT '',
  filename TEXT DEFAULT '',
  content_type TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOT_DOCS
CREATE TABLE lot_docs (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  category TEXT DEFAULT '',
  filename TEXT DEFAULT '',
  content_type TEXT DEFAULT '',
  size BIGINT DEFAULT 0,
  storage_path TEXT DEFAULT '',
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GOALS
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  scope TEXT DEFAULT 'company',
  owner_id TEXT DEFAULT '',
  metric TEXT DEFAULT 'vgv',
  target DOUBLE PRECISION DEFAULT 0,
  month INTEGER,
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BROKER_GROUPS
CREATE TABLE broker_groups (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  members JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- APP_SETTINGS
CREATE TABLE app_settings (
  id TEXT PRIMARY KEY,
  usage JSONB DEFAULT '{}'
);

-- NOTIFICATIONS
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT DEFAULT '',
  message TEXT DEFAULT '',
  read BOOLEAN DEFAULT FALSE,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_brokers_user_id ON brokers(user_id);
CREATE INDEX idx_sales_user_id ON sales(user_id);
CREATE INDEX idx_sales_owner_id ON sales(owner_id);
CREATE INDEX idx_sales_sale_date ON sales(sale_date);
CREATE INDEX idx_sales_client_id ON sales(client_id);
CREATE INDEX idx_sales_history_user_id ON sales_history(user_id);
CREATE INDEX idx_sale_audit_sale_id ON sale_audit(sale_id);
CREATE INDEX idx_clients_name_key ON clients(name_key);
CREATE INDEX idx_clients_cpf_key ON clients(cpf_key);
CREATE INDEX idx_loteamentos_name_lower ON loteamentos(name_lower);
CREATE INDEX idx_lot_images_lot_id ON lot_images(lot_id);
CREATE INDEX idx_lot_docs_lot_id ON lot_docs(lot_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE loteamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Since this app has its own auth (JWT cookies with user_id), and the frontend
-- talks to a FastAPI backend that handles auth, we allow anon+authenticated access.
-- The backend enforces ownership scoping via user_id/owner_id.
CREATE POLICY "read_all" ON users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_users" ON users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_brokers" ON brokers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_brokers" ON brokers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_sales" ON sales FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_sales" ON sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_sales_history" ON sales_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_sales_history" ON sales_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_sale_audit" ON sale_audit FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_sale_audit" ON sale_audit FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_clients" ON clients FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_clients" ON clients FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_loteamentos" ON loteamentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_loteamentos" ON loteamentos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_lot_images" ON lot_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_lot_images" ON lot_images FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_lot_docs" ON lot_docs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_lot_docs" ON lot_docs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_goals" ON goals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_goals" ON goals FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_broker_groups" ON broker_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_broker_groups" ON broker_groups FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_app_settings" ON app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_app_settings" ON app_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_all_notifications" ON notifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_all_notifications" ON notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
