/**
 * Prescriptive layer: turns a risk prediction + raw component scores into
 * concrete, actionable recommendations. This is deliberately rule-based
 * (not a second model) — prescriptive analytics is about turning a
 * forecast into a recommended action, and the actions below are exactly
 * the ones the capstone paper's "Recommended Practice Path" /
 * "Prescriptive Analytics" screens describe (tutoring, review lessons,
 * practice quizzes, parent notification).
 *
 * Component ranges (from backend/db/schema.sql `grades` table):
 *   quiz_score      0-30   ("Written Work")
 *   activity_score  0-20   ("Performance Task")
 *   exam_score      0-50   ("Quarterly Exam")
 */

const QUIZ_MAX = 30;
const ACTIVITY_MAX = 20;
const EXAM_MAX = 50;

/** Which component is dragging the student down the most, as a % of its own max. */
function weakestComponent({ quiz_score, activity_score, exam_score, attendanceRate }) {
  const rates = [
    { key: 'writtenWork', label: 'Written Work (quizzes)', rate: (Number(quiz_score) || 0) / QUIZ_MAX },
    { key: 'performanceTask', label: 'Performance Task (activities)', rate: (Number(activity_score) || 0) / ACTIVITY_MAX },
  ];
  if (exam_score !== null && exam_score !== undefined) {
    rates.push({ key: 'quarterlyExam', label: 'Quarterly Exam', rate: (Number(exam_score) || 0) / EXAM_MAX });
  }
  if (attendanceRate !== null && attendanceRate !== undefined) {
    rates.push({ key: 'attendance', label: 'Attendance', rate: Number(attendanceRate) / 100 });
  }
  rates.sort((a, b) => a.rate - b.rate);
  return rates[0];
}

/**
 * Build the recommended-actions list for a student, given their raw
 * scores, the model's predicted risk, and the subject name (for copy).
 */
function buildRecommendations({ subjectName, quiz_score, activity_score, exam_score, attendanceRate, risk }) {
  const driver = weakestComponent({ quiz_score, activity_score, exam_score, attendanceRate });
  const actions = [];

  if (driver.key === 'attendance') {
    actions.push(`Attendance is the main risk driver for ${subjectName} — recommend a parent/guardian notification and a check-in on the cause of absences.`);
  } else if (driver.key === 'writtenWork') {
    actions.push(`Written Work scores are the weak point in ${subjectName} — recommend the review lessons and practice quizzes for this subject in Learning Resources.`);
  } else if (driver.key === 'performanceTask') {
    actions.push(`Performance Task scores are the weak point in ${subjectName} — recommend structured activity/lab make-up time or a teacher-guided practice session.`);
  } else if (driver.key === 'quarterlyExam') {
    actions.push(`Quarterly Exam performance is the weak point in ${subjectName} — recommend a review lesson and flashcard set focused on exam topics before the next term.`);
  }

  if (risk === 'High') {
    actions.push('Flag for teacher academic support and consider a parent notification this week.');
  } else if (risk === 'Medium') {
    actions.push('Recommend the student use the practice quizzes/flashcards for this subject to get ahead of the next grading period.');
  }

  return { driver: driver.key, driverLabel: driver.label, actions };
}

module.exports = { buildRecommendations, weakestComponent, QUIZ_MAX, ACTIVITY_MAX, EXAM_MAX };
