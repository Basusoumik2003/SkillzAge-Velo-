const { Pool } = require('pg');
require('./env');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: {
        rejectUnauthorized: false,
      },
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