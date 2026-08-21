import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

/**
 * PostgreSQL connection pool
 *
 * RDS requires SSL for the connection from EC2.
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,

  ssl: {
    rejectUnauthorized: false,
  },
});

export async function ensureThemeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      slug VARCHAR(170) NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      start_date TIMESTAMPTZ,
      end_date TIMESTAMPTZ,
      category VARCHAR(80) NOT NULL DEFAULT 'Seasonal',
      thumbnail_url TEXT NOT NULL DEFAULT '',
      tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS theme_settings (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      theme_id INTEGER NOT NULL UNIQUE REFERENCES themes(id) ON DELETE CASCADE,
      show_top_decoration BOOLEAN NOT NULL DEFAULT TRUE,
      show_bottom_decoration BOOLEAN NOT NULL DEFAULT TRUE,
      show_side_decorations BOOLEAN NOT NULL DEFAULT TRUE,
      show_banner BOOLEAN NOT NULL DEFAULT TRUE,
      show_popup BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS theme_assets (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      asset_type VARCHAR(40) NOT NULL,
      page VARCHAR(40) NOT NULL DEFAULT 'global',
      file_url TEXT NOT NULL DEFAULT '',
      alt_text VARCHAR(255) NOT NULL DEFAULT '',
      asset_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS theme_decorations (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      page VARCHAR(40) NOT NULL DEFAULT 'global',
      position VARCHAR(40) NOT NULL DEFAULT 'floating',
      width INTEGER NOT NULL DEFAULT 160,
      height INTEGER,
      z_index INTEGER NOT NULL DEFAULT 70,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      asset_id INTEGER,
      placement_slot VARCHAR(40) NOT NULL DEFAULT 'floating',
      offset_x INTEGER NOT NULL DEFAULT 0,
      offset_y INTEGER NOT NULL DEFAULT 0,
      desktop_visible BOOLEAN NOT NULL DEFAULT TRUE,
      tablet_visible BOOLEAN NOT NULL DEFAULT TRUE,
      mobile_visible BOOLEAN NOT NULL DEFAULT TRUE,
      animation_type VARCHAR(40) NOT NULL DEFAULT 'none',
      animation_duration_ms INTEGER NOT NULL DEFAULT 2800,
      animation_amplitude INTEGER NOT NULL DEFAULT 10,
      blend_light_background BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_themes_active
      ON themes(is_active, status);

    CREATE INDEX IF NOT EXISTS ix_theme_assets_theme_id
      ON theme_assets(theme_id);

    CREATE INDEX IF NOT EXISTS ix_theme_decorations_theme_id
      ON theme_decorations(theme_id);
  `);
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function getDatabaseName(connectionString) {
  const url = new URL(connectionString);

  const name = url.pathname.replace(/^\/+/, "");

  return name || "postgres";
}

function getMaintenanceConnectionString(connectionString) {
  const url = new URL(connectionString);

  // Connect to the default postgres database
  // when checking/creating the application database.
  url.pathname = "/postgres";

  return url.toString();
}

export async function ensureDatabaseExists(connectionString, logger) {
  const databaseName = getDatabaseName(connectionString);

  const client = new pg.Client({
    connectionString: getMaintenanceConnectionString(connectionString),

    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();

    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );

    if (!rowCount) {
      logger?.warn?.("database:missing", {
        database: databaseName,
      });

      await client.query(
        `CREATE DATABASE ${quoteIdentifier(databaseName)}`
      );

      logger?.info?.("database:created", {
        database: databaseName,
      });
    }
  } finally {
    await client.end().catch(() => {});
  }
}