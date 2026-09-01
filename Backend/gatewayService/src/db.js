import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

/**
 * RDS requires SSL for the connection from EC2, but a local Postgres
 * instance (e.g. localhost during development) usually has no SSL
 * configured at all — forcing SSL there fails with "The server does
 * not support SSL connections". Only enable SSL for non-local hosts.
 */
function resolveSsl(connectionString) {
  try {
    const { hostname } = new URL(connectionString);

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return false;
    }
  } catch {
    // Fall through to SSL enabled if the connection string can't be parsed.
  }

  return { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: resolveSsl(config.databaseUrl),
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
    ssl: resolveSsl(connectionString),
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