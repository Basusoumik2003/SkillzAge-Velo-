const path = require('path');
const dotenv = require('dotenv');

const envFiles = [
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '.env'),
];

envFiles.forEach((envFile) => {
  dotenv.config({ path: envFile });
});

