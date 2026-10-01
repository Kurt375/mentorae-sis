const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getFilterOptions,
  getGradeTrend,
  getRiskDistribution,
  getRiskDirectory,
  getRiskAssessment,
  getPredictiveRisk,
  getSystemStatus,
  getInstitutionalOverview,
} = require('../controllers/analyticsController');

router.use(requireAuth, requireRole('admin', 'teacher'));
router.get('/filter-options', getFilterOptions);
router.get('/grade-trend', getGradeTrend);
router.get('/risk-distribution', getRiskDistribution);
router.get('/risk-directory', getRiskDirectory);
router.get('/risk-assessment', getRiskAssessment);
router.get('/predictive-risk', getPredictiveRisk);
router.get('/system-status', requireRole('admin'), getSystemStatus);
router.get('/institutional-overview', requireRole('admin'), getInstitutionalOverview);

module.exports = router;

