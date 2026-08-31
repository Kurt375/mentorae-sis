const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  browseStudents,
  browseSubjects,
  browseStrands,
  exportStudentsCSV,
  exportSubjectsCSV,
  exportStrandsCSV,
  backupDatabase,
  restoreDatabase,
} = require('../controllers/databaseController');

// Backup files are small plain-text SQL — memory storage is fine, no need to
// touch disk (Render's disk isn't persistent anyway).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(requireAuth, requireRole('admin'));
router.get('/students', browseStudents);
router.get('/subjects', browseSubjects);
router.get('/strands', browseStrands);

router.get('/students/export.csv', exportStudentsCSV);
router.get('/subjects/export.csv', exportSubjectsCSV);
router.get('/strands/export.csv', exportStrandsCSV);

router.get('/backup', backupDatabase);
router.post('/restore', upload.single('backupFile'), restoreDatabase);

module.exports = router;
