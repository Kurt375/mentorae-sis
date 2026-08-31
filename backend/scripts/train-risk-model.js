/**
 * Trains the academic-risk Random Forest from real data already in the
 * database and saves it to backend/ml/model.json.
 *
 * Usage:
 *   node scripts/train-risk-model.js
 *
 * What counts as a training sample:
 *   Every `grades` row where exam_score > 0 (i.e. the term is actually
 *   finished — quiz + activity + exam all recorded) is a "completed"
 *   record. Its features are the quiz/activity scores + that student's
 *   overall attendance rate; its label is the risk band computed from
 *   the FINAL average, using the same thresholds the descriptive
 *   dashboard already uses (see ml/features.js:classifyRisk).
 *
 *   That's what makes the model genuinely predictive rather than a
 *   restatement of the rule: at prediction time (see
 *   analyticsController.getPredictiveRisk / gradesController
 *   getPrescriptivePath) it is fed quiz+activity+attendance for a term
 *   that is still IN PROGRESS (exam_score is 0/not yet recorded) and
 *   has to forecast where that student is headed.
 *
 * Minimum data:
 *   Random forests need a reasonable number of examples per class to
 *   mean anything. This script trains on whatever is in the DB but
 *   warns loudly if there isn't enough — a model "trained" on a
 *   handful of rows is worse than the plain rule-based fallback.
 */

require('dotenv').config();
const pool = require('../config/db');
const { classifyRisk, toFeatureVector, RISK_LABELS } = require('../ml/features');
const { train, save } = require('../ml/riskModel');

const MIN_SAMPLES_RECOMMENDED = 30;
const MIN_SAMPLES_PER_CLASS_RECOMMENDED = 5;

async function main() {
  console.log('Pulling completed grade records + attendance rates from the database...');

  const [rows] = await pool.query(
    `SELECT g.student_id, g.quiz_score, g.activity_score, g.exam_score,
            g.average AS finalAverage,
            (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*))
               FROM attendance_logs WHERE student_id = g.student_id) AS attendanceRate
     FROM grades g
     WHERE g.exam_score > 0`
  );

  if (!rows.length) {
    console.error(
      '\nNo completed grade records found (need rows in `grades` with exam_score > 0).\n' +
      'The predictive model has nothing to learn from yet — the API will keep serving the\n' +
      'rule-based fallback until there is at least one finished term of grades in the database.'
    );
    process.exit(1);
  }

  const samples = rows.map((r) => ({
    features: toFeatureVector({
      quiz_score: r.quiz_score,
      activity_score: r.activity_score,
      attendanceRate: r.attendanceRate,
    }),
    label: classifyRisk(r.finalAverage, r.attendanceRate),
  }));

  const counts = { Low: 0, Medium: 0, High: 0 };
  samples.forEach((s) => counts[s.label]++);

  console.log(`\nTraining samples: ${samples.length}`);
  console.log(`  Low:    ${counts.Low}`);
  console.log(`  Medium: ${counts.Medium}`);
  console.log(`  High:   ${counts.High}`);

  if (samples.length < MIN_SAMPLES_RECOMMENDED) {
    console.warn(
      `\nWARNING: only ${samples.length} samples total (recommended >= ${MIN_SAMPLES_RECOMMENDED}).\n` +
      'The model will still train, but predictions will be low-confidence and easy to overfit.\n' +
      'Treat this as a placeholder model until more terms of real grade data accumulate.'
    );
  }
  const thinClasses = RISK_LABELS.filter((l) => counts[l] > 0 && counts[l] < MIN_SAMPLES_PER_CLASS_RECOMMENDED);
  if (thinClasses.length) {
    console.warn(`WARNING: thin classes (< ${MIN_SAMPLES_PER_CLASS_RECOMMENDED} samples): ${thinClasses.join(', ')}`);
  }
  const missingClasses = RISK_LABELS.filter((l) => counts[l] === 0);
  if (missingClasses.length) {
    console.warn(
      `WARNING: no examples at all for: ${missingClasses.join(', ')}. ` +
      'The model will never predict a class it has never seen — those students will fall back to "Low" until real examples exist.'
    );
  }

  console.log('\nTraining Random Forest...');
  const rf = train(samples);

  const trainPreds = rf.predict(samples.map((s) => s.features));
  const correct = trainPreds.filter((p, i) => RISK_LABELS[p] === samples[i].label).length;
  const trainAccuracy = (correct / samples.length) * 100;
  console.log(`Training-set accuracy: ${trainAccuracy.toFixed(1)}% (n=${samples.length})`);
  if (samples.length < MIN_SAMPLES_RECOMMENDED) {
    console.log('(Note: with this little data, training accuracy is not a reliable quality signal — it will look high even on a weak model. Re-run this once more grades are recorded.)');
  }

  save(rf, {
    sampleCount: samples.length,
    classCounts: counts,
    trainAccuracy: Number(trainAccuracy.toFixed(1)),
    features: ['quiz_score (0-30)', 'activity_score (0-20)', 'attendanceRate (0-100)'],
  });

  console.log('\nSaved model to backend/ml/model.json');
  process.exit(0);
}

main().catch((err) => {
  console.error('Training failed:', err);
  process.exit(1);
});
