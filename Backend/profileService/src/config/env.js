const path = require('path');
const dotenv = require('dotenv');

const envFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'src', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '.env'),
];

new Set(envFiles).forEach((envFile) => {
  dotenv.config({ path: envFile });
});
