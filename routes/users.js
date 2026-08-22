const express = require('express');
const router = express.Router();
const admin = require('../services/firebaseAdmin');
const db = admin.firestore();
const asyncHandler = require('../utils/asyncHandler');
const multer = require('multer');
const cloudinary = require('../services/cloudinaryClient');
const streamifier = require('streamifier');


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/me', asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const snap = await db.collection('users').doc(uid).get();
  return res.json({ uid, profile: snap.exists ? snap.data() : null });
}));

router.post('/me', asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const rawData = Object.assign({}, req.body || {});
  // remove null/undefined fields so we don't overwrite existing values with null
  const data = Object.keys(rawData).reduce((acc, k) => {
    const v = rawData[k];
    if (typeof v !== 'undefined' && v !== null) acc[k] = v;
    return acc;
  }, {});

  // If username is provided, attempt transactional claim to ensure uniqueness
  const { sanitizeUsername, validUsername } = require('../utils/username');
  const rawUsername = data.username;
  if (rawUsername) {
    const username = sanitizeUsername(rawUsername);
    if (!validUsername(username)) {
      return res.status(400).json({ error: 'Invalid username. Use 3-30 chars: letters, numbers, underscore, dash.' });
    }

    const userRef = db.collection('users').doc(uid);
    const nameRef = db.collection('usernames').doc(username);

    try {
      await db.runTransaction(async (tx) => {
        const nameSnap = await tx.get(nameRef);
        const userSnap = await tx.get(userRef);
        const userData = userSnap.exists ? userSnap.data() : {};
        const currentUsername = userData.username || null;

        if (nameSnap.exists) {
          const owner = nameSnap.data().uid;
          if (owner === uid) {
            // already owned by this user; update profile
            tx.set(userRef, Object.assign({}, data, { username, updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            return;
          }
          throw new Error('taken');
        }

        // claim new username
        tx.set(nameRef, { uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        tx.set(userRef, Object.assign({}, data, { username, updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });

        // remove old mapping if user had a different username
        if (currentUsername && currentUsername !== username) {
          const oldRef = db.collection('usernames').doc(currentUsername);
          tx.delete(oldRef);
        }
      });

      return res.json({ ok: true, username: rawUsername });
    } catch (e) {
      if (e && e.message === 'taken') return res.status(409).json({ error: 'Username already taken' });
      console.error('Failed to claim username during profile update:', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'Could not update profile' });
    }
  }

  // No username provided — simple merge update
  data.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('users').doc(uid).set(data, { merge: true });
  return res.json({ ok: true });
}));

// Upload profile photo, persist to Firestore and update Auth photoURL
router.post('/me/photo', upload.single('image'), asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const folder = `profiles/${uid}`;

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
  });

  const meta = {
    provider: 'cloudinary',
    url: result.secure_url,
    public_id: result.public_id,
    contentType: result.format,
    size: result.bytes,
    uploadedAt: new Date().toISOString(),
  };

  // Persist into user profile
  try {
    await db.collection('users').doc(uid).set({ photo: meta, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('Could not persist profile photo metadata to Firestore:', e && e.message ? e.message : e);
  }

  // Update Firebase Auth user's photoURL (non-fatal)
  try {
    await admin.auth().updateUser(uid, { photoURL: meta.url });
  } catch (e) {
    console.warn('Could not update Firebase Auth user photoURL:', e && e.message ? e.message : e);
  }

  return res.json(meta);
}));

module.exports = router;
