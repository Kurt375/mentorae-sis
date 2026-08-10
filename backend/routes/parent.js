const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getMyChildren } = require('../controllers/parentController');

router.get('/children', requireAuth, requireRole('parent'), getMyChildren);

module.exports = router;
