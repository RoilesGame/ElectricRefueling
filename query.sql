CREATE TABLE station_data (
    id BIGSERIAL PRIMARY KEY,
    number INTEGER,
    name TEXT NOT NULL,
    balance_holder TEXT,
    adm_area TEXT,
    district TEXT,
    address TEXT
);

CREATE TABLE road_work_data (
    id BIGSERIAL PRIMARY KEY,
    number INTEGER,
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