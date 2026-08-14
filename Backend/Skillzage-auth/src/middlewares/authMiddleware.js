const { verifyToken } = require('../utils/jwt');

/** Protects routes by requiring a valid "Authorization: Bearer <token>" header. */
function requireAuth(req, res, next) {
  
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Authentication token missing' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
