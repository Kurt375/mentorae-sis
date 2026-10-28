const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const os = require('os');

const isVercel = Boolean(process.env.VERCEL);
const UPLOAD_ROOT = isVercel
  ? path.join(os.tmpdir(), 'lesson-files')
  : path.join(__dirname, '..', 'uploads', 'lesson-files');

try {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
} catch (err) {
  console.warn('Could not initialize UPLOAD_ROOT directory:', err.message);
}

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
  'text/csv',
  'video/mp4',
  'video/webm',
]);

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'csv', 'mp4', 'webm', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'
]);

const FORBIDDEN_EXTENSIONS = new Set(['exe', 'bat', 'cmd', 'sh', 'bin', 'msi', 'com', 'vbs', 'ps1', 'zip', 'rar', '7z', 'tar', 'gz', 'apk', 'dmg', 'iso', 'dll', 'sys', 'scr', 'jar']);

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').replace('.', '').toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext) || !ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error('Unsupported file type. Please upload a valid document or media file (PDF, Word, Excel, images, videos, or plain text).'));
  }
  cb(null, true);
}

const uploadLessonFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }, // 25MB per file, up to 10 files per request
});

module.exports = { uploadLessonFiles, UPLOAD_ROOT };
