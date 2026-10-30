const pool = require('../config/db');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const SCHOOL_OPEN = '07:00:00';
const SCHOOL_CLOSE = '15:30:00';

function toMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const validTerms = [
  'All Terms', '1st Term', '2nd Term', '3rd Term',
  '1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'
];

function parseTerm(raw) {
  if (!raw) return '1st Term';
  const str = String(raw).trim().toLowerCase();
  if (str === 'all' || str === 'all terms' || str === 'all term' || str === 'all quarters') {
    return 'All Terms';
  }
  // Quarters
  if (str === '1st quarter' || str === 'quarter 1' || str === 'q1' || str === 'first quarter') {
    return '1st Quarter';
  }
  if (str === '2nd quarter' || str === 'quarter 2' || str === 'q2' || str === 'second quarter') {
    return '2nd Quarter';
  }
  if (str === '3rd quarter' || str === 'quarter 3' || str === 'q3' || str === 'third quarter') {
    return '3rd Quarter';
  }
  if (str === '4th quarter' || str === 'quarter 4' || str === 'q4' || str === 'fourth quarter') {
    return '4th Quarter';
  }
  // Terms
  if (str === '1st term' || str === 'term 1' || str === 't1' || str === '1' || str === 'first term') {
    return '1st Term';
  }
  if (str === '2nd term' || str === 'term 2' || str === 't2' || str === '2' || str === 'second term') {
    return '2nd Term';
  }
  if (str === '3rd term' || str === 'term 3' || str === 't3' || str === '3' || str === 'third term') {
    return '3rd Term';
  }

  const exactMatch = validTerms.find((t) => t.toLowerCase() === str);
  return exactMatch || '1st Term';
}

