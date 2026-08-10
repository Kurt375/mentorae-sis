const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { login, logout, sendResetCode, verifyResetCode, resetPassword, me, getProfile } = require('../controllers/authController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.post('/forgot-password/send-code', loginLimiter, sendResetCode);
router.post('/forgot-password/verify-code', loginLimiter, verifyResetCode);
router.post('/forgot-password/reset', resetPassword);
router.get('/me', requireAuth, me);
router.get('/profile', requireAuth, getProfile);

module.exports = router;
