const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getCatalog, awardBadges, getStudentBadges } = require('../controllers/badgesController');

router.get('/catalog', requireAuth, getCatalog);
router.post('/award', requireAuth, requireRole('teacher', 'admin'), awardBadges);
router.get('/student/:studentId', requireAuth, getStudentBadges);

module.exports = router;
