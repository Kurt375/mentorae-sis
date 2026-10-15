const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { login, logout, sendResetCode, verifyResetCode, verifyResetPhone, resetPassword, changePassword, me, getProfile, updateProfile, getStatusSummary } = require('../controllers/authController');

// 1. IP Volumetric Limiter (Protects API gateway from DDoS/bot flooding; 120 req/min accommodates shared school NAT Wi-Fi)
const ipVolumetricLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: 'Network traffic threshold exceeded. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Targeted Identity Brute-Force Limiter (Isolated to the specific account without locking out entire school labs)
const accountBruteForceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const raw = (req.body && (req.body.identity || req.body.email || req.body.id_number || ''))
      .toString().trim().toLowerCase();
    return raw ? `acct:${raw}` : `ip:${req.ip}`;
  },
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts for this account. Please wait 15 minutes or reset your password.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', ipVolumetricLimiter, accountBruteForceLimiter, login);
router.post('/logout', logout);
router.post('/forgot-password/send-code', ipVolumetricLimiter, accountBruteForceLimiter, sendResetCode);
router.post('/forgot-password/verify-code', ipVolumetricLimiter, verifyResetCode);
router.post('/forgot-password/verify-phone', ipVolumetricLimiter, verifyResetPhone);
router.post('/forgot-password/reset', resetPassword);
router.post('/change-password', requireAuth, changePassword);
router.get('/me', requireAuth, me);
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);
router.get('/status-summary', requireAuth, getStatusSummary);

module.exports = router;
