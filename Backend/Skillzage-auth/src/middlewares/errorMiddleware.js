/** Catches unmatched routes. */
function notFound(req, res, next) {
  console.warn('[service:route:not-found]', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
}

/** Centralized error handler - keep this registered last in app.js. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[service:error]', {
    method: req && req.method,
    path: req && req.originalUrl,
    message: err.message,
    code: err.code,
    stack: err.stack,
  });

  // Unique violation (e.g. duplicate email) from PostgreSQL
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Email is already registered' });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
  });
}

module.exports = { notFound, errorHandler };
