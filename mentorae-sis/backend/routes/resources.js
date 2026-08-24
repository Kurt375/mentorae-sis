const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadLessonFiles } = require('../config/upload');
const multer = require('multer');
const {
  createModule,
  addFiles,
  replaceFile,
  listMine,
  listForStudent,
  downloadFile,
  deleteModule,
} = require('../controllers/learningResourcesController');

// Turns multer's errors (file too big, bad type, etc.) into the app's normal JSON error shape.
function handleUpload(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
      }
      next();
    });
  };
}

router.get('/mine', requireAuth, requireRole('teacher'), listMine);
router.get('/', requireAuth, requireRole('student'), listForStudent);
router.post('/', requireAuth, requireRole('teacher'), handleUpload(uploadLessonFiles.array('files', 10)), createModule);
router.post('/:moduleId/files', requireAuth, requireRole('teacher'), handleUpload(uploadLessonFiles.array('files', 10)), addFiles);
router.put('/files/:fileId', requireAuth, requireRole('teacher'), handleUpload(uploadLessonFiles.single('file')), replaceFile);
router.get('/files/:fileId/download', requireAuth, requireRole('teacher', 'student', 'parent', 'admin'), downloadFile);
router.delete('/:moduleId', requireAuth, requireRole('teacher', 'admin'), deleteModule);

module.exports = router;
