const express = require('express');
const router = express.Router();
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
} = require('../controllers/userManagementController');

router.use(requireAuth, requireRole('admin'));

router.get('/overview', getOverview);
router.get('/generate-id', generateId);
router.get('/generate-email', generateEmail);
router.post('/generate-scanner-key', generateScannerKey);
router.get('/export', exportUsers);
router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

module.exports = router;
