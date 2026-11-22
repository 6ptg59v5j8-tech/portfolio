CREATE TABLE IF NOT EXISTS education (
  id TEXT PRIMARY KEY,
  qualification TEXT NOT NULL,
  institution TEXT NOT NULL,
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_education_visible_sort
  ON education(is_visible, sort_order, id);

INSERT OR IGNORE INTO education
  (id, qualification, institution, start_date, end_date, description, sort_order, is_visible)
VALUES
  ('boa-production-arts-technical', 'Production Arts (Technical)', 'BOA Stage and Screen', '', 'Currently studying', '', 1, 1);
