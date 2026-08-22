const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../services/cloudinaryClient');
const streamifier = require('streamifier');
const asyncHandler = require('../utils/asyncHandler');


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!req.user || !req.user.uid) return res.status(401).json({ error: 'Unauthorized' });

  const folder = `requests/${req.user.uid}`;

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
  });

  // result contains secure_url, public_id, bytes, format, etc.
  const meta = {
    provider: 'cloudinary',
    url: result.secure_url,
    public_id: result.public_id,
    contentType: result.format,
    size: result.bytes,
    uploadedAt: new Date().toISOString(),
  };

  return res.json(meta);
}));

module.exports = router;
