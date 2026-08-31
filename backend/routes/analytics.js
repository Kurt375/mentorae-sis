const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getGradeTrend, getRiskDistribution, getRiskDirectory, getPredictiveRisk } = require('../controllers/analyticsController');

router.use(requireAuth, requireRole('admin'));
router.get('/grade-trend', getGradeTrend);
router.get('/risk-distribution', getRiskDistribution);
router.get('/risk-directory', getRiskDirectory);
router.get('/predictive-risk', getPredictiveRisk);

module.exports = router;
