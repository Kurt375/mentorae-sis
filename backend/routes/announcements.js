const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { listAnnouncements, createAnnouncement, deleteBatch } = require('../controllers/announcementsController');

router.get('/', requireAuth, listAnnouncements);
router.post('/', requireAuth, requireRole('admin'), createAnnouncement);
router.post('/delete-batch', requireAuth, requireRole('admin'), deleteBatch);

module.exports = router;
