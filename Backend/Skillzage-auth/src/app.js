const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

function summarizeRequest(req) {
  return {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
  };
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use((req, res, next) => {
  console.log('[service:http:incoming]', summarizeRequest(req));
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log('[service:http:completed]', {
      ...summarizeRequest(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

app.get('/health', (req, res) => res.status(200).json({ success: true, message: 'OK' }));

app.use('/api/auth', authRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
