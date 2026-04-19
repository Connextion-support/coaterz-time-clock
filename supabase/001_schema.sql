-- ============================================================================
-- COATERZ TIME CLOCK — Supabase Database Schema
-- ============================================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- This creates all tables, indexes, RLS policies, and helper functions.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. EMPLOYEES TABLE
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone         TEXT NOT NULL UNIQUE,              -- normalized 10-digit, serves as employee ID
  full_name     TEXT NOT NULL,
  department    TEXT DEFAULT '',
  hourly_rate   DECIMAL(10,2) DEFAULT NULL,
  notes         TEXT DEFAULT '',
  is_active     BOOLEAN DEFAULT TRUE,
  ghl_contact_id TEXT DEFAULT NULL,                -- GHL contact ID for cross-referencing
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employees_phone ON employees(phone);
CREATE INDEX idx_employees_ghl_contact ON employees(ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. TIME ENTRIES TABLE
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_entries (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in      TIMESTAMPTZ NOT NULL,
  clock_out     TIMESTAMPTZ DEFAULT NULL,
  hours_worked  DECIMAL(8,2) DEFAULT NULL,          -- auto-calculated on clock-out
  work_order    TEXT DEFAULT NULL,
  notes         TEXT DEFAULT '',
  is_manual     BOOLEAN DEFAULT FALSE,              -- flagged if admin manually edited
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_entries_employee ON time_entries(employee_id);
CREATE INDEX idx_time_entries_clock_in ON time_entries(clock_in DESC);
CREATE INDEX idx_time_entries_active ON time_entries(employee_id) WHERE clock_out IS NULL;
-- Composite index for report queries (employee + date range)
CREATE INDEX idx_time_entries_report ON time_entries(employee_id, clock_in DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. APP SETTINGS TABLE (key-value config store)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key           TEXT PRIMARY KEY,
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value) VALUES
  ('webhook_url', '"" '::jsonb),
  ('overtime_threshold', '40'::jsonb),
  ('admin_password_hash', '"admin"'::jsonb),   -- Change in production!
  ('company_name', '"CoaterZ"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. WEBHOOK LOG TABLE (audit trail for GHL events)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  direction     TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT DEFAULT 'success',
  error_message TEXT DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_log_created ON webhook_log(created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 5. HELPER FUNCTIONS
-- ──────────────────────────────────────────────────────────────────────────

-- Auto-calculate hours_worked on clock-out
CREATE OR REPLACE FUNCTION calculate_hours_worked()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL AND OLD.clock_out IS NULL THEN
    NEW.hours_worked := ROUND(EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0, 2);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_hours
  BEFORE UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION calculate_hours_worked();

-- Auto-update updated_at on employees
CREATE OR REPLACE FUNCTION update_employee_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_updated
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_timestamp();

-- ──────────────────────────────────────────────────────────────────────────
-- 6. VIEWS (for convenient reporting queries)
-- ──────────────────────────────────────────────────────────────────────────

-- Active clock-ins (employees currently working)
CREATE OR REPLACE VIEW active_sessions AS
SELECT
  te.id AS entry_id,
  te.employee_id,
  e.full_name,
  e.phone,
  e.department,
  te.clock_in,
  te.work_order,
  ROUND(EXTRACT(EPOCH FROM (NOW() - te.clock_in)) / 3600.0, 2) AS hours_so_far
FROM time_entries te
JOIN employees e ON e.id = te.employee_id
WHERE te.clock_out IS NULL;

-- Weekly summary per employee (current week Sun-Sat)
CREATE OR REPLACE VIEW weekly_summary AS
SELECT
  e.id AS employee_id,
  e.full_name,
  e.phone,
  e.department,
  e.hourly_rate,
  DATE_TRUNC('week', te.clock_in + INTERVAL '1 day') - INTERVAL '1 day' AS week_start,
  COUNT(te.id) AS total_entries,
  COALESCE(SUM(te.hours_worked), 0) AS total_hours,
  GREATEST(COALESCE(SUM(te.hours_worked), 0) - 40, 0) AS overtime_hours,
  LEAST(COALESCE(SUM(te.hours_worked), 0), 40) AS regular_hours
FROM time_entries te
JOIN employees e ON e.id = te.employee_id
WHERE te.clock_out IS NOT NULL
GROUP BY e.id, e.full_name, e.phone, e.department, e.hourly_rate,
         DATE_TRUNC('week', te.clock_in + INTERVAL '1 day') - INTERVAL '1 day';

-- ──────────────────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────────────
-- Using service_role key from Next.js API routes (bypasses RLS).
-- The anon key is used by the clock-in page with limited access.

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;

-- Anon can read employees (to look up by phone for clock-in)
CREATE POLICY "anon_read_employees" ON employees
  FOR SELECT USING (true);

-- Anon can read active sessions
CREATE POLICY "anon_read_entries" ON time_entries
  FOR SELECT USING (true);

-- Anon can INSERT time entries (clock in)
CREATE POLICY "anon_insert_entries" ON time_entries
  FOR INSERT WITH CHECK (true);

-- Anon can UPDATE time entries (clock out)
CREATE POLICY "anon_update_entries" ON time_entries
  FOR UPDATE USING (true);

-- Service role (used by API routes) has full access — this is default behavior
-- when using supabase.createClient with the service_role key.

-- Settings: read-only for anon
CREATE POLICY "anon_read_settings" ON app_settings
  FOR SELECT USING (true);

-- Webhook log: no anon access
CREATE POLICY "service_only_webhook_log" ON webhook_log
  FOR ALL USING (false);


-- ──────────────────────────────────────────────────────────────────────────
-- 8. SEED: Normalize phone helper (for API use)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION normalize_phone(raw TEXT)
RETURNS TEXT AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := REGEXP_REPLACE(raw, '[^0-9]', '', 'g');
  IF LENGTH(digits) = 11 AND LEFT(digits, 1) = '1' THEN
    digits := SUBSTRING(digits FROM 2);
  END IF;
  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
