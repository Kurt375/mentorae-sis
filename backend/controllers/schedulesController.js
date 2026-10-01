const pool = require('../config/db');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

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

/**
 * GET /api/schedules/bulk-import/template
 * Downloads an .xlsx starter template with columns and example rows.
 */
async function downloadScheduleTemplate(req, res) {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mentorae SIS';
    wb.lastModifiedBy = 'Mentorae SIS Admin';
    wb.created = new Date();
    wb.modified = new Date();

    // 1. Primary Sheet: Schedules
    const ws = wb.addWorksheet('Schedules', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }]
    });

    ws.columns = [
      { header: 'Teacher ID or Name', key: 'teacher', width: 26 },
      { header: 'Subject', key: 'subject', width: 32 },
      { header: 'Strand Code', key: 'strand', width: 16 },
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
      ['Princess Mel Suelto', 'Business 1 - Basic Accounting', 'BAE', '11', 'Accountancy', '3rd Term', 'Monday', '07:30 AM', '09:00 AM'],
      ['Princess Mel Suelto', 'Chemistry 1', 'STEM', '11', 'Medical Sciences', '1st Term', 'Tuesday, Thursday', '09:30 AM', '11:00 AM'],
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

    for (let r = 2; r <= 500; r++) {
      ws.getCell(`C${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"STEM,ABM,HUMSS,ASSH,BAE,HE,H&T"'],
      };
      ws.getCell(`D${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"11,12"'],
      };
      ws.getCell(`F${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"1st Term,2nd Term,3rd Term,All Terms"'],
      };
      ws.getCell(`G${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Monday,Tuesday,Wednesday,Thursday,Friday,MWF,TTH,All Weekdays"'],
      };
    }

    // Force Start Time and End Time columns to text format to prevent Excel from converting to decimals
    ws.getColumn(8).numFmt = '@';
    ws.getColumn(9).numFmt = '@';

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mentorae-schedule-import-template.xlsx"');
    return res.send(buffer);
  } catch (err) {
    console.error('downloadScheduleTemplate error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate template file.' });
  }
}

/**
 * POST /api/schedules/bulk-import (multipart, field "importFile")
 * Bulk creates schedules from an uploaded Excel or CSV file.
 */
async function bulkImportSchedules(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file was uploaded.' });
  }

  let rows;
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
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

  const results = [];
  let totalEntriesCreated = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // header + 1-indexed

    const teacherInput = getStr(row, 'Teacher ID or Name', 'Teacher', 'Teacher ID', 'Instructor', 'Faculty');
    const subjectInput = getStr(row, 'Subject', 'Subject Name', 'Course', 'Subject Code');
    const strandCode = getStr(row, 'Strand Code', 'Strand', 'Track');
    const gradeLevel = getStr(row, 'Grade Level', 'Grade', 'Year');
    const sectionName = getStr(row, 'Section Name', 'Section');
    const termRaw = getStr(row, 'Academic Term', 'Term', 'Quarter', 'Semester');
    const daysRaw = getStr(row, 'Day of Week', 'Day', 'Days', 'Day(s)', 'Schedule Day');
    let startTimeRaw = getRaw(row, 'Start Time', 'Start', 'From', 'Time Start');
    let endTimeRaw = getRaw(row, 'End Time', 'End', 'To', 'Time End');

    // Auto-split combined range if start time contains " - " or " to " and end time is blank
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

    // 1. Resolve Teacher (case-insensitive, trims multiple spaces)
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

    // 2. Resolve Subject (case-insensitive for both Subject Name and Code)
    const cleanSubject = subjectInput.replace(/\s+/g, ' ').trim();
    const [subjects] = await pool.query(
      "SELECT id, name FROM subjects WHERE LOWER(TRIM(name)) = LOWER(?) OR LOWER(TRIM(code)) = LOWER(?)",
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

    // 3. Resolve Section (case-insensitive, handles strand code/title and clean grade number)
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

    // Fallback: If not found by strandCode, attempt resolving by section name and grade level
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
        message: `Section "${strandCode ? strandCode + ' - ' : ''}${sectionName}" was not found. Please verify the section name and strand code (e.g. STEM, HUMSS).`,
      });
      continue;
    }

    // 4. Resolve Term / Quarter (case-insensitive & combo-aware)
    const term = parseTerm(termRaw);

    // 5. Parse Times (handles Excel decimal numbers, am/pm, 24h, dots, combos, etc.)
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
    const duration = toMinutes(endTime) - toMinutes(startTime);
    if (duration < 30) {
      results.push({ row: rowNum, name: rowLabel, status: 'error', message: 'Class duration must be at least 30 minutes.' });
      continue;
    }
    if (duration > 120) {
      results.push({ row: rowNum, name: rowLabel, status: 'error', message: 'Class duration cannot exceed 2 hours.' });
      continue;
    }

    // 6. Parse Days (handles MWF, TTH, M-W-F, T-TH, lowercase, uppercase, combos)
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

    // 7. Check Conflicts & Insert for each day
    let rowCreatedCount = 0;
    const rowErrors = [];

    for (const day of days) {
      // Teacher overlap conflict check
      const [teacherConflicts] = await pool.query(
        `SELECT id FROM schedules
         WHERE teacher_id = ? AND day_of_week = ?
           AND (quarter = ? OR quarter = 'All Terms' OR ? = 'All Terms')
           AND NOT (end_time <= ? OR start_time >= ?)`,
        [teacher.id, day, term, term, startTime, endTime]
      );
      if (teacherConflicts.length) {
        rowErrors.push(`Teacher conflict on ${day}: ${teacher.first_name} ${teacher.last_name} already has a class overlapping ${startTime.slice(0, 5)}-${endTime.slice(0, 5)}.`);
        continue;
      }

      // Section overlap conflict check
      const [sectionConflicts] = await pool.query(
        `SELECT sch.id, sub.name AS subject_name
         FROM schedules sch
         JOIN subjects sub ON sub.id = sch.subject_id
         WHERE sch.section_id = ? AND sch.day_of_week = ?
           AND (sch.quarter = ? OR sch.quarter = 'All Terms' OR ? = 'All Terms')
           AND NOT (sch.end_time <= ? OR sch.start_time >= ?)`,
        [section.id, day, term, term, startTime, endTime]
      );
      if (sectionConflicts.length) {
        rowErrors.push(`Section conflict on ${day}: ${section.name} already has ${sectionConflicts[0].subject_name} scheduled at that time.`);
        continue;
      }

      // Insert schedule
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

module.exports = {
  listSchedules,
  createSchedule,
  deleteSchedule,
  getMySchedule,
  downloadScheduleTemplate,
  bulkImportSchedules,
};
