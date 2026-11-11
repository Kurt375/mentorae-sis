/**
 * seed_attendance_and_grades.js
 *
 * Full-scale production seeding for Mentorae SIS based on DepEd SY 2026-2027 Trimester Calendar:
 * - Term 1: June 8, 2026 - September 15, 2026 (Completed: WW + PT + QA Exam)
 * - Term 2: September 16, 2026 - November 11, 2026 (In-Progress: WW + PT, QA Exam = NULL)
 * - Weekdays only (Mon-Fri), skipping Philippine Regular Holidays
 * - Full alignment with Academic Risk Random Forest ML model
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../config/db');
const { classifyRisk, toFeatureVector, RISK_LABELS } = require('../ml/features');
const { train, save } = require('../ml/riskModel');

const HOLIDAYS_2026 = new Set([
  '2026-06-12', // Independence Day (Friday)
  '2026-08-21', // Ninoy Aquino Day (Friday)
  '2026-08-31', // National Heroes Day (Monday)
  '2026-11-02', // All Souls' Day (Monday)
]);

function getSchoolWeekdays(startDateStr, endDateStr) {
  const dates = [];
  const curr = new Date(startDateStr);
  const end = new Date(endDateStr);

  while (curr <= end) {
    const dayOfWeek = curr.getDay(); // 0 = Sun, 6 = Sat
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, '0');
    const dd = String(curr.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (dayOfWeek >= 1 && dayOfWeek <= 5 && !HOLIDAYS_2026.has(dateStr)) {
      dates.push(dateStr);
    }
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randTime(startH, startM, endH, endM) {
  const h = randInt(startH, endH);
  const m = randInt(startM, endM);
  const s = randInt(0, 59);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function run() {
  console.log('================================================================');
  console.log('  MENTORAE SIS: ATTENDANCE & MULTI-TERM ML SYNCHRONIZATION');
  console.log('  DepEd SY 2026-2027 Trimester Calendar');
  console.log('================================================================\n');

  // 1. Update system_settings
  console.log('[Step 1/6] Updating system settings for SY 2026-2027 and Term 2...');
  const settingsToApply = [
    ['school_year', '2026 - 2027'],
    ['current_semester', '2nd Term'],
    ['current_quarter', '2nd Term'],
    ['term_1_start_date', '2026-06-08'],
    ['term_1_end_date', '2026-09-15'],
    ['term_2_start_date', '2026-09-16'],
    ['term_2_end_date', '2026-11-30'],
    ['term_3_start_date', '2027-01-04'],
    ['term_3_end_date', '2027-04-08'],
  ];

  for (const [key, val] of settingsToApply) {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, val]
    );
  }
  console.log('  ✓ System settings configured successfully.\n');

  // 2. Fetch active students
  console.log('[Step 2/6] Querying active students and assigned sections...');
  const [students] = await pool.query(
    `SELECT u.id, u.id_number, u.first_name, u.last_name, u.section_id,
            sec.grade_level, sec.strand_id, st.code AS strandCode
     FROM users u
     LEFT JOIN sections sec ON sec.id = u.section_id
     LEFT JOIN strands st ON st.id = sec.strand_id
     WHERE u.role = 'student'
     ORDER BY u.id ASC`
  );

  if (!students.length) {
    console.error('  ✗ No student accounts found in database. Please seed or register students first.');
    process.exit(1);
  }
  console.log(`  ✓ Found ${students.length} enrolled students in the system.\n`);

  // 3. Clear existing test attendance logs and grades
  console.log('[Step 3/6] Clearing existing test attendance logs and grades for clean slate...');
  await pool.query('DELETE FROM attendance_logs');
  await pool.query('DELETE FROM grades');
  console.log('  ✓ Cleaned prior test records.\n');

  // 4. Generate daily attendance logs
  console.log('[Step 4/6] Generating daily weekday attendance (June 8, 2026 - November 11, 2026)...');
  const term1Days = getSchoolWeekdays('2026-06-08', '2026-09-15');
  const term2Days = getSchoolWeekdays('2026-09-16', '2026-11-11');
  const allDays = [...term1Days, ...term2Days];

  console.log(`  School days count: Term 1 = ${term1Days.length} days, Term 2 = ${term2Days.length} days (Total = ${allDays.length} days)`);

  // Assign each student an archetype
  // ~75% Diligent (95% present), ~15% Moderate (85% present), ~10% At-Risk (68% present)
  const studentArchetypes = new Map();
  students.forEach((st, idx) => {
    const mod = idx % 10;
    if (mod === 9) {
      studentArchetypes.set(st.id, 'at_risk'); // 10%
    } else if (mod === 7 || mod === 8) {
      studentArchetypes.set(st.id, 'moderate'); // 20%
    } else {
      studentArchetypes.set(st.id, 'diligent'); // 70%
    }
  });

  const attendanceBatch = [];
  const BATCH_SIZE = 1000;
  let totalAttLogs = 0;

  for (const st of students) {
    const archetype = studentArchetypes.get(st.id);

    for (const dateStr of allDays) {
      const roll = Math.random() * 100;
      let status = 'present';
      let scanTime = null;

      if (archetype === 'diligent') {
        if (roll < 95) {
          status = 'present';
          scanTime = randTime(6, 30, 6, 58);
        } else if (roll < 98) {
          status = 'late';
          scanTime = randTime(7, 2, 7, 25);
        } else {
          status = 'excused';
        }
      } else if (archetype === 'moderate') {
        if (roll < 83) {
          status = 'present';
          scanTime = randTime(6, 35, 6, 59);
        } else if (roll < 94) {
          status = 'late';
          scanTime = randTime(7, 1, 7, 35);
        } else {
          status = 'absent';
        }
      } else {
        // at_risk: chronic absenteeism
        if (roll < 65) {
          status = 'present';
          scanTime = randTime(6, 45, 6, 59);
        } else if (roll < 78) {
          status = 'late';
          scanTime = randTime(7, 5, 7, 45);
        } else {
          status = 'absent';
        }
      }

      attendanceBatch.push([st.id, status, dateStr, scanTime]);
      totalAttLogs++;

      if (attendanceBatch.length >= BATCH_SIZE) {
        await pool.query(
          'INSERT INTO attendance_logs (student_id, status, scan_date, scan_time) VALUES ?',
          [attendanceBatch]
        );
        attendanceBatch.length = 0;
      }
    }
  }

  if (attendanceBatch.length > 0) {
    await pool.query(
      'INSERT INTO attendance_logs (student_id, status, scan_date, scan_time) VALUES ?',
      [attendanceBatch]
    );
    attendanceBatch.length = 0;
  }
  console.log(`  ✓ Inserted ${totalAttLogs.toLocaleString()} realistic daily attendance logs.\n`);

  // 5. Generate Grades for Term 1 (Complete) and Term 2 (In-Progress)
  console.log('[Step 5/6] Generating academic grades for Term 1 (completed) and Term 2 (in-progress)...');
  const [allSubjects] = await pool.query('SELECT id, code, name, classification, grade_level, quarter FROM subjects');

  if (!allSubjects.length) {
    console.error('  ✗ No subjects found in database.');
    process.exit(1);
  }

  // Map subjects by grade level
  const subjectsByGrade = { 11: [], 12: [] };
  allSubjects.forEach((sub) => {
    const gl = sub.grade_level || 11;
    if (!subjectsByGrade[gl]) subjectsByGrade[gl] = [];
    subjectsByGrade[gl].push(sub);
  });

  const gradesBatch = [];
  let totalTerm1Grades = 0;
  let totalTerm2Grades = 0;

  for (const st of students) {
    const archetype = studentArchetypes.get(st.id);
    const gradeLevel = st.grade_level || 11;
    const candidateSubjects = subjectsByGrade[gradeLevel] || allSubjects;

    // Select 5-6 core/applied/specialized subjects per student
    const studentSubjects = candidateSubjects.slice(0, 6);

    for (const sub of studentSubjects) {
      // --- Term 1: Completed (WW: 0-30, PT: 0-20, QA: 0-50) ---
      let t1Quiz, t1Act, t1Exam;
      if (archetype === 'diligent') {
        t1Quiz = randInt(25, 30);
        t1Act = randInt(17, 20);
        t1Exam = randInt(42, 49);
      } else if (archetype === 'moderate') {
        t1Quiz = randInt(18, 24);
        t1Act = randInt(13, 16);
        t1Exam = randInt(33, 41);
      } else {
        // at_risk
        t1Quiz = randInt(10, 16);
        t1Act = randInt(8, 12);
        t1Exam = randInt(20, 31);
      }

      gradesBatch.push([
        st.id,
        sub.id,
        st.section_id || 0,
        '1st Term',
        t1Quiz,
        t1Act,
        t1Exam,
      ]);
      totalTerm1Grades++;

      // --- Term 2: In-Progress (WW: 0-30, PT: 0-20, QA Exam: NULL) ---
      let t2Quiz, t2Act;
      if (archetype === 'diligent') {
        t2Quiz = randInt(24, 29);
        t2Act = randInt(16, 20);
      } else if (archetype === 'moderate') {
        t2Quiz = randInt(17, 23);
        t2Act = randInt(12, 16);
      } else {
        // at_risk
        t2Quiz = randInt(10, 15);
        t2Act = randInt(7, 12);
      }

      gradesBatch.push([
        st.id,
        sub.id,
        st.section_id || 0,
        '2nd Term',
        t2Quiz,
        t2Act,
        null, // Exam not yet taken in Term 2!
      ]);
      totalTerm2Grades++;

      if (gradesBatch.length >= BATCH_SIZE) {
        await pool.query(
          `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score)
           VALUES ?`,
          [gradesBatch]
        );
        gradesBatch.length = 0;
      }
    }
  }

  if (gradesBatch.length > 0) {
    await pool.query(
      `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score)
       VALUES ?`,
      [gradesBatch]
    );
    gradesBatch.length = 0;
  }
  console.log(`  ✓ Inserted ${totalTerm1Grades} completed Term 1 grades (with final exams).`);
  console.log(`  ✓ Inserted ${totalTerm2Grades} in-progress Term 2 grades (exams pending).\n`);

  // 6. Retrain the Academic Risk Random Forest on live completed database records
  console.log('[Step 6/6] Training academic-risk Random Forest from live Term 1 outcomes...');
  const [completedRows] = await pool.query(
    `SELECT g.student_id, g.quiz_score, g.activity_score, g.exam_score,
            g.average AS finalAverage,
            (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*))
               FROM attendance_logs WHERE student_id = g.student_id AND scan_date <= '2026-09-15') AS attendanceRate
     FROM grades g
     WHERE g.term = '1st Term' AND g.exam_score > 0`
  );

  console.log(`  Training sample size from live database: ${completedRows.length} completed records`);

  const samples = completedRows.map((r) => ({
    features: toFeatureVector({
      quiz_score: r.quiz_score,
      activity_score: r.activity_score,
      attendanceRate: r.attendanceRate,
    }),
    label: classifyRisk(r.finalAverage, r.attendanceRate),
  }));

  const counts = { Low: 0, Medium: 0, High: 0 };
  samples.forEach((s) => counts[s.label]++);
  console.log(`  Class Distribution: Low Risk = ${counts.Low}, Medium Risk = ${counts.Medium}, High Risk = ${counts.High}`);

  const rf = train(samples);
  const trainPreds = rf.predict(samples.map((s) => s.features));
  const correct = trainPreds.filter((p, i) => RISK_LABELS[p] === samples[i].label).length;
  const trainAccuracy = (correct / samples.length) * 100;

  console.log(`  Training Accuracy: ${trainAccuracy.toFixed(1)}%`);

  save(rf, {
    sampleCount: samples.length,
    datasetType: 'Live Database (SY 2026-2027 Term 1 Completed)',
    classCounts: counts,
    trainAccuracy: Number(trainAccuracy.toFixed(1)),
    features: ['quiz_score (0-30 Written Works)', 'activity_score (0-20 Performance Tasks)', 'attendanceRate (0-100% Attendance)'],
  });
  console.log('  ✓ Persisted trained Random Forest to backend/ml/model.json\n');

  console.log('================================================================');
  console.log('  SUCCESS: SYNCHRONIZATION AND MODEL TRAINING COMPLETE!');
  console.log('================================================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('\nSeeding failed with error:', err);
  process.exit(1);
});

