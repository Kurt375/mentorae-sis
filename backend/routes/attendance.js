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
  getSummary,
  getHistory,
} = require('../controllers/attendanceController');

router.get('/my-qr', requireAuth, requireRole('student'), getMyQrCode);
router.post('/scan', requireAuth, requireRole('teacher', 'admin', 'security'), scanAttendance);
router.post('/verify-scanner-key', verifyScannerKey); // public — used before login
router.get('/session-status', requireAuth, requireRole('teacher'), getSessionStatus);
router.get('/confirmation', requireAuth, requireRole('teacher', 'admin'), getConfirmationRoster);
router.post('/confirm', requireAuth, requireRole('teacher'), confirmAttendance);
router.get('/summary', requireAuth, getSummary);
router.get('/history', requireAuth, getHistory);

module.exports = router;
