const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getRosterOverview,
  getMySections,
  getMySubjects,
  getMyAssignedClasses,
  updateStudentAvatar,
  getEclassData,
  saveEclassGrades,
  exportECRWorkbook,
} = require('../controllers/classesController');

router.get('/roster', requireAuth, requireRole('teacher', 'admin'), getRosterOverview);
router.get('/my-sections', requireAuth, requireRole('teacher', 'admin'), getMySections);
router.get('/my-subjects', requireAuth, requireRole('teacher', 'admin'), getMySubjects);
router.get('/my-assigned-classes', requireAuth, requireRole('teacher', 'admin'), getMyAssignedClasses);
router.patch('/student/:studentId/avatar', requireAuth, requireRole('teacher', 'admin'), updateStudentAvatar);
router.get('/eclass-data', requireAuth, requireRole('teacher', 'admin'), getEclassData);
router.post('/eclass-save', requireAuth, requireRole('teacher', 'admin'), saveEclassGrades);
router.post('/export-ecr', requireAuth, requireRole('teacher', 'admin'), exportECRWorkbook);

module.exports = router;

