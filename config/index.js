const fs = require('fs');
const path = require('path');
require('dotenv').config();

function loadClientConfig() {
  const candidates = [
    path.join(__dirname, '..', 'public', 'firebase-config.json'),
    path.join(__dirname, '..', 'firebase-web-config.json'),
    path.join(__dirname, '..', 'firebase-config.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return require(p); } catch (e) { /* ignore */ }
    }
  }
  // also allow JSON string in env
  if (process.env.FIREBASE_WEB_CONFIG) {
    try { return JSON.parse(process.env.FIREBASE_WEB_CONFIG); } catch (e) { return null; }
  }
  return null;
}

const clientConfig = loadClientConfig();

module.exports = {
  port: process.env.PORT || 3000,
  firebaseServiceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'firebase-service-account.json'),
  firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET || (clientConfig && clientConfig.storageBucket) || null,
  clientConfig,
};
