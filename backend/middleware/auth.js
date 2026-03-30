const jwt = require('jsonwebtoken');
const blacklist = require('./tokenBlacklist');
require('dotenv').config();

/**
 * verify(...roles)
 *   verify()                  → any valid JWT (any role)
 *   verify('admin')           → admin only
 *   verify('teacher','admin') → teacher or admin
 */
module.exports.verify = (...allowedRoles) => (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    // Explicitly enforce HS256 — prevents algorithm-confusion attacks
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Check token blacklist (logout)
    if (decoded.jti && blacklist.has(decoded.jti)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
      return res.status(403).json({ error: `Forbidden: requires ${allowedRoles.join(' or ')} role` });
    }
    req.user = decoded;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    res.status(401).json({ error: msg });
  }
};
