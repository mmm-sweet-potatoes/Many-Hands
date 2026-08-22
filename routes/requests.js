const express = require('express');
const router = express.Router();
const admin = require('../services/firebaseAdmin');
const db = admin.firestore();
const asyncHandler = require('../utils/asyncHandler');
const { toInt } = require('../utils/number');
 
router.post('/', asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  let computedScoreDelta = null;
  const {
    location = null,
    size = null,
    description = null,
    image = null,
    importance = null,
    amount = null,
    peopleNeeded = null,
  } = req.body || {};
 
  // simple validation
  const allowedAmounts = ['low', 'med', 'high'];
  if (amount && !allowedAmounts.includes(amount)) {
    return res.status(400).json({ error: `Invalid amount, must be one of: ${allowedAmounts.join(', ')}` });
  }
 
  // people needed must be a positive integer; default to 1
  const peopleNeededInt = toInt(peopleNeeded, 1);
  if (!Number.isInteger(peopleNeededInt) || peopleNeededInt < 1) {
    return res.status(400).json({ error: 'peopleNeeded must be a positive integer' });
  }
 
  const payload = {
    uid,
    timeposted: admin.firestore.FieldValue.serverTimestamp(),
    location,
    size: toInt(size, 0),
    description,
    image,
    importance: toInt(importance, 0),
    amount,
    peopleNeeded: peopleNeededInt,
    status: 'open',
    claimers: [],
    completedBy: [],
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
 
// Join a request. Multiple people can join, up to peopleNeeded.
router.post('/:id/claim', asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const id = req.params.id;
  const reqRef = db.collection('requests').doc(id);
 
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw { statusCode: 404, message: 'Request not found' };
      const r = snap.data();
 
      if (r.status === 'completed') throw { statusCode: 400, message: 'Cannot join a completed request' };
 
      const claimers = Array.isArray(r.claimers) ? r.claimers : [];
      const peopleNeeded = Number.isInteger(r.peopleNeeded) && r.peopleNeeded > 0 ? r.peopleNeeded : 1;
 
      if (claimers.includes(uid)) throw { statusCode: 409, message: 'You have already joined this request' };
      if (claimers.length >= peopleNeeded) throw { statusCode: 409, message: 'Request is already full' };
 
      const newClaimers = claimers.concat([uid]);
      const newStatus = newClaimers.length >= peopleNeeded ? 'full' : 'open';
 
      tx.set(reqRef, {
        claimers: admin.firestore.FieldValue.arrayUnion(uid),
        status: newStatus,
      }, { merge: true });
    });
 
    const updated = await reqRef.get();
    return res.json({ ok: true, request: { id: updated.id, ...updated.data() } });
  } catch (e) {
    if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Claim request failed:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Could not join request' });
  }
}));
 
// Leave a request before it's completed, freeing a slot for someone else.
router.post('/:id/unclaim', asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const id = req.params.id;
  const reqRef = db.collection('requests').doc(id);
 
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw { statusCode: 404, message: 'Request not found' };
      const r = snap.data();
 
      if (r.status === 'completed') throw { statusCode: 400, message: 'Cannot leave a completed request' };
 
      const claimers = Array.isArray(r.claimers) ? r.claimers : [];
      if (!claimers.includes(uid)) throw { statusCode: 400, message: 'You have not joined this request' };
 
      const peopleNeeded = Number.isInteger(r.peopleNeeded) && r.peopleNeeded > 0 ? r.peopleNeeded : 1;
      const remaining = claimers.filter((c) => c !== uid);
      const newStatus = remaining.length >= peopleNeeded ? 'full' : 'open';
 
      tx.set(reqRef, {
        claimers: admin.firestore.FieldValue.arrayRemove(uid),
        completedBy: admin.firestore.FieldValue.arrayRemove(uid),
        status: newStatus,
      }, { merge: true });
    });
 
    const updated = await reqRef.get();
    return res.json({ ok: true, request: { id: updated.id, ...updated.data() } });
  } catch (e) {
    if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Unclaim request failed:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Could not leave request' });
  }
}));
 
// Mark the caller's part of a request as done. The request as a whole
// becomes "completed" once everyone who joined has marked their part done.
router.post('/:id/complete', asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const id = req.params.id;
  const reqRef = db.collection('requests').doc(id);
 
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) throw { statusCode: 404, message: 'Request not found' };
      const r = snap.data();
      if (r.status === 'completed') throw { statusCode: 400, message: 'Request already completed' };
 
      const claimers = Array.isArray(r.claimers) ? r.claimers : [];
      if (!claimers.includes(uid)) throw { statusCode: 403, message: 'Only someone who joined can mark this done' };
 
      const completedBy = Array.isArray(r.completedBy) ? r.completedBy : [];
      if (completedBy.includes(uid)) throw { statusCode: 400, message: 'You already marked this done' };
 
      // compute this person's scoreDelta based on stored importance and size
      const imp = toInt(r.importance, 0);
      const sz = toInt(r.size, 0);
      let scoreDelta = imp + Math.round(sz / 2);
      if (!scoreDelta) scoreDelta = 1;
 
      const newCompletedBy = completedBy.concat([uid]);
      const allDone = newCompletedBy.length >= claimers.length;
 
      const update = {
        completedBy: admin.firestore.FieldValue.arrayUnion(uid),
      };
      if (allDone) {
        update.status = 'completed';
        update.completedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      tx.set(reqRef, update, { merge: true });
 
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
 
router.get('/', asyncHandler(async (req, res) => {
  const snaps = await db.collection('requests').orderBy('timeposted', 'desc').limit(50).get();
  const items = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  return res.json(items);
}));
 
router.get('/mine', asyncHandler(async (req, res) => {
  const uid = req.user.uid;
  const snaps = await db.collection('requests').where('uid', '==', uid).orderBy('timeposted', 'desc').get();
  const items = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  return res.json(items);
}));
 
module.exports = router;
