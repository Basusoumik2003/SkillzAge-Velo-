const { validationResult } = require('express-validator');

function logValidation(step, payload) {
  console.log(`[validation:${step}]`, payload);
}

/** Runs after express-validator chains; short-circuits with 422 if any failed. */
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logValidation('failed', {
      path: req.originalUrl,
      method: req.method,
      body: req.body,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg, value: e.value })),
    });
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  logValidation('passed', {
    path: req.originalUrl,
    method: req.method,
    body: req.body,
  });
  next();
}

module.exports = validateRequest;
