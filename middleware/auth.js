const admin = require('../services/firebaseAdmin');

const checkAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  if (!admin || !admin.auth) {
    console.error('Auth middleware: firebase admin not initialized');
    return res.status(500).json({ error: 'Server misconfiguration: auth backend unavailable' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // attach token and useful convenience fields
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      token: decodedToken,
    };
    return next();
  } catch (error) {
    console.warn('Auth verify failed:', error && error.message ? error.message : error);
    return res.status(403).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

module.exports = checkAuth;
