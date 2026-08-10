/**
 * Lightweight SQL migration runner.
 *
 * Reads .sql files from this folder in filename order. Each file must contain
 * a "-- +up" section and a "-- +down" section. Applied migrations are
 * tracked in the `schema_migrations` table so re-running is safe.
 *
 * Usage:
 *   node migrations/migrate.js up      Apply all pending migrations
 *   node migrations/migrate.js down    Roll back the most recently applied migration
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      }
);

const MIGRATIONS_DIR = __dirname;

function loadMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function splitUpDown(sql) {
  const upMarker = '-- +up';
  const downMarker = '-- +down';
  const upIndex = sql.indexOf(upMarker);
  const downIndex = sql.indexOf(downMarker);

  if (upIndex === -1 || downIndex === -1) {
    throw new Error('Migration file must contain both "-- +up" and "-- +down" markers');
  }

  const up = sql.slice(upIndex + upMarker.length, downIndex).trim();
  const down = sql.slice(downIndex + downMarker.length).trim();
  return { up, down };
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY id ASC');
  return rows.map((r) => r.name);
}

async function up() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = loadMigrationFiles();
    const pending = files.filter((f) => !applied.includes(f));

    if (pending.length === 0) {
      console.log('No pending migrations. Database is up to date.');
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const { up: upSql } = splitUpDown(sql);

      console.log(`Applying migration: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(upSql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  -> applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    if (applied.length === 0) {
      console.log('No migrations to roll back.');
      return;
    }

    const lastFile = applied[applied.length - 1];
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, lastFile), 'utf8');
    const { down: downSql } = splitUpDown(sql);

    console.log(`Rolling back migration: ${lastFile}`);
    await client.query('BEGIN');
    try {
      await client.query(downSql);
      await client.query('DELETE FROM schema_migrations WHERE name = $1', [lastFile]);
      await client.query('COMMIT');
      console.log('  -> rolled back');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}

async function main() {
  const command = process.argv[2];

  try {
    if (command === 'up') {
      await up();
    } else if (command === 'down') {
      await down();
    } else {
      console.log('Usage: node migrations/migrate.js <up|down>');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
