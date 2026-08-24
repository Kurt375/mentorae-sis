const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { listStrands, listSections, createSection, listSubjects } = require('../controllers/referenceController');

router.get('/strands', requireAuth, listStrands);
router.get('/sections', requireAuth, listSections);
router.post('/sections', requireAuth, requireRole('admin'), createSection);
router.get('/subjects', requireAuth, listSubjects);

module.exports = router;
