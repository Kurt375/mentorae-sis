const pool = require('../config/db');

/** True if this teacher has any schedule entry for this section (i.e. actually teaches it). */
async function teacherTeachesSection(teacherId, sectionId) {
  const [rows] = await pool.query('SELECT 1 FROM schedules WHERE teacher_id = ? AND section_id = ? LIMIT 1', [
    teacherId,
    sectionId,
  ]);
  return !!rows[0];
}

/** True if this teacher has ever taught this specific student (via a shared section on any of their schedules). */
async function teacherTeachesStudent(teacherId, studentId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM schedules sch
     JOIN users u ON u.section_id = sch.section_id
     WHERE sch.teacher_id = ? AND u.id = ? LIMIT 1`,
    [teacherId, studentId]
  );
  return !!rows[0];
}

/** True if this parent is linked to this student. */
async function parentLinkedToStudent(parentId, studentId) {
  const [rows] = await pool.query('SELECT 1 FROM parent_student_links WHERE parent_id = ? AND student_id = ? LIMIT 1', [
    parentId,
    studentId,
  ]);
  return !!rows[0];
}

/**
 * Shared gate for "can this logged-in user view this student's data?"
 * Returns { ok: true } or { ok: false, status, message }.
 * A student may always view their own; a parent only their linked child;
 * a teacher only a student they actually teach; an admin, anyone.
 */
async function canViewStudent(user, studentId) {
  if (user.role === 'admin') return { ok: true };
  if (user.role === 'student') {
    return String(user.id) === String(studentId)
      ? { ok: true }
      : { ok: false, status: 403, message: 'You can only view your own records.' };
  }
  if (user.role === 'parent') {
    const linked = await parentLinkedToStudent(user.id, studentId);
    return linked ? { ok: true } : { ok: false, status: 403, message: "You can only view your own child's records." };
  }
  if (user.role === 'teacher') {
    const teaches = await teacherTeachesStudent(user.id, studentId);
    return teaches ? { ok: true } : { ok: false, status: 403, message: 'You do not teach this student.' };
  }
  return { ok: false, status: 403, message: 'You do not have permission to view this.' };
}

module.exports = { teacherTeachesSection, teacherTeachesStudent, parentLinkedToStudent, canViewStudent };
