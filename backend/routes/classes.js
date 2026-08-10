const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getRosterOverview, getMySections } = require('../controllers/classesController');

router.get('/roster', requireAuth, requireRole('teacher'), getRosterOverview);
router.get('/my-sections', requireAuth, requireRole('teacher'), getMySections);

module.exports = router;
