const { Pool } = require('pg');
require('./env');

/**
 * RDS requires SSL for the connection from EC2, but a local Postgres
 * instance (e.g. localhost during development) usually has no SSL
 * configured at all — forcing SSL there fails with "The server does
 * not support SSL connections". Only enable SSL for non-local hosts.
 */
function resolveSsl(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return false;
  }

  return { rejectUnauthorized: false };
}

function resolveSslFromConnectionString(connectionString) {
  try {
    return resolveSsl(new URL(connectionString).hostname);
  } catch {
    // Fall through to SSL enabled if the connection string can't be parsed.
    return { rejectUnauthorized: false };
  }
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: resolveSslFromConnectionString(process.env.DATABASE_URL),
    })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: resolveSsl(process.env.PGHOST),
    });

function logDb(step, payload) {
  console.log(`[db:${step}]`, payload);
}

pool.on('error', (err) => {
  console.error('[db:pool:error]', err);
  process.exit(1);
});

async function ensureUsersSchema() {
  await pool.query(`
    ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS wix_member_id VARCHAR(255);
  `);
}

module.exports = {
  ensureUsersSchema,

  query: async (text, params) => {
    logDb('query:start', {
      text,
      params,
    });

    try {
      const result = await pool.query(text, params);

      logDb('query:success', {
        rowCount: result.rowCount,
      });

      return result;
    } catch (err) {
      logDb('query:error', {
        message: err.message,
        code: err.code,
        text,
        params,
      });

      throw err;
    }
  },

  getClient: async () => {
    logDb('client:acquire:start', {});

    const client = await pool.connect();

    logDb('client:acquire:success', {});

    return client;
  },

  pool,
};