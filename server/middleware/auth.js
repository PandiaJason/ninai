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

    jwt.verify(token, secret, { algorithms: ['HS256'] }, (err, user) => {
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

/**
 * Requires a role that the server itself decided.
 *
 * The role is written into the token at sign-in from the users table (or the
 * ADMIN_EMAILS list), so this is enforced on the server and cannot be
 * widened by anything the client sends.
 */
export const requireRole = (role) => (req, res, next) => {
    if (!req.user || req.user.role !== role) {
        return res.status(403).json({ error: 'Access denied: This action needs administrator rights.' });
    }
    next();
};
