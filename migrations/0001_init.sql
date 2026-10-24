-- One row per city. Lighting a diya is a single upsert into this table,
-- which is the only database write the app makes per person.
-- WITHOUT ROWID keeps it to one B-tree, so there is no extra index row per write.
CREATE TABLE IF NOT EXISTS cities (
  key     TEXT PRIMARY KEY,       -- "IN|Pune"
  city    TEXT NOT NULL,          -- "" when Cloudflare can't place the request
  country TEXT NOT NULL,          -- ISO code, "XX" when unknown
  lat     REAL,                   -- rounded to ~10 km; NULL when unknown
  lon     REAL,
  n       INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- A single cached copy of the map data, rebuilt by the cron trigger.
-- Opening the map reads this one row instead of scanning every city.
CREATE TABLE IF NOT EXISTS snapshot (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  json       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
