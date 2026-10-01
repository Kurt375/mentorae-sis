const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  browseStudents,
  browseSubjects,
  browseStrands,
  browseSections,
  browseAdvisers,
  browseLoginLogs,
  checkArchiveEligibility,
  exportArchivedLoginLogsCSV,
  purgeOldLoginLogs,
  createStrand,
  updateStrand,
  deleteStrand,
  createSection,
  updateSection,
  deleteSection,
  exportStudentsCSV,
  exportSubjectsCSV,
  exportStrandsCSV,
  exportSectionsCSV,
  exportLoginLogsCSV,
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
router.get('/sections', browseSections);
router.get('/advisers', browseAdvisers);
router.get('/login-logs', browseLoginLogs);
router.get('/login-logs/archive-check', checkArchiveEligibility);
router.get('/login-logs/archive.csv', exportArchivedLoginLogsCSV);
router.get('/login-logs/archive.xlsx', exportArchivedLoginLogsCSV);
router.post('/login-logs/purge', purgeOldLoginLogs);
router.post('/strands', createStrand);
router.put('/strands/:id', updateStrand);
router.delete('/strands/:id', deleteStrand);

router.post('/sections', createSection);
router.put('/sections/:id', updateSection);
router.delete('/sections/:id', deleteSection);

router.get('/students/export.csv', exportStudentsCSV);
router.get('/students/export.xlsx', exportStudentsCSV);
router.get('/subjects/export.csv', exportSubjectsCSV);
router.get('/subjects/export.xlsx', exportSubjectsCSV);
router.get('/strands/export.csv', exportStrandsCSV);
router.get('/strands/export.xlsx', exportStrandsCSV);
router.get('/sections/export.csv', exportSectionsCSV);
router.get('/sections/export.xlsx', exportSectionsCSV);
router.get('/login-logs/export.csv', exportLoginLogsCSV);
router.get('/login-logs/export.xlsx', exportLoginLogsCSV);

router.get('/backup', backupDatabase);
router.post('/restore', upload.single('backupFile'), restoreDatabase);

module.exports = router;
