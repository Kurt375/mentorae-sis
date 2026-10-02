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
  getSummary,
  getHistory,
  submitExcuseNote,
  listExcuseNotes,
  reviewExcuseNote,
} = require('../controllers/attendanceController');

router.get('/my-qr', requireAuth, requireRole('student'), getMyQrCode);
router.post('/scan', requireAuth, requireRole('teacher', 'admin', 'security'), scanAttendance);
router.post('/verify-scanner-key', verifyScannerKey); // public — used before login
router.get('/session-status', requireAuth, requireRole('teacher'), getSessionStatus);
router.get('/confirmation', requireAuth, requireRole('teacher', 'admin'), getConfirmationRoster);
router.post('/confirm', requireAuth, requireRole('teacher'), confirmAttendance);
router.post('/confirm-out', requireAuth, requireRole('teacher'), confirmAttendanceOut);
router.post('/finish-section', requireAuth, requireRole('teacher'), finishSectionConfirmation);
router.get('/section-daily-history', requireAuth, requireRole('teacher', 'admin'), getSectionDailyHistory);
router.get('/summary', requireAuth, getSummary);
router.get('/history', requireAuth, getHistory);

// Excuse notes
router.post('/excuse-note', requireAuth, requireRole('parent'), submitExcuseNote);
router.get('/excuse-notes', requireAuth, listExcuseNotes);
router.patch('/excuse-notes/:id', requireAuth, requireRole('teacher', 'admin'), reviewExcuseNote);

module.exports = router;
