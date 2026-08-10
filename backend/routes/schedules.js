const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { listSchedules, createSchedule, deleteSchedule, getMySchedule } = require('../controllers/schedulesController');

router.get('/mine', requireAuth, requireRole('teacher'), getMySchedule);
router.get('/', requireAuth, requireRole('admin'), listSchedules);
router.post('/', requireAuth, requireRole('admin'), createSchedule);
router.delete('/:id', requireAuth, requireRole('admin'), deleteSchedule);

module.exports = router;
