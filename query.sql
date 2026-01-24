DROP TABLE IF EXISTS station_data;
DROP TABLE IF EXISTS road_work_data;

CREATE TABLE station_data (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  station_name TEXT,
  power TEXT,
  balance_holder TEXT,
  adm_area TEXT,
  district TEXT,
  address TEXT
);

CREATE TABLE road_work_data (
  id BIGSERIAL PRIMARY KEY,
  works_type TEXT,
  works_place TEXT,
  work_year INTEGER,
  on_territory_of_moscow TEXT,
  adm_area TEXT,
  district TEXT,
  works_begin_date TEXT,
  planned_end_date TEXT,
  actual_begin_date TEXT,
  actual_end_date TEXT,
  works_status TEXT,
  work_reason TEXT,
  customer TEXT,
  contractor TEXT
);

CREATE TABLE IF NOT EXISTS plug_power_range (
    plug_type TEXT PRIMARY KEY,
    min_power_kw INTEGER NOT NULL,
    max_power_kw INTEGER NOT NULL,
    CHECK (min_power_kw >= 0),
    CHECK (max_power_kw >= min_power_kw)
);

INSERT INTO plug_power_range (plug_type, min_power_kw, max_power_kw) VALUES
    ('GBT_AC', 0, 7),
    ('GBT_DC', 60, 500),
    ('CCS', 60, 250),
    ('CHADEMO', 60, 200),
    ('TESLA', 60, 250);