require('./config/env');
const app = require('./app');

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => {
  console.log(`Skillzage-profile service running on port ${PORT}`);
});
