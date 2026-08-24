const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'lesson-files');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// NOTE: this writes to local disk. That's fine for local dev / a
// single-instance deployment with a persistent volume, but Railway's
// default filesystem is ephemeral — files will vanish on redeploy unless
// you mount a volume at backend/uploads, or swap this for S3/Cloudinary.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_ROOT),
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${unique}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
]);

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error('Unsupported file type. Allowed: PDF, Word, PowerPoint, Excel, images, or plain text.'));
  }
  cb(null, true);
}

const uploadLessonFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }, // 25MB per file, up to 10 files per request
});

module.exports = { uploadLessonFiles, UPLOAD_ROOT };
