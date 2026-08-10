const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { browseStudents, browseSubjects, browseStrands } = require('../controllers/databaseController');

router.use(requireAuth, requireRole('admin'));
router.get('/students', browseStudents);
router.get('/subjects', browseSubjects);
router.get('/strands', browseStrands);

module.exports = router;
