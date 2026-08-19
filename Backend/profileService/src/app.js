const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const profileRoutes = require('./routes/profileRoutes');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  return res.status(200).json({ success: true, message: 'OK' });
});

app.use('/api/profile', profileRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
