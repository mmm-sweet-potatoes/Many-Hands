const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const admin = require('../services/firebaseAdmin');
const db = admin.firestore();
const asyncHandler = require('../utils/asyncHandler');

router.post('/', auth, asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  let computedScoreDelta = null;
  const {
    location = null,
    size = null,
    description = null,
    image = null,
    importance = null,
    amount = null,
  } = req.body || {};

  // simple validation
  const allowedAmounts = ['low', 'med', 'high'];
  if (amount && !allowedAmounts.includes(amount)) {
    return res.status(400).json({ error: `Invalid amount, must be one of: ${allowedAmounts.join(', ')}` });
  }

  const payload = {
    uid,
    timeposted: admin.firestore.FieldValue.serverTimestamp(),
    location,
    size,
    description,
    image,
    // coerce importance and size to integer when possible
    importance: require('../utils/number').toInt(importance, 0),
    size: require('../utils/number').toInt(size, 0),
    amount,
    status: 'not claimed',
    claimer: '',
  };

  const docRef = await db.collection('requests').add(payload);

  // Ensure user has a score field; if scoreDelta provided, increment it
  try {
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists || (userSnap.exists && typeof userSnap.data().score === 'undefined')) {
      // initialize score to 0 if missing
      await userRef.set({ score: 0 }, { merge: true });
    }

    const { toInt } = require('../utils/number');
    // if client provided an explicit scoreDelta, use it; otherwise compute from importance+size
    let scoreDelta = (req.body && typeof req.body.scoreDelta !== 'undefined') ? toInt(req.body.scoreDelta, 0) : 0;
    if (!scoreDelta) {
      // compute a simple score from importance and size
      const imp = toInt(importance, 0);
      const sz = toInt(size, 0);
      scoreDelta = imp + Math.round(sz / 2);
      if (!scoreDelta) scoreDelta = 1; // ensure at least 1 point
    }

    computedScoreDelta = scoreDelta;

    if (scoreDelta && Number.isFinite(scoreDelta) && Number.isInteger(scoreDelta) && scoreDelta !== 0) {
      await userRef.set({ score: admin.firestore.FieldValue.increment(scoreDelta) }, { merge: true });
    }
  } catch (e) {
    console.warn('Could not ensure user score:', e && e.message ? e.message : e);
  }

  return res.json({ id: docRef.id, scoreDelta: computedScoreDelta });
}));

// Mark a request as completed by the authenticated user
router.post('/:id/complete', auth, asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const id = req.params.id;
  const reqRef = db.collection('requests').doc(id);

  // Use transaction to mark completed and increment completer's score
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw { statusCode: 404, message: 'Request not found' };
      const r = snap.data();
      if (r.status === 'completed') throw { statusCode: 400, message: 'Request already completed' };
      if (!r.claimer || r.claimer !== uid) throw { statusCode: 403, message: 'Only the claimer can complete this request' };

      // check claim expiry if present
      if (r.claimedExpiresAt && r.claimedExpiresAt.toMillis && typeof r.claimedExpiresAt.toMillis === 'function') {
        const expMs = r.claimedExpiresAt.toMillis();
        if (expMs < Date.now()) throw { statusCode: 400, message: 'Claim has expired' };
      }

      // compute scoreDelta based on stored importance and size
      const { toInt } = require('../utils/number');
      const imp = toInt(r.importance, 0);
      const sz = toInt(r.size, 0);
      let scoreDelta = imp + Math.round(sz / 2);
      if (!scoreDelta) scoreDelta = 1;

      tx.set(reqRef, { status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      const completerRef = db.collection('users').doc(uid);
      tx.set(completerRef, { score: admin.firestore.FieldValue.increment(scoreDelta) }, { merge: true });
    });

    const updated = await reqRef.get();
    return res.json({ ok: true, request: { id: updated.id, ...updated.data() } });
  } catch (e) {
    if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Complete request failed:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Could not complete request' });
  }
}));

// Claim a request for 24 hours
router.post('/:id/claim', auth, asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const id = req.params.id;
  const reqRef = db.collection('requests').doc(id);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw { statusCode: 404, message: 'Request not found' };
      const r = snap.data();
      if (r.status === 'completed') throw { statusCode: 400, message: 'Cannot claim a completed request' };

      // if already claimed and not expired, reject
      if (r.status === 'claimed' && r.claimer) {
        if (r.claimedExpiresAt && r.claimedExpiresAt.toMillis && typeof r.claimedExpiresAt.toMillis === 'function') {
          const expMs = r.claimedExpiresAt.toMillis();
          if (expMs > Date.now()) throw { statusCode: 409, message: 'Request already claimed' };
        } else {
          throw { statusCode: 409, message: 'Request already claimed' };
        }
      }

      const claimedAt = admin.firestore.FieldValue.serverTimestamp();
      const expiresTs = admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
      tx.set(reqRef, { status: 'claimed', claimer: uid, claimedAt, claimedExpiresAt: expiresTs }, { merge: true });
    });

    const updated = await reqRef.get();
    return res.json({ ok: true, request: { id: updated.id, ...updated.data() } });
  } catch (e) {
    if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Claim request failed:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Could not claim request' });
  }
}));

router.get('/', asyncHandler(async (req, res) => {
  const snaps = await db.collection('requests').orderBy('timeposted', 'desc').limit(50).get();
  const items = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  return res.json(items);
}));

router.get('/mine', auth, asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const snaps = await db.collection('requests').where('uid', '==', uid).orderBy('timeposted', 'desc').get();
  const items = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  return res.json(items);
}));

module.exports = router;
