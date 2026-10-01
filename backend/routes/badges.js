const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getCatalog, awardBadges, getStudentBadges, getLeaderboard, resetBadges } = require('../controllers/badgesController');

router.get('/catalog', requireAuth, getCatalog);
router.post('/award', requireAuth, requireRole('teacher', 'admin'), awardBadges);
router.post('/reset', requireAuth, requireRole('teacher', 'admin'), resetBadges);
router.get('/student/:studentId', requireAuth, getStudentBadges);
router.get('/leaderboard', requireAuth, getLeaderboard);

module.exports = router;
