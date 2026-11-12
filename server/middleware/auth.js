import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied: Authentication token required.' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server misconfiguration: Authentication secret missing.' });
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired: Please sign in again.' });
      }
      return res.status(403).json({ error: 'Access denied: Invalid authentication token.' });
    }
    req.user = user;
    next();
  });
};
