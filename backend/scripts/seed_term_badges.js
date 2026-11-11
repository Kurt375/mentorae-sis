const pool = require('../config/db');

async function seedTermBadges() {
  console.log('--- Seeding Teacher-Awarded Badges for 1st Term & Ensuring Full Coverage ---');

  // 1. Get all students
  const [students] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.section_id, s.adviser_id, s.co_adviser_id
     FROM users u
     LEFT JOIN sections s ON s.id = u.section_id
     WHERE u.role = 'student'`
  );
  console.log(`Found ${students.length} students in system.`);

  // 2. Get all teachers
  const [teachers] = await pool.query("SELECT id, first_name, last_name FROM users WHERE role = 'teacher'");
  const teacherIds = teachers.map(t => t.id);
  console.log(`Found ${teachers.length} teachers in system.`);

  // 3. Get section schedule teachers
  const [schedRows] = await pool.query("SELECT DISTINCT section_id, teacher_id FROM schedules WHERE teacher_id IS NOT NULL");
  const sectionTeachersMap = {};
  schedRows.forEach(r => {
    if (!sectionTeachersMap[r.section_id]) sectionTeachersMap[r.section_id] = [];
    sectionTeachersMap[r.section_id].push(r.teacher_id);
  });

  // 4. Get available badges
  const [catalog] = await pool.query("SELECT id, name, points FROM badge_catalog");
  const badgeList = catalog.map(b => b.id);

  // 5. Check which students already have 2nd Term badges
  const [existing2ndTerm] = await pool.query(
    "SELECT DISTINCT student_id FROM student_badges WHERE earned_at >= '2026-09-16'"
  );
  const studentsWith2ndTerm = new Set(existing2ndTerm.map(r => r.student_id));
  console.log(`Students with existing 2nd Term badges: ${studentsWith2ndTerm.size} (these will be strictly preserved!).`);

  const term1BadgesToInsert = [];
  const term2MissingBadgesToInsert = [];
  const activityLogs = [];

  // Helper to pick random teacher for a student
  function getTeacherForStudent(st) {
    const possible = [];
    if (st.adviser_id) possible.push(st.adviser_id);
    if (st.co_adviser_id) possible.push(st.co_adviser_id);
    if (st.section_id && sectionTeachersMap[st.section_id]) {
      possible.push(...sectionTeachersMap[st.section_id]);
    }
    if (possible.length > 0) {
      return possible[Math.floor(Math.random() * possible.length)];
    }
    return teacherIds[Math.floor(Math.random() * teacherIds.length)];
  }

  // Helper to generate a random weekday timestamp in a date window
  function getRandomDate(startStr, endStr) {
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    let d;
    do {
      const randTime = start + Math.random() * (end - start);
      d = new Date(randTime);
    } while (d.getDay() === 0 || d.getDay() === 6); // Skip weekends

    // Set realistic school hours (8:30 AM to 4:30 PM)
    const hours = 8 + Math.floor(Math.random() * 8);
    const mins = Math.floor(Math.random() * 60);
    const secs = Math.floor(Math.random() * 60);
    d.setHours(hours, mins, secs);

    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  for (const st of students) {
    const teacherId = getTeacherForStudent(st);

    // 1st Term: Award 2 to 4 badges for every student
    // Window: 2026-06-15 to 2026-09-12
    const numTerm1Badges = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
    const shuffledBadges = [...badgeList].sort(() => 0.5 - Math.random());
    const term1Badges = shuffledBadges.slice(0, numTerm1Badges);

    term1Badges.forEach(badgeId => {
      const earnedAt = getRandomDate('2026-06-16T08:00:00', '2026-09-12T17:00:00');
      term1BadgesToInsert.push([st.id, badgeId, teacherId, earnedAt]);
      activityLogs.push([st.id, `Awarded "${badgeId}" badge in 1st Term`, earnedAt]);
    });

    // 2nd Term: If student has NO 2nd term badges yet, give them 2 badges
    if (!studentsWith2ndTerm.has(st.id)) {
      const numTerm2 = 2;
      const t2Badges = shuffledBadges.slice(numTerm1Badges, numTerm1Badges + numTerm2);
      t2Badges.forEach(badgeId => {
        const earnedAt = getRandomDate('2026-09-20T08:00:00', '2026-11-08T17:00:00');
        term2MissingBadgesToInsert.push([st.id, badgeId, teacherId, earnedAt]);
        activityLogs.push([st.id, `Awarded "${badgeId}" badge in 2nd Term`, earnedAt]);
      });
    }
  }

  console.log(`Generated ${term1BadgesToInsert.length} Term 1 badges to insert.`);
  console.log(`Generated ${term2MissingBadgesToInsert.length} Term 2 badges for students who had 0.`);

  // Insert in batches
  const allToInsert = [...term1BadgesToInsert, ...term2MissingBadgesToInsert];
  const BATCH_SIZE = 100;
  for (let i = 0; i < allToInsert.length; i += BATCH_SIZE) {
    const chunk = allToInsert.slice(i, i + BATCH_SIZE);
    await pool.query(
      'INSERT INTO student_badges (student_id, badge_id, awarded_by, earned_at) VALUES ?',
      [chunk]
    );
  }

  // Insert activity logs
  for (let i = 0; i < activityLogs.length; i += BATCH_SIZE) {
    const chunk = activityLogs.slice(i, i + BATCH_SIZE);
    await pool.query(
      'INSERT INTO activity_log (student_id, description, created_at) VALUES ?',
      [chunk]
    );
  }

  console.log('✅ Successfully seeded teacher-awarded badges across all students!');
  process.exit(0);
}

seedTermBadges().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});

