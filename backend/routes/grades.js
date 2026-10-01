const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getRosterGrades,
  saveGrade,
  getMyGrades,
  getStudentGrades,
  getPrescriptivePath,
  getSectionReportCards,
  downloadECRTemplate,
} = require('../controllers/gradesController');

router.get('/template', downloadECRTemplate);
router.get('/roster', requireAuth, requireRole('teacher'), getRosterGrades);
router.get('/section-report-cards', requireAuth, requireRole('teacher', 'admin'), getSectionReportCards);
router.post('/', requireAuth, requireRole('teacher'), saveGrade);
router.get('/mine', requireAuth, requireRole('student'), getMyGrades);
router.get('/prescriptive-path', requireAuth, requireRole('student', 'parent', 'teacher', 'admin'), getPrescriptivePath);
router.get('/student/:studentId', requireAuth, requireRole('teacher', 'admin', 'parent'), getStudentGrades);

module.exports = router;

