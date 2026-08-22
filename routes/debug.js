const express = require('express');
const router = express.Router();
const admin = require('../services/firebaseAdmin');
const asyncHandler = require('../utils/asyncHandler');

router.get('/storage', asyncHandler(async (req, res) => {
  const candidates = admin.__bucketCandidates || [];
  const projectId = admin.__projectId || null;
  const results = [];

  // Try the default bucket first
  try {
    const defBucket = admin.storage().bucket();
    const [meta] = await defBucket.getMetadata().catch(() => [null]);
    results.push({ name: '(default)', ok: !!meta, metadata: meta || null });
  } catch (e) {
    results.push({ name: '(default)', ok: false, error: e && e.message ? e.message : e });
  }

  for (const b of candidates) {
    try {
      const bucket = admin.storage().bucket(b);
      const [meta] = await bucket.getMetadata().catch(() => [null]);
      results.push({ name: b, ok: !!meta, metadata: meta || null });
    } catch (e) {
      results.push({ name: b, ok: false, error: e && e.message ? e.message : e });
    }
  }

  return res.json({ projectId, candidates, results });
}));

module.exports = router;
