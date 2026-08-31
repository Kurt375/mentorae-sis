const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  generateId,
  generateEmail,
  createUser,
  listUsers,
  exportUsers,
  updateUser,
  getOverview,
  generateScannerKey,
  listParentLinks,
  linkParentToStudent,
  unlinkParentFromStudent,
  listStudents,
  bulkAssignSection,
  promoteStudents,
  graduateStudents,
  undoGraduateStudents,
  downloadImportTemplate,
  bulkImportStudents,
} = require('../controllers/userManagementController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth, requireRole('admin'));

router.get('/overview', getOverview);
router.get('/generate-id', generateId);
router.get('/generate-email', generateEmail);
router.post('/generate-scanner-key', generateScannerKey);
router.get('/export', exportUsers);
router.get('/bulk-import/template', downloadImportTemplate);
router.post('/bulk-import', upload.single('importFile'), bulkImportStudents);
router.get('/parent-links', listParentLinks);
router.post('/parent-links', linkParentToStudent);
router.delete('/parent-links/:id', unlinkParentFromStudent);
router.get('/students', listStudents);
router.post('/bulk-assign-section', bulkAssignSection);
router.post('/promote', promoteStudents);
router.post('/graduate', graduateStudents);
router.post('/undo-graduate', undoGraduateStudents);
router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

module.exports = router;
