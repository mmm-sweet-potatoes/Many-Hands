const admin = require('firebase-admin');
const config = require('../config');

function initAdmin() {
  if (admin.apps && admin.apps.length) return admin;

  try {
    const serviceAccount = require(config.firebaseServiceAccountPath);
    const initOpts = { credential: admin.credential.cert(serviceAccount) };

    admin.initializeApp(initOpts);
    admin.__projectId = (serviceAccount && serviceAccount.project_id) || null;
    admin.__bucketCandidates = [];
    console.log('Firebase admin initialized');
  } catch (err) {
    console.warn('Firebase admin init failed:', err && err.message ? err.message : err);
    if (!admin.apps.length) {
      try { admin.initializeApp(); } catch (e) { /* ignore */ }
    }
  }

  return admin;
}

module.exports = initAdmin();
