/**
 * Feature engineering for the academic-risk Random Forest.
 *
 * Feature vector (3 numeric features, in this order):
 *   [0] quiz_score      (0-30, "Written Work")
 *   [1] activity_score  (0-20, "Performance Task")
 *   [2] attendanceRate  (0-100, % present/late out of all logged days)
 *
 * IMPORTANT: exam_score is intentionally excluded from the feature vector.
 * The whole point of the *predictive* model is to forecast a student's
 * likely risk band from early-term indicators (quizzes, activities,
 * attendance-to-date) BEFORE the quarterly exam happens — that's what
 * makes it predictive rather than a re-statement of the final grade.
 * The label used for training, however, is derived from the FINAL
 * average (quiz+activity+exam) of already-completed records, since
 * that's the real-world outcome the model is trying to anticipate.
 */

const RISK_LABELS = ['Low', 'Medium', 'High'];
const RISK_INDEX = { Low: 0, Medium: 1, High: 2 };

/**
 * Same thresholds the descriptive dashboard already uses
 * (backend/controllers/analyticsController.js:classifyRisk), reused
 * here so the model's training labels stay consistent with the rest
 * of the app's definition of "risk".
 */
function classifyRisk(finalAverage, attendanceRate) {
  const g = finalAverage === null || finalAverage === undefined ? 100 : Number(finalAverage);
  const a = attendanceRate === null || attendanceRate === undefined ? 100 : Number(attendanceRate);
  if (g < 75 || a < 75) return 'High';
  if (g < 85 || a < 90) return 'Medium';
  return 'Low';
}

/** Build the 3-feature vector used by the model, with safe null handling. */
function toFeatureVector({ quiz_score, activity_score, attendanceRate }) {
  const quiz = quiz_score === null || quiz_score === undefined ? 0 : Number(quiz_score);
  const activity = activity_score === null || activity_score === undefined ? 0 : Number(activity_score);
  const attendance = attendanceRate === null || attendanceRate === undefined ? 100 : Number(attendanceRate);
  return [quiz, activity, attendance];
}

module.exports = { RISK_LABELS, RISK_INDEX, classifyRisk, toFeatureVector };
