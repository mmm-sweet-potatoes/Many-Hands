const express = require('express');
const router = express.Router();
const admin = require('../services/firebaseAdmin');
const db = admin.firestore();
const asyncHandler = require('../utils/asyncHandler');

const { sanitizeUsername, validUsername } = require('../utils/username');

// Check availability
router.get('/:username', asyncHandler(async (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!validUsername(username)) return res.json({ available: false });
  const snap = await db.collection('usernames').doc(username).get();
  return res.json({ available: !snap.exists, username });
}));

// Claim a username for the authenticated user
router.post('/claim', asyncHandler(async (req, res) => {
  const uid = req.user && req.user.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  const raw = req.body && req.body.username;
  const username = sanitizeUsername(raw);
  if (!validUsername(username)) return res.status(400).json({ error: 'Invalid username. Use 3-30 chars: letters, numbers, underscore, dash.' });

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
          // already owned by this user; ensure user's doc is updated
          tx.set(userRef, { username, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return;
        }
        throw new Error('taken');
      }

      // claim new username
      tx.set(nameRef, { uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.set(userRef, { username, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      // remove old mapping if user had a different username
      if (currentUsername && currentUsername !== username) {
        const oldRef = db.collection('usernames').doc(currentUsername);
        tx.delete(oldRef);
      }
    });

    return res.json({ ok: true, username });
  } catch (e) {
    if (e && e.message === 'taken') return res.status(409).json({ error: 'Username already taken' });
    console.error('Username claim failed:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Could not claim username' });
  }
}));

module.exports = router;
