require('./config/env');
const app = require('./app');

const PORT = process.env.PORT || 5000;

console.log('[service:start]', {
  port: PORT,
  nodeEnv: process.env.NODE_ENV,
  bypassAuth: process.env.BYPASS_AUTH,
});

app.listen(PORT, () => {
  console.log(`Skillzage-auth service running on port ${PORT}`);
});