function parseTime(val) {
  if (val === null || val === undefined || val === '') return null;

  // 1. Raw JavaScript number
  if (typeof val === 'number') {
    // Excel decimal time fraction (e.g. 0.2916666666666667 for 7:00 AM)
    if (val >= 0 && val < 1) {
      const totalMinutes = Math.round(val * 1440);
      const hours = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    }
    // Excel date+time serial (e.g. 45566.2916666666666667)
    if (val >= 1000 && val < 100000) {
      const frac = val % 1;
      const totalMinutes = Math.round(frac * 1440);
      const hours = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    }
    // Plain hour number (e.g. 7 or 14)
    if (val >= 1 && val < 24) {
      const h = Math.floor(val);
      const m = Math.round((val % 1) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
  }

  let str = String(val).trim().replace(/^["']+|["']+$/g, '').trim();
  if (!str) return null;

  // Normalize non-breaking spaces, excess whitespace, and a.m./p.m./am/pm notations
  str = str.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ');
  str = str.replace(/([ap])\s*\.?\s*m\.?/i, (_match, p) => p.toUpperCase() + 'M');

  // 2. Excel decimal serial string (e.g. "0.2916666666666667", "0.375", "0.5")
  if (/^0\.\d+$/.test(str)) {
    const num = parseFloat(str);
    if (!isNaN(num) && num >= 0 && num < 1) {
      const totalMinutes = Math.round(num * 1440);
      const hours = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    }
  }

  // 3. Excel date+time serial string (e.g. "45566.2916666666666667")
  if (/^\d{4,5}\.\d+$/.test(str)) {
    const num = parseFloat(str);
    const frac = num % 1;
    const totalMinutes = Math.round(frac * 1440);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  }

  // 4. Military / compact 4-digit time (e.g. "0730", "1330", "0900")
  if (/^\d{4}$/.test(str)) {
    const h = parseInt(str.slice(0, 2), 10);
    const m = parseInt(str.slice(2), 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
  }

  // 5. Standard format with hours and minutes, colon or dot separator, optional seconds, optional AM/PM
  // Matches: "7:30 AM", "7:30 am", "7:30 Am", "07:30am", "7.30 AM", "7.30am", "13:30", "7:30", "7.30", "07:30:00 AM", etc.
  const colonOrDotMatch = str.match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(AM|PM)?$/i);
  if (colonOrDotMatch) {
    let h = parseInt(colonOrDotMatch[1], 10);
    const m = parseInt(colonOrDotMatch[2], 10);
    const ampm = colonOrDotMatch[4] ? colonOrDotMatch[4].toUpperCase() : null;
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) {
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
  }

  // 6. Hour-only format with AM/PM (e.g. "7 AM", "7am", "7AM", "12 PM", "2pm", "03 PM")
  const hourOnlyMatch = str.match(/^(\d{1,2})\s*(AM|PM)$/i);
  if (hourOnlyMatch) {
    let h = parseInt(hourOnlyMatch[1], 10);
    const ampm = hourOnlyMatch[2].toUpperCase();
    if (h >= 1 && h <= 12) {
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:00:00`;
    }
  }

  // 7. Plain integer hour (e.g. "7", "14")
  if (/^\d{1,2}$/.test(str)) {
    const h = parseInt(str, 10);
    if (h >= 0 && h < 24) {
      return `${String(h).padStart(2, '0')}:00:00`;
    }
  }

  return null;
}

const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseDays(raw) {
  if (!raw) return [];
  const str = String(raw).trim();
  const upper = str.toUpperCase().replace(/\s+/g, ' ');

  // Full week / all weekdays / daily
  if (
    upper === 'ALL' ||
    upper === 'ALL WEEKDAYS' ||
    upper === 'WEEKDAYS' ||
    upper === 'DAILY' ||
    upper === 'MON-FRI' ||
    upper === 'M-F' ||
    upper === 'MONDAY-FRIDAY' ||
    upper === 'MONDAY TO FRIDAY' ||
    upper === 'MTWTHF' ||
    upper === 'MTWTF'
  ) {
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  }

  // Cleaned alphanumeric only for quick acronym matching (case-insensitive)
  const cleanedCompact = upper.replace(/[^A-Z]/g, '');
  if (cleanedCompact === 'MWF' || upper === 'MON-WED-FRI' || upper === 'MON/WED/FRI') {
    return ['Monday', 'Wednesday', 'Friday'];
  }
  if (
    cleanedCompact === 'TTH' ||
    cleanedCompact === 'TTHS' ||
    upper === 'T-TH' ||
    upper === 'T/TH' ||
    upper === 'T TH' ||
    upper === 'TUE-THU' ||
    upper === 'TUE/THU' ||
    upper === 'TUES-THURS' ||
    upper === 'TUES/THURS'
  ) {
    return ['Tuesday', 'Thursday'];
  }
  if (cleanedCompact === 'MW' || upper === 'MON-WED' || upper === 'MON/WED') {
    return ['Monday', 'Wednesday'];
  }
  if (cleanedCompact === 'TF' || upper === 'TUE-FRI' || upper === 'TUE/FRI') {
    return ['Tuesday', 'Friday'];
  }

  // Split on delimiters: commas, slashes, hyphens, semicolons, ampersands, "+", "and"
  const tokens = str
    .split(/[,;/+&|\s]+|(?:\s+and\s+)|\s*-\s*/i)
    .map((t) => t.trim())
    .filter(Boolean);

  const dayMap = {
    m: 'Monday',
    mo: 'Monday',
    mon: 'Monday',
    monday: 'Monday',

    t: 'Tuesday',
    tu: 'Tuesday',
    tue: 'Tuesday',
    tues: 'Tuesday',
    tuesday: 'Tuesday',

    w: 'Wednesday',
    we: 'Wednesday',
    wed: 'Wednesday',
    wednesday: 'Wednesday',

    th: 'Thursday',
    thu: 'Thursday',
    thur: 'Thursday',
    thurs: 'Thursday',
    thursday: 'Thursday',

    f: 'Friday',
    fr: 'Friday',
    fri: 'Friday',
    friday: 'Friday',

    s: 'Saturday',
    sa: 'Saturday',
    sat: 'Saturday',
    saturday: 'Saturday',
  };

  const resolved = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (key === 'tth' || key === 'tths') {
      if (!resolved.includes('Tuesday')) resolved.push('Tuesday');
      if (!resolved.includes('Thursday')) resolved.push('Thursday');
      continue;
    }
    if (key === 'mwf') {
      if (!resolved.includes('Monday')) resolved.push('Monday');
      if (!resolved.includes('Wednesday')) resolved.push('Wednesday');
      if (!resolved.includes('Friday')) resolved.push('Friday');
      continue;
    }
    if (key === 'mw') {
      if (!resolved.includes('Monday')) resolved.push('Monday');
      if (!resolved.includes('Wednesday')) resolved.push('Wednesday');
      continue;
    }
    if (dayMap[key] && !resolved.includes(dayMap[key])) {
      resolved.push(dayMap[key]);
    }
  }

  return resolved;
}

/**
 * Checks whether a given teacher or section has an overlapping schedule.
 * Returns { hasConflict: boolean, type: 'teacher'|'section'|null, message: string }
 */
async function checkScheduleConflict({
  teacherId,
  sectionId,
  day,
  startTime,
  endTime,
  quarter = 'All Terms',
  excludeScheduleId = null,
  inMemorySchedules = [],
}) {
  const qFilter = (quarter === 'All Terms')
    ? ''
    : "AND (sch.quarter = ? OR sch.quarter = 'All Terms')";
  const qParams = (quarter === 'All Terms') ? [] : [quarter];

  const excludeFilter = excludeScheduleId ? 'AND sch.id != ?' : '';
  const excludeParams = excludeScheduleId ? [excludeScheduleId] : [];

  // 1. Database Teacher Overlap Check
  const [teacherConflicts] = await pool.query(
    `SELECT sch.id, sch.start_time, sch.end_time, sch.day_of_week, sch.quarter,
            sub.name AS subject_name, sec.name AS section_name
     FROM schedules sch
     JOIN subjects sub ON sub.id = sch.subject_id
     JOIN sections sec ON sec.id = sch.section_id
     WHERE sch.teacher_id = ? AND sch.day_of_week = ?
       ${qFilter}
       ${excludeFilter}
       AND NOT (sch.end_time <= ? OR sch.start_time >= ?)
     LIMIT 1`,
    [teacherId, day, ...qParams, ...excludeParams, startTime, endTime]
  );

  if (teacherConflicts.length > 0) {
    const c = teacherConflicts[0];
    return {
      hasConflict: true,
      type: 'teacher',
      message: `Teacher conflict on ${day}: Already assigned to ${c.subject_name} (${c.section_name}) at ${c.start_time.slice(0, 5)} - ${c.end_time.slice(0, 5)}.`,
    };
  }

  // 2. Database Section Overlap Check
  const [sectionConflicts] = await pool.query(
    `SELECT sch.id, sch.start_time, sch.end_time, sch.day_of_week, sch.quarter,
            sub.name AS subject_name, sec.name AS section_name,
            u.first_name, u.last_name
     FROM schedules sch
     JOIN subjects sub ON sub.id = sch.subject_id
     JOIN sections sec ON sec.id = sch.section_id
     JOIN users u ON u.id = sch.teacher_id
     WHERE sch.section_id = ? AND sch.day_of_week = ?
       ${qFilter}
       ${excludeFilter}
       AND NOT (sch.end_time <= ? OR sch.start_time >= ?)
     LIMIT 1`,
    [sectionId, day, ...qParams, ...excludeParams, startTime, endTime]
  );

  if (sectionConflicts.length > 0) {
    const c = sectionConflicts[0];
    return {
      hasConflict: true,
      type: 'section',
      message: `Section conflict on ${day}: Section ${c.section_name} already has ${c.subject_name} with ${c.first_name} ${c.last_name} at ${c.start_time.slice(0, 5)} - ${c.end_time.slice(0, 5)}.`,
    };
  }

  // 3. In-Memory Staged Schedules Check (for bulk import batches)
  const newStartMin = toMinutes(startTime);
  const newEndMin = toMinutes(endTime);

  for (const s of inMemorySchedules) {
    if (s.day !== day) continue;

    const termsOverlap = (s.quarter === 'All Terms' || quarter === 'All Terms' || s.quarter === quarter);
    if (!termsOverlap) continue;

    const sStartMin = toMinutes(s.startTime);
    const sEndMin = toMinutes(s.endTime);
    const timeOverlap = !(sEndMin <= newStartMin || sStartMin >= newEndMin);

    if (timeOverlap) {
      if (s.teacherId === teacherId) {
        return {
          hasConflict: true,
          type: 'teacher',
          message: `Teacher conflict on ${day} (file overlap): Already assigned to another class during ${s.startTime.slice(0, 5)} - ${s.endTime.slice(0, 5)}.`,
        };
      }
      if (s.sectionId === sectionId) {
        return {
          hasConflict: true,
          type: 'section',
          message: `Section conflict on ${day} (file overlap): Section already assigned to another class during ${s.startTime.slice(0, 5)} - ${s.endTime.slice(0, 5)}.`,
        };
      }
    }
  }

  return { hasConflict: false };
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
    sql += " ORDER BY FIELD(sch.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday'), sch.start_time";

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
  const { teacherId, subjectId, sectionId, days: rawDays, startTime: rawStart, endTime: rawEnd, quarter } = req.body;
  const scheduleQuarter = parseTerm(quarter);
  const startTime = parseTime(rawStart);
  const endTime = parseTime(rawEnd);
  const days = Array.isArray(rawDays) ? rawDays : parseDays(rawDays);

  if (!teacherId || !subjectId || !sectionId || !Array.isArray(days) || !days.length || !startTime || !endTime) {
    return res.status(400).json({ success: false, message: 'All fields are required and time format must be valid (e.g. 07:30 AM or 13:30).' });
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
      // Universal conflict check: ensure teacher and section are both free
      const conflict = await checkScheduleConflict({
        teacherId,
        sectionId,
        day,
        startTime,
        endTime,
        quarter: scheduleQuarter,
      });

      if (conflict.hasConflict) {
        return res.status(409).json({
          success: false,
          message: conflict.message,
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

    // Fetch teacher's name from database
    const [teacherRows] = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = ?',
      [req.user.id]
    );
    const teacherName = teacherRows.length
      ? `${teacherRows[0].first_name || ''} ${teacherRows[0].last_name || ''}`.trim()
      : 'Teacher';

    // Fetch school principal settings
    const [settingRows] = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('school_principal', 'school_principal_title')"
    );
    const settingsMap = {};
    settingRows.forEach((r) => (settingsMap[r.setting_key] = r.setting_value));

    const schedule = rows.map((r) => ({
      day: r.day_of_week,
      startTime: r.start_time,
      endTime: r.end_time,
      quarter: r.quarter,
      subject: r.subjectName,
      strand: `${r.strandCode} ${r.grade_level}`,
      section: r.sectionName,
    }));

    return res.json({
      success: true,
      teacherName,
      principalName: settingsMap.school_principal || 'SCHOOL PRINCIPAL / HEAD',
      principalTitle: settingsMap.school_principal_title || 'Talisay Senior High School',
      schedule,
    });
  } catch (err) {
    console.error('getMySchedule error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your schedule.' });
  }
}

/**
 * GET /api/schedules/bulk-import/template
 * Downloads either:
 * - format=tshs (default): Official DepEd / TSHS Teacher's Program Timetable Workbook
 * - format=master: Full 43-Teacher TSHS Real Timetable Workbook
 * - format=table: Standard row-by-row table template (.xlsx)
 */
async function downloadScheduleTemplate(req, res) {
  try {
    const format = String(req.query.format || 'tshs').toLowerCase().trim();

    // 1. Full Master 43-Teacher Schedule Workbook
    if (format === 'master') {
      const masterPath = fs.existsSync(path.resolve(__dirname, '../templates/tshs_master_real_schedule.xlsx'))
        ? path.resolve(__dirname, '../templates/tshs_master_real_schedule.xlsx')
        : path.resolve(__dirname, '../../frontend/Teacher\'s Real Sched.xlsx');
      if (fs.existsSync(masterPath)) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="TSHS_Master_Teachers_Schedule.xlsx"');
        return fs.createReadStream(masterPath).pipe(res);
      }
    }

    // 2. Tabular Row-by-Row Schedule Template (.xlsx)
    if (format === 'table') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Mentorae SIS';
      wb.lastModifiedBy = 'Mentorae SIS Admin';
      wb.created = new Date();
      wb.modified = new Date();

      const ws = wb.addWorksheet('Schedules', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }]
      });

      ws.columns = [
        { header: 'Teacher ID or Name', key: 'teacher', width: 26 },
        { header: 'Subject', key: 'subject', width: 32 },
        { header: 'Cluster Code', key: 'strand', width: 16 },
        { header: 'Grade Level', key: 'grade', width: 14 },
        { header: 'Section Name', key: 'section', width: 28 },
        { header: 'Academic Term', key: 'quarter', width: 18 },
        { header: 'Day of Week', key: 'day', width: 22 },
        { header: 'Start Time', key: 'startTime', width: 16 },
        { header: 'End Time', key: 'endTime', width: 16 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A5C2C' } };
        cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF07421F' } },
          bottom: { style: 'medium', color: { argb: 'FF07421F' } },
          left: { style: 'thin', color: { argb: 'FF15803D' } },
          right: { style: 'thin', color: { argb: 'FF15803D' } },
        };
      });

      const samples = [
        ['Princess Mel Suelto', 'General Mathematics', 'STEM', '11', 'Medical Sciences', '1st Term', 'Monday, Wednesday', '07:00 AM', '08:00 AM'],
        ['Angelica Mae Custodio', 'General Mathematics', 'STEM', '11', 'Engineering', '1st Term', 'Tuesday, Thursday', '09:20 AM', '10:20 AM'],
        ['Joshua R. Almazon', 'Effective Communication', 'ASSH', '11', 'Humanities 2', '1st Term', 'Wednesday, Thursday, Friday', '07:00 AM', '08:00 AM'],
      ];

      samples.forEach((r, idx) => {
        const row = ws.addRow(r);
        row.height = 22;
        const isEven = idx % 2 === 0;
        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1F2937' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF0FDF4' },
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
          if ([3, 4, 6, 8, 9].includes(colNum)) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }
        });
      });

      ws.autoFilter = 'A1:I1';
      ws.getColumn(8).numFmt = '@';
      ws.getColumn(9).numFmt = '@';

      const buffer = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="mentorae-schedule-table-template.xlsx"');
      return res.send(buffer);
    }

    // 3. Official TSHS Real Teacher Program Timetable Workbook (Default)
    const masterPath = fs.existsSync(path.resolve(__dirname, '../templates/tshs_master_real_schedule.xlsx'))
      ? path.resolve(__dirname, '../templates/tshs_master_real_schedule.xlsx')
      : (fs.existsSync(path.resolve(__dirname, '../../frontend/Teacher\'s Real Sched.xlsx'))
          ? path.resolve(__dirname, '../../frontend/Teacher\'s Real Sched.xlsx')
          : path.resolve(__dirname, '../templates/tshs_schedule_template.xlsx'));

    if (fs.existsSync(masterPath)) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Teacher\'s Real Sched.xlsx"');
      return fs.createReadStream(masterPath).pipe(res);
    }

    return res.status(404).json({ success: false, message: 'Template file not found.' });
  } catch (err) {
    console.error('downloadScheduleTemplate error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate template file.' });
  }
}

/**
 * Checks if an Excel workbook follows the official DepEd / TSHS Teacher Program Timetable layout.
 */
function isTshsTeacherProgramWorkbook(workbook) {
  if (!workbook || !Array.isArray(workbook.SheetNames)) return false;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const a12 = String((sheet['A12'] || {}).v || '').toUpperCase();
    const a13 = String((sheet['A13'] || {}).v || '').toUpperCase();
    const a14 = String((sheet['A14'] || {}).v || '').toUpperCase();
    const a16 = String((sheet['A16'] || {}).v || '').toUpperCase();
    const b16 = String((sheet['B16'] || {}).v || '').toUpperCase();
    const c16 = String((sheet['C16'] || {}).v || '').toUpperCase();

    if (
      a12.includes("TEACHER'S PROGRAM") ||
      a13.includes("TERM") ||
      (a16.includes("TIME") && (b16.includes("MONDAY") || c16.includes("TUESDAY")))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Helper to parse a time range like "7:00 am - 8:00 am" or "12:00 nn - 2:00 pm".
 */
function parseTimeRangeBlock(raw) {
  if (!raw) return null;
  let str = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  str = str.replace(/(\d{1,2}:\d{2}):(\d{1,2}:\d{2})/, '$1-$2');

  const m = str.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|nn)?)\s*[-–to]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|nn)?)/i);
  if (!m) return null;

  function toTimeString(t, fallbackAmPm = null) {
    t = t.replace(/\s+/g, '').toLowerCase();
    let ampm = null;
    if (t.includes('nn') || t.includes('noon')) {
      ampm = 'PM';
      t = t.replace(/(nn|noon)/g, '');
    } else if (t.includes('am')) {
      ampm = 'AM';
      t = t.replace('am', '');
    } else if (t.includes('pm')) {
      ampm = 'PM';
      t = t.replace('pm', '');
    } else {
      ampm = fallbackAmPm;
    }

    let [h, min] = t.split(':').map(Number);
    if (isNaN(min)) min = 0;
    if (isNaN(h)) return null;

    if (!ampm) {
      if (h >= 1 && h <= 5) ampm = 'PM';
      else if (h >= 6 && h <= 11) ampm = 'AM';
      else if (h === 12) ampm = 'PM';
    }

    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;

    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
  }

  const s = toTimeString(m[1].trim());
  const e = toTimeString(m[2].trim());
  if (!s || !e) return null;
  return { startTime: s, endTime: e };
}

/**
 * Bulk imports schedules from the official TSHS Teacher Program Timetable layout.
 */
async function importTshsTeacherProgramGrid(workbook, req, res) {
  try {
    // 1. Fetch DB reference datasets
    const [teachers] = await pool.query("SELECT id, id_number, first_name, last_name, email FROM users WHERE role = 'teacher'");
    const [strands] = await pool.query("SELECT id, code, title FROM strands");
    const [sections] = await pool.query(`
      SELECT sec.id, sec.name, sec.grade_level, sec.strand_id, st.code AS strand_code
      FROM sections sec
      JOIN strands st ON st.id = sec.strand_id
    `);
    const [subjects] = await pool.query("SELECT id, name, code, strand, grade_level, quarter FROM subjects");

    // Pre-load existing schedules to avoid duplicates
    const [existingSchedules] = await pool.query(
      "SELECT teacher_id, subject_id, section_id, quarter, day_of_week, start_time, end_time FROM schedules"
    );
    const existingSchedSet = new Set(
      existingSchedules.map(
        (s) => `${s.teacher_id}_${s.subject_id}_${s.section_id}_${s.quarter}_${s.day_of_week}_${s.start_time}_${s.end_time}`
      )
    );

    // In-memory conflict checker index (O(1) lookups, zero DB round-trips in loop)
    const teacherDaySlots = new Map();
    const sectionDaySlots = new Map();

    function addSlotToMemory(tId, secId, d, sTime, eTime, q) {
      const sMin = toMinutes(sTime);
      const eMin = toMinutes(eTime);
      const tKey = `${tId}_${d}`;
      if (!teacherDaySlots.has(tKey)) teacherDaySlots.set(tKey, []);
      teacherDaySlots.get(tKey).push({ sMin, eMin, quarter: q, startTime: sTime, endTime: eTime });

      const secKey = `${secId}_${d}`;
      if (!sectionDaySlots.has(secKey)) sectionDaySlots.set(secKey, []);
      sectionDaySlots.get(secKey).push({ sMin, eMin, quarter: q, startTime: sTime, endTime: eTime });
    }

    existingSchedules.forEach((s) => {
      addSlotToMemory(s.teacher_id, s.section_id, s.day_of_week, String(s.start_time), String(s.end_time), s.quarter);
    });

    function hasSlotConflict(tId, secId, d, sTime, eTime, q) {
      const sMin = toMinutes(sTime);
      const eMin = toMinutes(eTime);

      const tKey = `${tId}_${d}`;
      const tSlots = teacherDaySlots.get(tKey);
      if (tSlots) {
        for (const slot of tSlots) {
          const termsOverlap = (slot.quarter === 'All Terms' || q === 'All Terms' || slot.quarter === q);
          if (termsOverlap && !(slot.eMin <= sMin || slot.sMin >= eMin)) {
            return true;
          }
        }
      }

      const secKey = `${secId}_${d}`;
      const secSlots = sectionDaySlots.get(secKey);
      if (secSlots) {
        for (const slot of secSlots) {
          const termsOverlap = (slot.quarter === 'All Terms' || q === 'All Terms' || slot.quarter === q);
          if (termsOverlap && !(slot.eMin <= sMin || slot.sMin >= eMin)) {
            return true;
          }
        }
      }

      return false;
    }

    const defaultPasswordHash = await bcrypt.hash('Teacher@2026', 10);

    // Track max teacher id_number for auto-registration
    let maxTeacherNum = 220;
    teachers.forEach((t) => {
      const m = String(t.id_number || '').match(/26-(\d+)/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxTeacherNum) maxTeacherNum = num;
      }
    });

    const teacherMap = new Map();
    teachers.forEach((t) => {
      const full1 = `${t.first_name} ${t.last_name}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const full2 = `${t.last_name}, ${t.first_name}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const full3 = `${t.last_name} ${t.first_name}`.toLowerCase().replace(/\s+/g, ' ').trim();
      teacherMap.set(full1, t);
      teacherMap.set(full2, t);
      teacherMap.set(full3, t);
      if (t.id_number) teacherMap.set(t.id_number.toLowerCase(), t);
    });

    const sectionMap = new Map();
    sections.forEach((s) => {
      const key1 = `${s.strand_code} ${s.grade_level} - ${s.name}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const key2 = `${s.name}`.toLowerCase().replace(/\s+/g, ' ').trim();
      sectionMap.set(key1, s);
      sectionMap.set(key2, s);
    });

    async function getOrCreateTeacher(teacherRawName, sheetName) {
      let raw = (teacherRawName || sheetName || '').replace(/\s+/g, ' ').trim();
      raw = raw.replace(/\b(LSB Teacher|Teacher\s+[I|V|X]+|Special Science Teacher\s+[I|V|X]+)\b/gi, '').trim();

      const rawLower = raw.toLowerCase();
      if (teacherMap.has(rawLower)) return teacherMap.get(rawLower);

      for (const t of teachers) {
        const tLast = t.last_name.toLowerCase();
        const tFirst = t.first_name.toLowerCase();
        if (rawLower.includes(tLast) && (rawLower.includes(tFirst) || rawLower.includes(tFirst.split(' ')[0]))) {
          teacherMap.set(rawLower, t);
          return t;
        }
      }

      // Parse name components
      let firstName = '';
      let lastName = '';
      let middleInitial = '';

      if (raw.includes(',')) {
        const parts = raw.split(',').map((s) => s.trim());
        lastName = parts[0];
        const rest = parts[1] || '';
        const restParts = rest.split(' ');
        if (restParts.length > 1 && restParts[restParts.length - 1].length <= 2) {
          middleInitial = restParts.pop().replace('.', '');
        }
        firstName = restParts.join(' ');
      } else {
        const parts = raw.split(' ');
        if (parts.length > 2 && parts[parts.length - 1].length <= 2) {
          middleInitial = parts.pop().replace('.', '');
        }
        lastName = parts.pop() || '';
        firstName = parts.join(' ');
      }

      function titleCase(s) {
        return s.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      firstName = titleCase(firstName) || 'Teacher';
      lastName = titleCase(lastName) || 'TSHS';

      maxTeacherNum++;
      const idNumber = `26-${String(maxTeacherNum).padStart(5, '0')}`;
      const email = `${firstName.toLowerCase().replace(/[^a-z]/g, '')}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}${maxTeacherNum}@tshs.deped.gov.ph`;

      const [res] = await pool.query(
        `INSERT INTO users (role, id_number, first_name, middle_initial, last_name, email, password_hash, must_change_password, is_active)
         VALUES ('teacher', ?, ?, ?, ?, ?, ?, 1, 1)`,
        [idNumber, firstName, middleInitial ? middleInitial + '.' : null, lastName, email, defaultPasswordHash]
      );

      const newTeacher = {
        id: res.insertId,
        id_number: idNumber,
        first_name: firstName,
        last_name: lastName,
        email,
        isNew: true,
      };

      teachers.push(newTeacher);
      teacherMap.set(rawLower, newTeacher);
      teacherMap.set(`${firstName} ${lastName}`.toLowerCase(), newTeacher);
      return newTeacher;
    }

    async function getOrCreateSection(sectionRaw) {
      let str = String(sectionRaw || '').replace(/\s+/g, ' ').trim();
      if (!str) return null;
      if (str.includes('&')) str = str.split('&')[0].trim();

      const key = str.toLowerCase();
      if (sectionMap.has(key)) return sectionMap.get(key);

      const m = str.match(/^([A-Z&]+)?\s*(\d{2})?\s*[-–]?\s*(.+)$/i);
      let strandCode = m && m[1] ? m[1].toUpperCase() : '';
      let grade = m && m[2] ? parseInt(m[2], 10) : 11;
      let secName = m && m[3] ? m[3].trim() : str;

      if (secName.toLowerCase().includes('buisness')) secName = secName.replace(/buisness/i, 'Business');
      if (secName.toLowerCase().includes('criminilogy')) secName = secName.replace(/criminilogy/i, 'Criminology');
      if (secName.toLowerCase() === 'a&ss 1') secName = 'Arts & Social Sciences 1';
      if (secName.toLowerCase() === 'a&ss 2') secName = 'Arts & Social Sciences 2';

      for (const [k, s] of sectionMap.entries()) {
        if (s.name.toLowerCase() === secName.toLowerCase() && (!grade || s.grade_level === grade)) {
          sectionMap.set(key, s);
          return s;
        }
      }

      let targetStrand = strands.find((st) => st.code.toUpperCase() === strandCode);
      if (!targetStrand) {
        if (str.toUpperCase().includes('ALS')) targetStrand = strands.find((st) => st.code === 'TVL') || strands[0];
        else if (str.toUpperCase().includes('HUMANITIES')) targetStrand = strands.find((st) => st.code === 'ASSH') || strands[0];
        else targetStrand = strands[0];
      }

      const [res] = await pool.query(
        'INSERT INTO sections (strand_id, grade_level, name) VALUES (?, ?, ?)',
        [targetStrand.id, grade, secName]
      );

      const newSec = {
        id: res.insertId,
        name: secName,
        grade_level: grade,
        strand_id: targetStrand.id,
        strand_code: targetStrand.code,
        isNew: true,
      };

      sections.push(newSec);
      sectionMap.set(key, newSec);
      sectionMap.set(secName.toLowerCase(), newSec);
      sectionMap.set(`${targetStrand.code} ${grade} - ${secName}`.toLowerCase(), newSec);
      return newSec;
    }

    function resolveSubject(raw) {
      if (!raw) return null;
      function clean(s) {
        return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
      }
      const rawClean = clean(raw);
      let found = subjects.find((s) => clean(s.name) === rawClean || clean(s.code) === rawClean);
      if (found) return found;

      const aliases = {
        creativecomposition: 'Creative Composition',
        phlippinegovernance: 'Philippine Governance',
        philippinegovernance: 'Philippine Governance',
        introductiontothephiliosophyofthehumanperson: 'Introduction to the Philosophy of the Human Person',
        lifeandcareerskills: 'Life and Career Skills',
        peandhealth: 'P.E. and Health',
        communityengagementsolidarityandcititzenship: 'Community Engagement, Solidarity, and Citizenship',
        fundamentalsofaccountancybusinessandmanagement2: 'Fundamentals of Accountancy, Business and Management 2',
        bakeryoperationsncii: 'Bakery Operations NC II',
        cookeryncii: 'Cookery NC II',
      };

      if (aliases[rawClean]) {
        const target = clean(aliases[rawClean]);
        found = subjects.find((s) => clean(s.name) === target);
        if (found) return found;
      }

      found = subjects.find((s) => {
        const sc = clean(s.name);
        return (sc.length >= 6 && rawClean.includes(sc)) || (rawClean.length >= 6 && sc.includes(rawClean));
      });
      if (found) return found;

      let best = null;
      let maxScore = 0;
      subjects.forEach((s) => {
        const sc = clean(s.name);
        let common = 0;
        for (let i = 0; i < Math.min(sc.length, rawClean.length); i++) {
          if (sc[i] === rawClean[i]) common++;
        }
        if (common > maxScore && common >= 6) {
          maxScore = common;
          best = s;
        }
      });

      return best;
    }

    const schedulesToInsert = [];
    const sheetResults = [];
    let newTeachersCount = 0;
    let newSectionsCount = 0;

    for (let sIdx = 0; sIdx < workbook.SheetNames.length; sIdx++) {
      const sheetName = workbook.SheetNames[sIdx];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const teacherHeader = String((sheet['A14'] || {}).v || sheetName).trim();
      const lowerSheet = sheetName.toLowerCase().trim();
      const lowerHeader = teacherHeader.toLowerCase().trim();

      // Skip non-teacher helper sheets (e.g. Instructions, Blank Template, Reference Guides)
      if (
        lowerSheet.includes('instruction') ||
        lowerSheet.includes('guide') ||
        lowerSheet.includes('blank') ||
        lowerSheet.includes('reference') ||
        lowerSheet.includes('section') ||
        lowerSheet.includes('subject') ||
        lowerHeader.includes('[teacher') ||
        lowerHeader.includes('teacher full name') ||
        lowerHeader.includes('instructions')
      ) {
        continue;
      }

      const termRaw = String((sheet['A13'] || {}).v || '1st Term').trim();
      const term = parseTerm(termRaw);

      const teacher = await getOrCreateTeacher(teacherHeader, sheetName);
      if (teacher.isNew) newTeachersCount++;

      let footerRow = 40;
      for (let r = 17; r <= 50; r++) {
        const val = String((sheet['A' + r] || {}).v || '').toLowerCase();
        if (val.includes('prepared by') || val.includes('reference:')) {
          footerRow = r;
          break;
        }
      }

      const timeSlots = [];
      for (let r = 17; r < footerRow; r++) {
        const aVal = (sheet['A' + r] || {}).v;
        if (!aVal) continue;
        const t = parseTimeRangeBlock(aVal);
        if (t) {
          timeSlots.push({ row: r, startTime: t.startTime, endTime: t.endTime });
        }
      }

      function getTimeAtRow(rowNum) {
        for (let i = timeSlots.length - 1; i >= 0; i--) {
          if (timeSlots[i].row <= rowNum) return timeSlots[i];
        }
        return timeSlots[0] || null;
      }

      const dayCols = [
        { col: 'B', day: 'Monday' },
        { col: 'C', day: 'Tuesday' },
        { col: 'D', day: 'Wednesday' },
        { col: 'E', day: 'Thursday' },
        { col: 'F', day: 'Friday' },
      ];

      let sheetCreated = 0;
      let sheetSkippedExisting = 0;

      for (const { col, day } of dayCols) {
        let r = 17;
        while (r < footerRow) {
          const cellVal = String((sheet[col + r] || {}).v || '').trim();
          if (!cellVal) {
            r++;
            continue;
          }

          const lower = cellVal.toLowerCase();
          if (lower.includes('flag ceremony') || lower.includes('break') || lower.includes('ground improvement')) {
            r++;
            continue;
          }

          let subjectName = cellVal;
          let sectionName = '';
          let slotTime = null;

          if (cellVal.includes('(') || /\d:\d/.test(cellVal)) {
            const inlineTime = parseTimeRangeBlock(cellVal);
            slotTime = inlineTime || getTimeAtRow(r);

            const cleanText = cellVal
              .replace(/\(?\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-–:]\s*\d{1,2}:\d{2}\s*(?:am|pm)?\)?/gi, '')
              .replace(/\(?\d+\s*(?:minutes|mins|min)\.?\)?/gi, '')
              .replace(/\s+/g, ' ')
              .trim();

            const m = cleanText.match(/^(.+?)\s+([A-Z&]{2,}\s*\d{2}\s*[-–].+|ALS\s*\d{2}.*)$/i);
            if (m) {
              subjectName = m[1].trim();
              sectionName = m[2].trim();
            } else {
              subjectName = cleanText;
              sectionName = String((sheet[col + (r + 1)] || {}).v || '').trim();
            }
            r++;
          } else {
            let endRow = r + 1;
            for (let nextR = r + 1; nextR < Math.min(footerRow, r + 5); nextR++) {
              const nextVal = String((sheet[col + nextR] || {}).v || '').trim();
              if (nextVal) {
                const nl = nextVal.toLowerCase();
                if (!nl.includes('break') && !nl.includes('ground improvement')) {
                  sectionName = nextVal;
                  endRow = nextR;
                }
                break;
              }
            }

            const startTimeSlot = getTimeAtRow(r);
            const endTimeSlot = getTimeAtRow(endRow) || startTimeSlot;
            if (startTimeSlot && endTimeSlot) {
              slotTime = { startTime: startTimeSlot.startTime, endTime: endTimeSlot.endTime };
            }
            r = Math.max(r + 1, endRow + 1);
          }

          if (!slotTime || !slotTime.startTime || !slotTime.endTime) continue;

          const subject = resolveSubject(subjectName);
          if (!subject) continue;

          const section = await getOrCreateSection(sectionName);
          if (!section) continue;
          if (section.isNew) newSectionsCount++;

          const schedKey = `${teacher.id}_${subject.id}_${section.id}_${term}_${day}_${slotTime.startTime}_${slotTime.endTime}`;
          if (existingSchedSet.has(schedKey)) {
            sheetSkippedExisting++;
            continue;
          }

          // Instant in-memory overlap check for both teacher and section (zero DB latency)
          if (hasSlotConflict(teacher.id, section.id, day, slotTime.startTime, slotTime.endTime, term)) {
            sheetSkippedExisting++;
            continue;
          }

          addSlotToMemory(teacher.id, section.id, day, slotTime.startTime, slotTime.endTime, term);
          existingSchedSet.add(schedKey);
          schedulesToInsert.push([
            teacher.id,
            subject.id,
            section.id,
            term,
            day,
            slotTime.startTime,
            slotTime.endTime,
          ]);
          sheetCreated++;
        }
      }

      sheetResults.push({
        row: sIdx + 1,
        name: `${teacher.first_name} ${teacher.last_name}`,
        status: sheetCreated > 0 ? 'created' : (sheetSkippedExisting > 0 ? 'partial' : 'error'),
        message: `${sheetCreated} class schedule(s) created${sheetSkippedExisting > 0 ? `, ${sheetSkippedExisting} already up to date` : ''}.`,
      });
    }

    // Batch insert schedules in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < schedulesToInsert.length; i += chunkSize) {
      const chunk = schedulesToInsert.slice(i, i + chunkSize);
      await pool.query(
        'INSERT INTO schedules (teacher_id, subject_id, section_id, quarter, day_of_week, start_time, end_time) VALUES ?',
        [chunk]
      );
    }

    return res.json({
      success: true,
      message: `TSHS Timetable Import Complete: ${schedulesToInsert.length} class schedule(s) scheduled across ${workbook.SheetNames.length} teacher program sheet(s).`,
      totalEntriesCreated: schedulesToInsert.length,
      totalSheets: workbook.SheetNames.length,
      newTeachersRegistered: newTeachersCount,
      newSectionsCreated: newSectionsCount,
      results: sheetResults,
    });
  } catch (err) {
    console.error('importTshsTeacherProgramGrid error:', err);
    return res.status(500).json({ success: false, message: 'Could not process TSHS schedule workbook: ' + err.message });
  }
}

/**
 * Bulk imports schedules from standard tabular format (Columns: Teacher, Subject, Strand, Section, Day, Start, End).
 */
async function importTabularSchedules(workbook, req, res) {
  let rows;
  try {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Could not read file. Ensure it is a valid .xlsx, .xls, or .csv file.' });
  }

  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'The uploaded file has no data rows.' });
  }

  function getRaw(row, ...names) {
    const keys = Object.keys(row);
    for (const name of names) {
      const targetNorm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = keys.find((k) => {
        const kTrim = k.trim().toLowerCase();
        if (kTrim === name.toLowerCase()) return true;
        return kTrim.replace(/[^a-z0-9]/g, '') === targetNorm;
      });
      if (key && row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') {
        return row[key];
      }
    }
    return '';
  }

  function getStr(row, ...names) {
    const val = getRaw(row, ...names);
    return val !== null && val !== undefined ? String(val).trim() : '';
  }

  const [existingSchedules] = await pool.query(
    "SELECT teacher_id, section_id, quarter, day_of_week, start_time, end_time FROM schedules"
  );

  const teacherDaySlots = new Map();
  const sectionDaySlots = new Map();

  function addSlotToMemory(tId, secId, d, sTime, eTime, q) {
    const sMin = toMinutes(sTime);
    const eMin = toMinutes(eTime);
    const tKey = `${tId}_${d}`;
    if (!teacherDaySlots.has(tKey)) teacherDaySlots.set(tKey, []);
    teacherDaySlots.get(tKey).push({ sMin, eMin, quarter: q, startTime: sTime, endTime: eTime });

    const secKey = `${secId}_${d}`;
    if (!sectionDaySlots.has(secKey)) sectionDaySlots.set(secKey, []);
    sectionDaySlots.get(secKey).push({ sMin, eMin, quarter: q, startTime: sTime, endTime: eTime });
  }

  existingSchedules.forEach((s) => {
    addSlotToMemory(s.teacher_id, s.section_id, s.day_of_week, String(s.start_time), String(s.end_time), s.quarter);
  });

  function checkSlotConflictFast(tId, secId, d, sTime, eTime, q) {
    const sMin = toMinutes(sTime);
    const eMin = toMinutes(eTime);

    const tKey = `${tId}_${d}`;
    const tSlots = teacherDaySlots.get(tKey);
    if (tSlots) {
      for (const slot of tSlots) {
        const termsOverlap = (slot.quarter === 'All Terms' || q === 'All Terms' || slot.quarter === q);
        if (termsOverlap && !(slot.eMin <= sMin || slot.sMin >= eMin)) {
          return {
            hasConflict: true,
            type: 'teacher',
            message: `Teacher conflict on ${d}: Already assigned to another class during ${slot.startTime.slice(0, 5)} - ${slot.endTime.slice(0, 5)}.`,
          };
        }
      }
    }

    const secKey = `${secId}_${d}`;
    const secSlots = sectionDaySlots.get(secKey);
    if (secSlots) {
      for (const slot of secSlots) {
        const termsOverlap = (slot.quarter === 'All Terms' || q === 'All Terms' || slot.quarter === q);
        if (termsOverlap && !(slot.eMin <= sMin || slot.sMin >= eMin)) {
          return {
            hasConflict: true,
            type: 'section',
            message: `Section conflict on ${d}: Section already assigned to another class during ${slot.startTime.slice(0, 5)} - ${slot.endTime.slice(0, 5)}.`,
          };
        }
      }
    }

    return { hasConflict: false };
  }

  const results = [];
  let totalEntriesCreated = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const teacherInput = getStr(row, 'Teacher ID or Name', 'Teacher', 'Teacher ID', 'Instructor', 'Faculty');
    const subjectInput = getStr(row, 'Subject', 'Subject Name', 'Course', 'Subject Code');
    const strandCode = getStr(row, 'Cluster Code', 'Cluster', 'Strand Code', 'Strand', 'Track');
    const gradeLevel = getStr(row, 'Grade Level', 'Grade', 'Year');
    const sectionName = getStr(row, 'Section Name', 'Section');
    const termRaw = getStr(row, 'Academic Term', 'Term', 'Quarter', 'Semester');
    const daysRaw = getStr(row, 'Day of Week', 'Day', 'Days', 'Day(s)', 'Schedule Day');
    let startTimeRaw = getRaw(row, 'Start Time', 'Start', 'From', 'Time Start');
    let endTimeRaw = getRaw(row, 'End Time', 'End', 'To', 'Time End');

    if (typeof startTimeRaw === 'string' && (!endTimeRaw || String(endTimeRaw).trim() === '')) {
      const trimmed = startTimeRaw.trim();
      if (trimmed.includes('-') || trimmed.includes('–') || /\bto\b/i.test(trimmed)) {
        const parts = trimmed.split(/[-–]|\bto\b/i).map((s) => s.trim());
        if (parts.length >= 2) {
          startTimeRaw = parts[0];
          endTimeRaw = parts[1];
        }
      }
    }

    const rowLabel = `${teacherInput || 'Unknown'} - ${subjectInput || 'Unknown'} (${strandCode ? strandCode + ' ' : ''}${sectionName || ''})`.trim();

    if (!teacherInput || !subjectInput || !sectionName || !daysRaw || (!startTimeRaw && startTimeRaw !== 0) || (!endTimeRaw && endTimeRaw !== 0)) {
      results.push({
        row: rowNum,
        name: rowLabel,
        status: 'error',
        message: 'Missing required field(s). Teacher, Subject, Section, Day, Start Time, and End Time are all required.',
      });
      continue;
    }

    const cleanTeacher = teacherInput.replace(/\s+/g, ' ').trim();
    let [teachers] = await pool.query(
      "SELECT id, id_number, first_name, last_name FROM users WHERE role = 'teacher' AND (LOWER(TRIM(id_number)) = LOWER(?) OR LOWER(TRIM(CONCAT(first_name, ' ', last_name))) = LOWER(?))",
      [cleanTeacher, cleanTeacher]
    );
    if (!teachers.length) {
      [teachers] = await pool.query(
        "SELECT id, id_number, first_name, last_name FROM users WHERE role = 'teacher' AND (LOWER(TRIM(CONCAT(last_name, ', ', first_name))) = LOWER(?) OR LOWER(TRIM(CONCAT(last_name, ' ', first_name))) = LOWER(?))",
        [cleanTeacher, cleanTeacher]
      );
    }
    if (!teachers.length) {
      [teachers] = await pool.query(
        "SELECT id, id_number, first_name, last_name FROM users WHERE role = 'teacher' AND LOWER(TRIM(last_name)) = LOWER(?)",
        [cleanTeacher]
      );
    }
    if (!teachers.length) {
      results.push({
        row: rowNum,
        name: rowLabel,
        status: 'error',
        message: `Teacher "${teacherInput}" was not found in the system. Check spelling or ID number.`,
      });
      continue;
    }
    const teacher = teachers[0];

    const cleanSubject = subjectInput.replace(/\s+/g, ' ').trim();
    const [subjects] = await pool.query(
      'SELECT id, name FROM subjects WHERE LOWER(TRIM(name)) = LOWER(?) OR LOWER(TRIM(code)) = LOWER(?)',
      [cleanSubject, cleanSubject]
    );
    if (!subjects.length) {
      results.push({
        row: rowNum,
        name: rowLabel,
        status: 'error',
        message: `Subject "${subjectInput}" does not exist. Check spelling or create the subject first.`,
      });
      continue;
    }
    const subject = subjects[0];

    let section = null;
    const cleanStrand = strandCode.replace(/\s+/g, ' ').trim();
    const cleanSection = sectionName.replace(/\s+/g, ' ').trim();
    const cleanGrade = gradeLevel ? String(gradeLevel).replace(/\D/g, '').trim() : '';

    if (cleanStrand) {
      const sql = `
        SELECT sec.id, sec.name, st.code AS strand_code, sec.grade_level
        FROM sections sec
        JOIN strands st ON st.id = sec.strand_id
        WHERE (LOWER(TRIM(st.code)) = LOWER(?) OR LOWER(TRIM(st.title)) = LOWER(?))
          AND LOWER(TRIM(sec.name)) = LOWER(?)
          ${cleanGrade ? 'AND sec.grade_level = ?' : ''}`;
      const params = cleanGrade
        ? [cleanStrand, cleanStrand, cleanSection, cleanGrade]
        : [cleanStrand, cleanStrand, cleanSection];
      const [[sec]] = await pool.query(sql, params);
      section = sec;
    }

    if (!section && cleanSection) {
      const [secs] = await pool.query(
        `SELECT sec.id, sec.name, st.code AS strand_code, sec.grade_level
         FROM sections sec
         JOIN strands st ON st.id = sec.strand_id
         WHERE LOWER(TRIM(sec.name)) = LOWER(?) ${cleanGrade ? 'AND sec.grade_level = ?' : ''}`,
        cleanGrade ? [cleanSection, cleanGrade] : [cleanSection]
      );
      if (secs.length === 1) {
        section = secs[0];
      } else if (secs.length > 1) {
        const matched = secs.filter((s) => s.strand_code.toLowerCase() === cleanStrand.toLowerCase());
        if (matched.length === 1) {
          section = matched[0];
        } else {
          results.push({
            row: rowNum,
            name: rowLabel,
            status: 'error',
            message: `Section "${sectionName}" exists in multiple strands/grades. Please specify the correct Strand Code (e.g. STEM, HUMSS, ABM).`,
          });
          continue;
        }
      }
    }

    if (!section) {
      results.push({
        row: rowNum,
        name: rowLabel,
        status: 'error',
        message: `Section "${strandCode ? strandCode + ' - ' : ''}${sectionName}" was not found. Please verify the section name and strand code.`,
      });
      continue;
    }

    const term = parseTerm(termRaw);
    const startTime = parseTime(startTimeRaw);
    const endTime = parseTime(endTimeRaw);
    if (!startTime || !endTime) {
      results.push({
        row: rowNum,
        name: rowLabel,
        status: 'error',
        message: `Invalid time format ("${startTimeRaw}" - "${endTimeRaw}"). Use formats like 07:30 AM, 7:30 am, or 13:30.`,
      });
      continue;
    }

    if (startTime < SCHOOL_OPEN) {
      results.push({ row: rowNum, name: rowLabel, status: 'error', message: 'Schedule cannot start before 7:00 AM.' });
      continue;
    }
    if (endTime > SCHOOL_CLOSE) {
      results.push({ row: rowNum, name: rowLabel, status: 'error', message: 'Schedule cannot end after 3:30 PM.' });
      continue;
    }
    if (toMinutes(startTime) >= toMinutes(endTime)) {
      results.push({ row: rowNum, name: rowLabel, status: 'error', message: 'End time must be after start time.' });
      continue;
    }

    const days = parseDays(daysRaw);
    if (!days.length) {
      results.push({
        row: rowNum,
        name: rowLabel,
        status: 'error',
        message: `Unrecognized day(s): "${daysRaw}". Use Monday, Tuesday, Wednesday, Thursday, Friday, or MWF/TTH.`,
      });
      continue;
    }

    let rowCreatedCount = 0;
    const rowErrors = [];

    for (const day of days) {
      // Instant in-memory overlap check (zero DB network round-trips)
      const conflict = checkSlotConflictFast(teacher.id, section.id, day, startTime, endTime, term);

      if (conflict.hasConflict) {
        rowErrors.push(conflict.message);
        continue;
      }

      addSlotToMemory(teacher.id, section.id, day, startTime, endTime, term);

      await pool.query(
        'INSERT INTO schedules (teacher_id, subject_id, section_id, quarter, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [teacher.id, subject.id, section.id, term, day, startTime, endTime]
      );
      rowCreatedCount++;
      totalEntriesCreated++;
    }

    if (rowCreatedCount > 0 && rowErrors.length === 0) {
      results.push({
        row: rowNum,
        name: `${teacher.first_name} ${teacher.last_name} • ${subject.name} • ${section.name}`,
        status: 'created',
        message: `Created for ${days.join(', ')} (${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}).`,
      });
    } else if (rowCreatedCount > 0 && rowErrors.length > 0) {
      results.push({
        row: rowNum,
        name: `${teacher.first_name} ${teacher.last_name} • ${subject.name} • ${section.name}`,
        status: 'partial',
        message: `Created for some days, but had conflicts: ${rowErrors.join(' ')}`,
      });
    } else {
      results.push({
        row: rowNum,
        name: `${teacher.first_name} ${teacher.last_name} • ${subject.name} • ${section.name}`,
        status: 'error',
        message: rowErrors.join(' ') || 'Could not schedule class.',
      });
    }
  }

  const successRows = results.filter((r) => r.status === 'created' || r.status === 'partial').length;
  return res.json({
    success: true,
    message: `${totalEntriesCreated} schedule entry(s) created from ${successRows} of ${rows.length} row(s).`,
    totalEntriesCreated,
    results,
  });
}

/**
 * POST /api/schedules/bulk-import (multipart, field "importFile")
 * Auto-detects whether the uploaded file is an official TSHS Teacher Program workbook
 * or a standard tabular schedule spreadsheet.
 */
async function bulkImportSchedules(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file was uploaded.' });
  }

  let workbook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Could not read file. Ensure it is a valid .xlsx, .xls, or .csv file.' });
  }

  if (!workbook || !workbook.SheetNames || !workbook.SheetNames.length) {
    return res.status(400).json({ success: false, message: 'The uploaded file contains no sheets.' });
  }

  // Smart Detection: TSHS Teacher Program layout vs Tabular layout
  if (isTshsTeacherProgramWorkbook(workbook)) {
    return await importTshsTeacherProgramGrid(workbook, req, res);
  } else {
    return await importTabularSchedules(workbook, req, res);
  }
}

module.exports = {
  listSchedules,
  createSchedule,
  deleteSchedule,
  getMySchedule,
  downloadScheduleTemplate,
  bulkImportSchedules,
};
