const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getMyQrCode,
  scanAttendance,
  verifyScannerKey,
  getSessionStatus,
  getConfirmationRoster,
  confirmAttendance,
  confirmAttendanceOut,
  finishSectionConfirmation,
  getSectionDailyHistory,
  getTeacherPendingSummary,
  getSummary,
  getHistory,
  submitExcuseNote,
  listExcuseNotes,
  reviewExcuseNote,
  getExcuseNoteProof,
} = require('../controllers/attendanceController');
const multer = require('multer');

// Proof file upload handling: PDFs, Word documents (DOC/DOCX), and Images only. Max 5MB.
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    const ext = (file.originalname || '').toLowerCase().slice((file.originalname || '').lastIndexOf('.'));
    const allowedExts = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp']);

    if (!allowedMimes.has(file.mimetype) && !allowedExts.has(ext)) {
      return cb(
        new Error(
          'Unsupported file format. Only PDF, Word documents (DOC/DOCX), and photos/images (JPG/PNG/WEBP) are allowed. Presentation files (PPT) and large media are not accepted.'
        )
      );
    }
    cb(null, true);
  },
});

function handleProofUpload(req, res, next) {
  proofUpload.single('proofFile')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File is too large. Maximum allowed size is 5MB.' });
      }
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'File upload error.' });
    }
    next();
  });
}

router.get('/my-qr', requireAuth, requireRole('student'), getMyQrCode);
router.post('/scan', requireAuth, requireRole('teacher', 'admin', 'security'), scanAttendance);
router.post('/verify-scanner-key', verifyScannerKey); // public — used before login
router.get('/session-status', requireAuth, requireRole('teacher'), getSessionStatus);
router.get('/confirmation', requireAuth, requireRole('teacher', 'admin'), getConfirmationRoster);
router.get('/teacher-pending-summary', requireAuth, requireRole('teacher', 'admin'), getTeacherPendingSummary);
router.post('/confirm', requireAuth, requireRole('teacher'), confirmAttendance);
router.post('/confirm-out', requireAuth, requireRole('teacher'), confirmAttendanceOut);
router.post('/finish-section', requireAuth, requireRole('teacher'), finishSectionConfirmation);
router.get('/section-daily-history', requireAuth, requireRole('teacher', 'admin'), getSectionDailyHistory);
router.get('/summary', requireAuth, getSummary);
router.get('/history', requireAuth, getHistory);

// Excuse notes
router.post('/excuse-note', requireAuth, requireRole('parent'), handleProofUpload, submitExcuseNote);
router.get('/excuse-notes', requireAuth, listExcuseNotes);
router.get('/excuse-notes/:id/proof', requireAuth, getExcuseNoteProof);
router.patch('/excuse-notes/:id', requireAuth, requireRole('teacher', 'admin'), reviewExcuseNote);

module.exports = router;
