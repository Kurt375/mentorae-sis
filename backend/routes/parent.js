const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getMyChildren, getStudentRecommendationsForParent } = require('../controllers/parentController');

router.get('/children', requireAuth, requireRole('parent', 'admin'), getMyChildren);
router.get('/student/:studentId/recommendations', requireAuth, requireRole('parent', 'admin'), getStudentRecommendationsForParent);

module.exports = router;
