const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listSchedules,
  createSchedule,
  deleteSchedule,
  getMySchedule,
  downloadScheduleTemplate,
  bulkImportSchedules,
} = require('../controllers/schedulesController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/mine', requireAuth, requireRole('teacher'), getMySchedule);
router.get('/bulk-import/template', requireAuth, requireRole('admin'), downloadScheduleTemplate);
router.post('/bulk-import', requireAuth, requireRole('admin'), upload.single('importFile'), bulkImportSchedules);
router.get('/', requireAuth, requireRole('admin'), listSchedules);
router.post('/', requireAuth, requireRole('admin'), createSchedule);
router.delete('/:id', requireAuth, requireRole('admin'), deleteSchedule);

module.exports = router;
