const pool = require('../config/db');

const SCHOOL_OPEN = '07:00:00';
const SCHOOL_CLOSE = '15:30:00';

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** GET /api/schedules — full schedule table (admin), optionally ?search= */
async function listSchedules(req, res) {
  try {
    const params = [];
    let sql = `
      SELECT sch.id, sch.day_of_week, sch.start_time, sch.end_time, sch.quarter,
             t.first_name AS teacherFirst, t.last_name AS teacherLast,
             sub.name AS subjectName,
             st.code AS strandCode, sec.grade_level, sec.name AS sectionName
      FROM schedules sch
      JOIN users t ON t.id = sch.teacher_id
      JOIN subjects sub ON sub.id = sch.subject_id
      JOIN sections sec ON sec.id = sch.section_id
      JOIN strands st ON st.id = sec.strand_id`;

    if (req.query.search) {
      sql += ` WHERE t.first_name LIKE ? OR t.last_name LIKE ? OR sub.name LIKE ? OR sec.name LIKE ? OR sch.day_of_week LIKE ?`;
      const like = `%${req.query.search}%`;
      params.push(like, like, like, like, like);
    }
    sql += ' ORDER BY FIELD(sch.day_of_week, "Monday","Tuesday","Wednesday","Thursday","Friday"), sch.start_time';

    const [rows] = await pool.query(sql, params);
    const schedules = rows.map((r) => ({
      id: r.id,
      teacher: `${r.teacherFirst} ${r.teacherLast}`,
      subject: r.subjectName,
      strand: `${r.strandCode} ${r.grade_level}`,
      section: r.sectionName,
      day: r.day_of_week,
      startTime: r.start_time,
      endTime: r.end_time,
      quarter: r.quarter,
    }));

    return res.json({ success: true, schedules });
  } catch (err) {
    console.error('listSchedules error:', err);
    return res.status(500).json({ success: false, message: 'Could not load schedules.' });
  }
}

/** POST /api/schedules  { teacherId, subjectId, sectionId, days: [], startTime, endTime } */
async function createSchedule(req, res) {
  const { teacherId, subjectId, sectionId, days, startTime, endTime, quarter } = req.body;
  const validQuarters = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'];
  const scheduleQuarter = validQuarters.includes(quarter) ? quarter : '1st Quarter';

  if (!teacherId || !subjectId || !sectionId || !Array.isArray(days) || !days.length || !startTime || !endTime) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  if (startTime < SCHOOL_OPEN) {
    return res.status(400).json({ success: false, message: 'Schedule cannot start before 7:00 AM.' });
  }
  if (endTime > SCHOOL_CLOSE) {
    return res.status(400).json({ success: false, message: 'Schedule cannot end after 3:30 PM.' });
  }
  if (toMinutes(startTime) >= toMinutes(endTime)) {
    return res.status(400).json({ success: false, message: 'End time must be after start time.' });
  }
  const duration = toMinutes(endTime) - toMinutes(startTime);
  if (duration < 30) {
    return res.status(400).json({ success: false, message: 'Duration must be at least 30 minutes.' });
  }
  if (duration > 120) {
    return res.status(400).json({ success: false, message: 'Duration cannot exceed 2 hours.' });
  }

  try {
    const created = [];
    for (const day of days) {
      // Conflict check: same teacher already has an overlapping block that day
      const [conflicts] = await pool.query(
        `SELECT id FROM schedules WHERE teacher_id = ? AND day_of_week = ?
         AND NOT (end_time <= ? OR start_time >= ?)`,
        [teacherId, day, startTime, endTime]
      );
      if (conflicts.length) {
        return res.status(409).json({
          success: false,
          message: `Conflict: this teacher already has a class on ${day} that overlaps ${startTime}-${endTime}.`,
        });
      }

      const [result] = await pool.query(
        'INSERT INTO schedules (teacher_id, subject_id, section_id, quarter, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [teacherId, subjectId, sectionId, scheduleQuarter, day, startTime, endTime]
      );
      created.push(result.insertId);
    }

    return res.json({ success: true, message: `Schedule(s) created for ${days.join(', ')}.`, ids: created });
  } catch (err) {
    console.error('createSchedule error:', err);
    return res.status(500).json({ success: false, message: 'Could not create schedule.' });
  }
}

/** DELETE /api/schedules/:id */
async function deleteSchedule(req, res) {
  try {
    const [result] = await pool.query('DELETE FROM schedules WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Schedule not found.' });
    }
    return res.json({ success: true, message: 'Schedule deleted.' });
  } catch (err) {
    console.error('deleteSchedule error:', err);
    return res.status(500).json({ success: false, message: 'Could not delete schedule.' });
  }
}

/** GET /api/schedules/mine — the logged-in teacher's weekly grid */
async function getMySchedule(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT sch.day_of_week, sch.start_time, sch.end_time, sch.quarter, sub.name AS subjectName,
              st.code AS strandCode, sec.grade_level, sec.name AS sectionName
       FROM schedules sch
       JOIN subjects sub ON sub.id = sch.subject_id
       JOIN sections sec ON sec.id = sch.section_id
       JOIN strands st ON st.id = sec.strand_id
       WHERE sch.teacher_id = ?
       ORDER BY sch.start_time`,
      [req.user.id]
    );
    const schedule = rows.map((r) => ({
      day: r.day_of_week,
      startTime: r.start_time,
      endTime: r.end_time,
      quarter: r.quarter,
      subject: r.subjectName,
      strand: `${r.strandCode} ${r.grade_level}`,
      section: r.sectionName,
    }));
    return res.json({ success: true, schedule });
  } catch (err) {
    console.error('getMySchedule error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your schedule.' });
  }
}

module.exports = { listSchedules, createSchedule, deleteSchedule, getMySchedule };
