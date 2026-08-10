const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getSettings, updateSettings } = require('../controllers/settingsController');

router.use(requireAuth, requireRole('admin'));
router.get('/', getSettings);
router.put('/', updateSettings);

module.exports = router;
