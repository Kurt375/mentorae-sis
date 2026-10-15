const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { login, logout, sendResetCode, verifyResetCode, verifyResetPhone, resetPassword, changePassword, me, getProfile, updateProfile, getStatusSummary } = require('../controllers/authController');

router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password/send-code', sendResetCode);
router.post('/forgot-password/verify-code', verifyResetCode);
router.post('/forgot-password/verify-phone', verifyResetPhone);
router.post('/forgot-password/reset', resetPassword);
router.post('/change-password', requireAuth, changePassword);
router.get('/me', requireAuth, me);
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);
router.get('/status-summary', requireAuth, getStatusSummary);

module.exports = router;
