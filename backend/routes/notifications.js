const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { listMine, markRead, markAllRead } = require('../controllers/notificationsController');

router.use(requireAuth);
router.get('/', listMine);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
