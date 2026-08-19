require('./config/env');
const app = require('./app');
const db = require('./config/db');

const PORT = process.env.PORT || 5000;

console.log('[service:start]', {
  port: PORT,
  nodeEnv: process.env.NODE_ENV,
  bypassAuth: process.env.BYPASS_AUTH,
});

(async () => {
  await db.ensureUsersSchema();
  app.listen(PORT, () => {
    console.log(`Skillzage-auth service running on port ${PORT}`);
  });
})().catch((error) => {
  console.error('[service:start_failed]', error);
  process.exit(1);
});
