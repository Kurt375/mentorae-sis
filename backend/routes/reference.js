const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listStrands,
  listSections,
  createSection,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  getMyEnrolledSubjects,
  getGradingWeights,
  updateGradingWeights
} = require('../controllers/referenceController');

router.get('/strands', requireAuth, listStrands);
router.get('/sections', requireAuth, listSections);
router.post('/sections', requireAuth, requireRole('admin'), createSection);

router.get('/subjects', requireAuth, listSubjects);
router.get('/my-enrolled-subjects', requireAuth, requireRole('student'), getMyEnrolledSubjects);
router.post('/subjects', requireAuth, requireRole('admin'), createSubject);
router.put('/subjects', requireAuth, requireRole('admin'), updateSubject);
router.put('/subjects/:id', requireAuth, requireRole('admin'), updateSubject);
router.delete('/subjects', requireAuth, requireRole('admin'), deleteSubject);
router.delete('/subjects/:id', requireAuth, requireRole('admin'), deleteSubject);

router.get('/grading-weights', requireAuth, getGradingWeights);
router.put('/grading-weights', requireAuth, requireRole('admin'), updateGradingWeights);

module.exports = router;
