const admin = require('firebase-admin');
const config = require('../config');

function initAdmin() {
  if (admin.apps && admin.apps.length) return admin;

  try {
    const serviceAccount = require(config.firebaseServiceAccountPath);
    const initOpts = { credential: admin.credential.cert(serviceAccount) };
    if (config.firebaseStorageBucket) initOpts.storageBucket = config.firebaseStorageBucket;

    admin.initializeApp(initOpts);
    admin.__projectId = (serviceAccount && serviceAccount.project_id) || null;
    admin.__bucketCandidates = initOpts.storageBucket ? [initOpts.storageBucket] : [];
    console.log('Firebase admin initialized', initOpts.storageBucket ? `using storage bucket: ${initOpts.storageBucket}` : 'no storage bucket configured');
  } catch (err) {
    console.warn('Firebase admin init failed:', err && err.message ? err.message : err);
    if (!admin.apps.length) {
      try { admin.initializeApp(); } catch (e) { /* ignore */ }
    }
  }

  return admin;
}

module.exports = initAdmin();
