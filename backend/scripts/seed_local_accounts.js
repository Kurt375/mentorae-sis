const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function seed() {
  console.log('--- Seeding Local Mentorae Accounts ---');

  const defaultPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // 1. Ensure Admin Account (admin@talisay.shs)
  const [adminRows] = await pool.query("SELECT id FROM users WHERE email = 'admin@talisay.shs' OR id_number = 'ADMIN-0001'");
  let adminId;
  if (adminRows.length === 0) {
    const [res] = await pool.query(
      `INSERT INTO users (role, id_number, first_name, last_name, email, password_hash, must_change_password, is_active)
       VALUES ('admin', 'ADMIN-0001', 'System', 'Administrator', 'admin@talisay.shs', ?, 0, 1)`,
      [passwordHash]
    );
    adminId = res.insertId;
    console.log('Created Admin account (admin@talisay.shs / ADMIN-0001)');
  } else {
    adminId = adminRows[0].id;
    console.log('Admin account already exists with ID:', adminId);
  }

  // 2. Ensure Teacher Account (teacher@talisay.shs / TCH-0001)
  let teacherId;
  const [teacherRows] = await pool.query("SELECT id FROM users WHERE email = 'teacher@talisay.shs' OR id_number = 'TCH-0001'");
  if (teacherRows.length === 0) {
    const [res] = await pool.query(
      `INSERT INTO users (role, id_number, first_name, last_name, contact_number, email, password_hash, must_change_password, is_active)
       VALUES ('teacher', 'TCH-0001', 'Maria', 'Santos', '09181234567', 'teacher@talisay.shs', ?, 0, 1)`,
      [passwordHash]
    );
    teacherId = res.insertId;
    console.log('Created Teacher account (teacher@talisay.shs / TCH-0001)');
  } else {
    teacherId = teacherRows[0].id;
    console.log('Teacher account already exists with ID:', teacherId);
  }

  // 3. Ensure a Section exists (e.g. STEM 12 - Sigma Technocrats)
  const [strandRows] = await pool.query("SELECT id FROM strands WHERE code = 'STEM' LIMIT 1");
  const strandId = strandRows.length > 0 ? strandRows[0].id : 9;

  let sectionId;
  const [secRows] = await pool.query("SELECT id FROM sections WHERE strand_id = ? AND grade_level = 12 AND name = 'Sigma Technocrats' LIMIT 1", [strandId]);
  if (secRows.length === 0) {
    const [res] = await pool.query(
      `INSERT INTO sections (strand_id, grade_level, name, adviser_id)
       VALUES (?, 12, 'Sigma Technocrats', NULL)`,
      [strandId]
    );
    sectionId = res.insertId;
    console.log('Created Section: STEM 12 - Sigma Technocrats');
  } else {
    sectionId = secRows[0].id;
    console.log('Section STEM 12 - Sigma Technocrats already exists with ID:', sectionId);
  }

  // 4. Ensure Student Account (student@talisay.shs / 26-00001)
  let studentId;
  const [studentRows] = await pool.query("SELECT id FROM users WHERE email = 'student@talisay.shs' OR id_number = '26-00001'");
  if (studentRows.length === 0) {
    const [res] = await pool.query(
      `INSERT INTO users (role, id_number, first_name, middle_initial, last_name, contact_number, email, password_hash, section_id, qr_code_token, must_change_password, is_active, program, enrollment_status)
       VALUES ('student', '26-00001', 'Juan', 'A', 'Dela Cruz', '09191234567', 'student@talisay.shs', ?, ?, '26-00001', 0, 1, 'none', 'enrolled')`,
      [passwordHash, sectionId]
    );
    studentId = res.insertId;
    console.log('Created Student account (student@talisay.shs / 26-00001)');
  } else {
    studentId = studentRows[0].id;
    await pool.query("UPDATE users SET section_id = ? WHERE id = ?", [sectionId, studentId]);
    console.log('Student account already exists with ID:', studentId);
  }

  // 5. Ensure Parent Account (parent@talisay.shs / PAR-0001)
  let parentId;
  const [parentRows] = await pool.query("SELECT id FROM users WHERE email = 'parent@talisay.shs' OR id_number = 'PAR-0001'");
  if (parentRows.length === 0) {
    const [res] = await pool.query(
      `INSERT INTO users (role, id_number, first_name, last_name, contact_number, email, password_hash, must_change_password, is_active)
       VALUES ('parent', 'PAR-0001', 'Pedro', 'Dela Cruz', '09201234567', 'parent@talisay.shs', ?, 0, 1)`,
      [passwordHash]
    );
    parentId = res.insertId;
    console.log('Created Parent account (parent@talisay.shs / PAR-0001)');
  } else {
    parentId = parentRows[0].id;
    console.log('Parent account already exists with ID:', parentId);
  }

  // Link Parent to Student
  await pool.query(
    "INSERT INTO parent_student_links (parent_id, student_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE parent_id = parent_id",
    [parentId, studentId]
  );
  console.log('Linked Parent to Student.');

  // 6. Schedule (Assign Teacher to Subject & Section)
  const [subjRows] = await pool.query("SELECT id FROM subjects WHERE code IN ('GENMATH', 'COPRO1') LIMIT 1");
  const subjectId = subjRows.length > 0 ? subjRows[0].id : 1;

  const [schedRows] = await pool.query(
    "SELECT id FROM schedules WHERE teacher_id = ? AND subject_id = ? AND section_id = ?",
    [teacherId, subjectId, sectionId]
  );
  if (schedRows.length === 0) {
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      await pool.query(
        `INSERT INTO schedules (teacher_id, subject_id, section_id, day_of_week, start_time, end_time)
         VALUES (?, ?, ?, ?, '08:00:00', '09:00:00')`,
        [teacherId, subjectId, sectionId, day]
      );
    }
    console.log('Created schedules for Teacher Mon-Fri 8:00-9:00 AM.');
  }

  // 7. Starter Grade Record for the Student
  const [gradeRows] = await pool.query(
    "SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND section_id = ?",
    [studentId, subjectId, sectionId]
  );
  if (gradeRows.length === 0) {
    await pool.query(
      `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score, recorded_by)
       VALUES (?, ?, ?, '1st Term', 27.50, 18.00, 45.00, ?)`,
      [studentId, subjectId, sectionId, teacherId]
    );
    console.log('Created sample grade record for student.');
  }

  // 8. Scanner Key for Security (SCAN-1234)
  const scannerKey = 'SCAN-1234';
  const scannerHash = await bcrypt.hash(scannerKey, 10);
  const [keyRows] = await pool.query("SELECT id FROM scanner_keys WHERE label = 'Main Entrance Scanner' LIMIT 1");
  if (keyRows.length === 0) {
    await pool.query(
      `INSERT INTO scanner_keys (key_hash, label, is_active, created_by)
       VALUES (?, 'Main Entrance Scanner', 1, ?)`,
      [scannerHash, adminId]
    );
    console.log('Created Scanner Key: SCAN-1234');
  }

  console.log('\n--- Seeding Complete! ---');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
