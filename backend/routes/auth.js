const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { login, logout, sendResetCode, verifyResetCode, verifyResetPhone, resetPassword, changePassword, me, getProfile, updateProfile, getStatusSummary } = require('../controllers/authController');
const { maybeTriggerSevenAmJobOpportunistically } = require('../jobs/attendanceJob');

// 1. IP Volumetric Limiter (Protects API gateway from DDoS/bot flooding; 300 req/min accommodates shared school NAT Wi-Fi and sudden student cohorts)
const ipVolumetricLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '300', 10),
  message: { success: false, message: 'Network traffic threshold exceeded. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Strict Credential-Stuffing Limiter (12 attempts per IP per 15 min on actual credentials checking to block brute-force password spraying)
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_IP_LIMIT_MAX || '12', 10),
  message: { success: false, message: 'Too many login attempts from this network. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. Password Reset Request Limiter (5 requests per IP per 15 min to prevent SMS/Email flooding)
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RESET_RATE_LIMIT_MAX || '5', 10),
  message: { success: false, message: 'Too many password reset attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', ipVolumetricLimiter, loginIpLimiter, login);
router.post('/logout', requireAuth, logout);
router.post('/forgot-password/send', ipVolumetricLimiter, passwordResetLimiter, sendResetCode);
router.post('/forgot-password/verify', ipVolumetricLimiter, verifyResetCode);
router.post('/forgot-password/verify-phone', ipVolumetricLimiter, verifyResetPhone);
router.post('/forgot-password/reset', resetPassword);
router.post('/change-password', requireAuth, changePassword);
router.get('/me', requireAuth, (req, res, next) => {
  maybeTriggerSevenAmJobOpportunistically();
  next();
}, me);
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);
router.get('/status-summary', requireAuth, (req, res, next) => {
  maybeTriggerSevenAmJobOpportunistically();
  next();
}, getStatusSummary);

module.exports = router;
