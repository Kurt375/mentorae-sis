const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getRosterOverview, getMySections, getMySubjects } = require('../controllers/classesController');

router.get('/roster', requireAuth, requireRole('teacher'), getRosterOverview);
router.get('/my-sections', requireAuth, requireRole('teacher'), getMySections);
router.get('/my-subjects', requireAuth, requireRole('teacher'), getMySubjects);

module.exports = router;
