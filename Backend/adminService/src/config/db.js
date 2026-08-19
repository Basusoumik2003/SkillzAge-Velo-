import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  //ssl: { rejectUnauthorized: false }
});

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
  url.pathname = "/postgres";
  return url.toString();
}

export async function ensureDatabaseExists(connectionString, logger) {
  const databaseName = getDatabaseName(connectionString);
  const client = new pg.Client({
    connectionString: getMaintenanceConnectionString(connectionString),
  });

  try {
    await client.connect();
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );

    if (!rowCount) {
      logger?.warn?.("database:missing", { database: databaseName });
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      logger?.info?.("database:created", { database: databaseName });
    }
  } finally {
    await client.end().catch(() => {});
  }
}

