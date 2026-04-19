-- ============================================================================
-- COATERZ TIME CLOCK — Multi-Tenant Supabase Schema
-- ============================================================================
-- Supports multiple GHL sub-accounts (locations) under one agency.
-- Each location has isolated employees, time entries, and settings.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. LOCATIONS TABLE (one row per GHL sub-account)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_location_id TEXT NOT NULL UNIQUE,               -- GHL sub-account / location ID
  name            TEXT NOT NULL,                       -- Business name
  ghl_api_key     TEXT DEFAULT '',                    -- Sub-account API key (encrypted in prod)
  webhook_url     TEXT DEFAULT '',                    -- GHL outbound webhook URL
  overtime_threshold DECIMAL(4,1) DEFAULT 40,
  admin_password  TEXT DEFAULT 'admin',               -- Location-level admin password
  timezone        TEXT DEFAULT 'America/New_York',
  is_active       BOOLEAN DEFAULT TRUE,
  settings        JSONB DEFAULT '{}'::jsonb,          -- Extensible settings
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_locations_ghl ON locations(ghl_location_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. EMPLOYEES TABLE (scoped to location)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  phone           TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  email           TEXT DEFAULT '',
  department      TEXT DEFAULT '',
  hourly_rate     DECIMAL(10,2) DEFAULT NULL,
  notes           TEXT DEFAULT '',
  role            TEXT DEFAULT '',
  is_active       BOOLEAN DEFAULT TRUE,
  source          TEXT DEFAULT 'manual' CHECK (source IN ('ghl_user', 'manual')),
  ghl_user_id     TEXT DEFAULT NULL,
  last_synced_at  TIMESTAMPTZ DEFAULT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Phone unique per location, not globally
  UNIQUE(location_id, phone)
);

CREATE INDEX idx_employees_location ON employees(location_id);
CREATE INDEX idx_employees_phone ON employees(location_id, phone);
CREATE INDEX idx_employees_ghl_user ON employees(ghl_user_id) WHERE ghl_user_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. TIME ENTRIES TABLE (scoped to location via employee)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_entries (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id   UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in      TIMESTAMPTZ NOT NULL,
  clock_out     TIMESTAMPTZ DEFAULT NULL,
  hours_worked  DECIMAL(8,2) DEFAULT NULL,
  work_order    TEXT DEFAULT NULL,
  notes         TEXT DEFAULT '',
  is_manual     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entries_location ON time_entries(location_id);
CREATE INDEX idx_entries_employee ON time_entries(employee_id);
CREATE INDEX idx_entries_clock_in ON time_entries(location_id, clock_in DESC);
CREATE INDEX idx_entries_active ON time_entries(employee_id) WHERE clock_out IS NULL;
CREATE INDEX idx_entries_report ON time_entries(location_id, employee_id, clock_in DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. SYNC LOG TABLE
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id   UUID REFERENCES locations(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  payload       JSONB DEFAULT '{}'::jsonb,
  status        TEXT DEFAULT 'success',
  error_message TEXT DEFAULT NULL,
  users_synced  INT DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_log_location ON sync_log(location_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 5. TRIGGERS
-- ──────────────────────────────────────────────────────────────────────────

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
  FOR EACH ROW EXECUTE FUNCTION calculate_hours_worked();

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_updated
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_location_updated
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ──────────────────────────────────────────────────────────────────────────
-- 6. VIEWS
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW active_sessions AS
SELECT
  te.id AS entry_id, te.location_id, te.employee_id,
  e.full_name, e.phone, e.email, e.department, e.source,
  te.clock_in, te.work_order,
  ROUND(EXTRACT(EPOCH FROM (NOW() - te.clock_in)) / 3600.0, 2) AS hours_so_far
FROM time_entries te
JOIN employees e ON e.id = te.employee_id
WHERE te.clock_out IS NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Anon read for clock-in lookups (location_id is always required in queries)
CREATE POLICY "anon_read_locations" ON locations FOR SELECT USING (true);
CREATE POLICY "anon_read_employees" ON employees FOR SELECT USING (true);
CREATE POLICY "anon_read_entries" ON time_entries FOR SELECT USING (true);
CREATE POLICY "anon_insert_entries" ON time_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_entries" ON time_entries FOR UPDATE USING (true);
CREATE POLICY "service_only_sync_log" ON sync_log FOR ALL USING (false);

-- ──────────────────────────────────────────────────────────────────────────
-- 8. HELPER
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION normalize_phone(raw TEXT)
RETURNS TEXT AS $$
DECLARE digits TEXT;
BEGIN
  digits := REGEXP_REPLACE(raw, '[^0-9]', '', 'g');
  IF LENGTH(digits) = 11 AND LEFT(digits, 1) = '1' THEN
    digits := SUBSTRING(digits FROM 2);
  END IF;
  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
