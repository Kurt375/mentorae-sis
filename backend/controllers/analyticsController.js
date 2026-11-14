const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const pool = require('../config/db');
const { classifyRisk, toFeatureVector } = require('../ml/features');
const riskModel = require('../ml/riskModel');
const { buildRecommendations } = require('../ml/prescriptive');
const { getManilaDate } = require('../utils/dateUtils');
const { getActiveTermConfig } = require('../utils/termUtils');

/** GET /api/analytics/filter-options — provides available grade levels, strands, and sections */
async function getFilterOptions(req, res) {
  try {
    const isTeacher = req.user && req.user.role === 'teacher';
    
    // Strands
    const [strands] = await pool.query('SELECT id, code, title FROM strands ORDER BY code ASC');

    // Sections (if teacher, highlight or list assigned sections)
    let sectionsQuery = `
      SELECT s.id, s.name, s.grade_level, s.strand_id, st.code AS strandCode
      FROM sections s
      LEFT JOIN strands st ON st.id = s.strand_id
    `;
    let params = [];

    if (isTeacher) {
      const [assigned] = await pool.query(
        'SELECT DISTINCT section_id FROM schedules WHERE teacher_id = ?',
        [req.user.id]
      );
      if (assigned.length > 0) {
        const secIds = assigned.map((a) => a.section_id);
        sectionsQuery += ` WHERE s.id IN (${secIds.map(() => '?').join(',')})`;
        params = secIds;
      }
    }
    sectionsQuery += ' ORDER BY s.grade_level ASC, s.name ASC';
    const [sections] = await pool.query(sectionsQuery, params);

    return res.json({
      success: true,
      grades: [11, 12],
      strands,
      sections,
    });
  } catch (err) {
    console.error('getFilterOptions error:', err);
    return res.status(500).json({ success: false, message: 'Could not load filter options.' });
  }
}

/** GET /api/analytics/grade-trend — school-wide or section/strand/grade average grade per term */
async function getGradeTrend(req, res) {
  try {
    const { sectionId, gradeLevel, strandId } = req.query;

    let where = [];
    let params = [];

    if (sectionId && sectionId !== 'all') {
      where.push('g.section_id = ?');
      params.push(sectionId);
    }
    if (gradeLevel && gradeLevel !== 'all') {
      where.push('sec.grade_level = ?');
      params.push(gradeLevel);
    }
    if (strandId && strandId !== 'all') {
      where.push('sec.strand_id = ?');
      params.push(strandId);
    }

    // Teacher scoping fallback
    if (req.user && req.user.role === 'teacher' && (!sectionId || sectionId === 'all')) {
      const [assigned] = await pool.query(
        'SELECT DISTINCT section_id FROM schedules WHERE teacher_id = ?',
        [req.user.id]
      );
      if (assigned.length > 0) {
        const secIds = assigned.map((a) => a.section_id);
        where.push(`g.section_id IN (${secIds.map(() => '?').join(',')})`);
        params.push(...secIds);
      }
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT g.term, ROUND(AVG(g.average), 1) AS avgGrade, MIN(g.created_at) AS firstSeen
       FROM grades g
       LEFT JOIN sections sec ON sec.id = g.section_id
       ${whereClause}
       GROUP BY g.term 
       ORDER BY firstSeen ASC`,
      params
    );

    const termOrder = {
      '1st Term': 1, '1st Quarter': 1,
      '2nd Term': 2, '2nd Quarter': 2,
      '3rd Term': 3, '3rd Quarter': 3,
      '4th Term': 4, '4th Quarter': 4,
    };
    rows.sort((a, b) => {
      const orderA = termOrder[a.term] || 99;
      const orderB = termOrder[b.term] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.firstSeen) - new Date(b.firstSeen);
    });

    let labels = [];
    let data = [];

    if (rows.length > 0) {
      labels = rows.map((r) => r.term);
      data = rows.map((r) => Number(r.avgGrade));
    }

    return res.json({
      success: true,
      labels,
      data,
    });
  } catch (err) {
    console.error('getGradeTrend error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the grade trend.' });
  }
}

/** GET /api/analytics/risk-distribution — High/Medium/Low risk counts (%) with filtering */
async function getRiskDistribution(req, res) {
  try {
    const { sectionId, gradeLevel, strandId } = req.query;

    let where = ["u.role = 'student'"];
    let params = [];

    if (sectionId && sectionId !== 'all') {
      where.push('u.section_id = ?');
      params.push(sectionId);
    }
    if (gradeLevel && gradeLevel !== 'all') {
      where.push('s.grade_level = ?');
      params.push(gradeLevel);
    }
    if (strandId && strandId !== 'all') {
      where.push('s.strand_id = ?');
      params.push(strandId);
    }

    // Teacher scoping fallback
    if (req.user && req.user.role === 'teacher' && (!sectionId || sectionId === 'all')) {
      const [assigned] = await pool.query(
        'SELECT DISTINCT section_id FROM schedules WHERE teacher_id = ?',
        [req.user.id]
      );
      if (assigned.length > 0) {
        const secIds = assigned.map((a) => a.section_id);
        where.push(`u.section_id IN (${secIds.map(() => '?').join(',')})`);
        params.push(...secIds);
      }
    }

    const { currentTerm, termStartDate } = await getActiveTermConfig();
    const whereClause = `WHERE ${where.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT u.id,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id AND term = ?) AS grade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id AND scan_date >= ?) AS attendanceRate
       FROM users u
       LEFT JOIN sections s ON s.id = u.section_id
       ${whereClause}`,
      [currentTerm, termStartDate, ...params]
    );

    const counts = { High: 0, Medium: 0, Low: 0 };
    for (const r of rows) {
      const risk = classifyRisk(r.grade, r.attendanceRate);
      counts[risk]++;
    }
    const total = rows.length || 1;

    return res.json({
      success: true,
      labels: ['High Risk', 'Medium Risk', 'Low Risk'],
      data: [
        Math.round((counts.High / total) * 100),
        Math.round((counts.Medium / total) * 100),
        Math.round((counts.Low / total) * 100),
      ],
      counts,
      atRiskCount: counts.High + counts.Medium,
      total: rows.length,
    });
  } catch (err) {
    console.error('getRiskDistribution error:', err);
    return res.status(500).json({ success: false, message: 'Could not load risk distribution.' });
  }
}

/** GET /api/analytics/risk-assessment — detailed cards for teacher risk overview */
async function getRiskAssessment(req, res) {
  try {
    const { sectionId, gradeLevel, strandId, search } = req.query;

    let where = ["u.role = 'student'"];
    let params = [];

    if (sectionId && sectionId !== 'all') {
      where.push('u.section_id = ?');
      params.push(sectionId);
    }
    if (gradeLevel && gradeLevel !== 'all') {
      where.push('s.grade_level = ?');
      params.push(gradeLevel);
    }
    if (strandId && strandId !== 'all') {
      where.push('s.strand_id = ?');
      params.push(strandId);
    }
    if (search && search.trim()) {
      where.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.id_number LIKE ?)');
      const q = `%${search.trim()}%`;
      params.push(q, q, q);
    }

    // Teacher scoping fallback
    if (req.user && req.user.role === 'teacher' && (!sectionId || sectionId === 'all')) {
      const [assigned] = await pool.query(
        'SELECT DISTINCT section_id FROM schedules WHERE teacher_id = ?',
        [req.user.id]
      );
      if (assigned.length > 0) {
        const secIds = assigned.map((a) => a.section_id);
        where.push(`u.section_id IN (${secIds.map(() => '?').join(',')})`);
        params.push(...secIds);
      }
    }

    const { currentTerm, termStartDate } = await getActiveTermConfig();
    const whereClause = `WHERE ${where.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT u.id AS studentId, u.id_number, u.first_name, u.middle_initial, u.last_name,
              u.section_id, s.name AS sectionName, s.grade_level AS gradeLevel,
              st.code AS strandCode, st.title AS strandTitle,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id AND term = ?) AS overallGrade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id AND scan_date >= ?) AS attendanceRate
       FROM users u
       LEFT JOIN sections s ON s.id = u.section_id
       LEFT JOIN strands st ON st.id = s.strand_id
       ${whereClause}
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [currentTerm, termStartDate, ...params]
    );

    // Fetch existing targeted intervention assignments in bulk for these students
    const studentIds = rows.map((r) => r.studentId);
    let assignmentMap = {};
    if (studentIds.length > 0) {
      try {
        const [assignRows] = await pool.query(
          `SELECT sla.student_id, sla.subject_id, sla.topic_id, sla.created_at, sla.term, sla.status, t.title AS topic_title
           FROM student_lesson_assignments sla
           JOIN topics t ON t.id = sla.topic_id
           WHERE sla.student_id IN (?) AND (sla.term = ? OR sla.term IS NULL)
           ORDER BY sla.created_at DESC`,
          [studentIds, currentTerm]
        );
        for (const a of assignRows) {
          const subjectKey = `${a.student_id}_${a.subject_id}`;
          if (!assignmentMap[subjectKey]) assignmentMap[subjectKey] = a;
          if (!assignmentMap[a.student_id]) assignmentMap[a.student_id] = a;
        }
      } catch (assignErr) {
        console.warn('Could not load student_lesson_assignments:', assignErr.message);
      }
    }

    // Fetch lowest/failing subject per student for targeted intervention recommendations
    const studentsWithRisk = await Promise.all(
      rows.map(async (r) => {
        const [subRows] = await pool.query(
          `SELECT g.average, sub.id AS subjectId, sub.name AS subjectName
           FROM grades g
           JOIN subjects sub ON sub.id = g.subject_id
           WHERE g.student_id = ? AND g.term = ?
           ORDER BY g.average ASC
           LIMIT 1`,
          [r.studentId, currentTerm]
        );

        const lowest = subRows.length > 0 ? subRows[0] : null;
        const rawRisk = classifyRisk(r.overallGrade, r.attendanceRate);

        // Check if an active intervention assignment already exists
        const assignment = lowest && lowest.subjectId
          ? (assignmentMap[`${r.studentId}_${lowest.subjectId}`] || assignmentMap[r.studentId])
          : assignmentMap[r.studentId];

        const isAssigned = !!assignment;
        const isCompleted = assignment ? (assignment.status === 'completed') : false;
        const assignedTopicId = assignment ? assignment.topic_id : null;
        const assignedTopicTitle = assignment ? assignment.topic_title : null;
        const assignedAt = assignment ? assignment.created_at : null;

        let riskTier = 'Low Risk';
        let riskClass = 'bg-low-risk text-success';
        let detailText = `Grade: ${r.overallGrade ? r.overallGrade + '%' : 'No grades yet'} | Attendance: ${r.attendanceRate ? r.attendanceRate + '%' : '0%'}`;
        let detailColor = 'text-muted';
        let action = {
          label: 'Not Applicable',
          disabled: true,
          url: '#',
        };

        if (rawRisk === 'High') {
          riskTier = 'High Risk';
          riskClass = 'bg-high-risk text-danger';
          detailColor = 'text-danger';
          if (lowest) {
            detailText = `Failing Subject: <strong>${lowest.subjectName}</strong> (${lowest.average}%)`;
            action = {
              label: isAssigned ? 'Assigned' : 'Assign Lesson',
              disabled: false,
              subjectId: lowest.subjectId,
              subjectName: lowest.subjectName,
              url: `subject_detail_teacher.html?subject=${encodeURIComponent(lowest.subjectName)}&from=analytics`,
            };
          } else {
            detailText = `Academic Risk: Attendance (${r.attendanceRate ?? 'Below Threshold'}%)`;
            action = {
              label: isAssigned ? 'Assigned' : 'Assign Lesson',
              disabled: false,
              subjectId: null,
              subjectName: null,
              url: `subject_detail_teacher.html?from=analytics`,
            };
          }
        } else if (rawRisk === 'Medium') {
          riskTier = 'Medium Risk';
          riskClass = 'bg-medium-risk text-warning-emphasis';
          detailColor = 'text-warning-emphasis';
          if (lowest) {
            detailText = `At-Risk Subject: <strong>${lowest.subjectName}</strong> (${lowest.average}%)`;
            action = {
              label: isAssigned ? 'Assigned' : 'Assign Lesson',
              disabled: false,
              subjectId: lowest.subjectId,
              subjectName: lowest.subjectName,
              url: `subject_detail_teacher.html?subject=${encodeURIComponent(lowest.subjectName)}&from=analytics`,
            };
          } else {
            detailText = `Grade: ${r.overallGrade ? r.overallGrade + '%' : 'No grades yet'} | Attendance: ${r.attendanceRate ? r.attendanceRate + '%' : '0%'}`;
            action = {
              label: isAssigned ? 'Assigned' : 'Assign Lesson',
              disabled: false,
              subjectId: null,
              subjectName: null,
              url: `subject_detail_teacher.html?from=analytics`,
            };
          }
        }

        const sectionFormatted = [r.strandCode, r.gradeLevel ? `${r.gradeLevel}-${r.sectionName || ''}` : r.sectionName]
          .filter(Boolean)
          .join(' ');

        return {
          studentId: r.studentId,
          idNumber: r.id_number,
          name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
          section: sectionFormatted || 'General Section',
          overallGrade: r.overallGrade,
          attendanceRate: r.attendanceRate,
          risk: rawRisk,
          riskTier,
          riskClass,
          detailText,
          detailColor,
          subjectId: lowest ? lowest.subjectId : null,
          subjectName: lowest ? lowest.subjectName : null,
          failingAverage: lowest ? lowest.average : null,
          isAssigned,
          isCompleted,
          assignedTopicId,
          assignedTopicTitle,
          assignedAt,
          action,
        };
      })
    );

    // Sort: High Risk first, then Medium, then Low
    const riskOrder = { 'High Risk': 0, 'Medium Risk': 1, 'Low Risk': 2 };
    studentsWithRisk.sort((a, b) => riskOrder[a.riskTier] - riskOrder[b.riskTier]);

    return res.json({
      success: true,
      students: studentsWithRisk,
    });
  } catch (err) {
    console.error('getRiskAssessment error:', err);
    return res.status(500).json({ success: false, message: 'Could not load student risk assessment.' });
  }
}

/** GET /api/analytics/risk-directory — named list of Medium/High risk students (legacy compatibility) */
async function getRiskDirectory(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id) AS grade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate
       FROM users u WHERE u.role = 'student'`
    );

    const directory = rows
      .map((r) => ({
        idNumber: r.id_number,
        name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
        grade: r.grade,
        attendanceRate: r.attendanceRate,
        risk: classifyRisk(r.grade, r.attendanceRate),
      }))
      .filter((s) => s.risk !== 'Low')
      .sort((a, b) => (a.risk === 'High' ? -1 : 1));

    return res.json({ success: true, directory });
  } catch (err) {
    console.error('getRiskDirectory error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the risk directory.' });
  }
}

/** GET /api/analytics/predictive-risk — ML-forecasted risk for in-progress terms */
async function getPredictiveRisk(req, res) {
  try {
    const loaded = riskModel.load();
    const { currentTerm, termStartDate } = await getActiveTermConfig();

    const [rows] = await pool.query(
      `SELECT g.id AS gradeId, u.id AS studentId, u.id_number, u.first_name, u.middle_initial, u.last_name,
              sub.name AS subjectName, g.term, g.quiz_score, g.activity_score, g.exam_score,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id AND scan_date >= ?) AS attendanceRate
       FROM grades g
       JOIN users u ON u.id = g.student_id
       JOIN subjects sub ON sub.id = g.subject_id
       WHERE u.role = 'student' AND (g.exam_score IS NULL OR g.exam_score = 0) AND g.term = ?
       ORDER BY g.updated_at DESC`,
      [termStartDate, currentTerm]
    );

    const predictions = rows.map((r) => {
      const features = toFeatureVector({
        quiz_score: r.quiz_score,
        activity_score: r.activity_score,
        attendanceRate: r.attendanceRate,
      });

      let risk;
      let confidence = null;
      if (loaded) {
        const result = riskModel.predictOne(loaded.rf, features);
        risk = result.risk;
        confidence = result.confidence;
      } else {
        risk = classifyRisk(r.quiz_score + r.activity_score, r.attendanceRate);
      }

      const { driver, driverLabel, actions } = buildRecommendations({
        subjectName: r.subjectName,
        quiz_score: r.quiz_score,
        activity_score: r.activity_score,
        exam_score: null,
        attendanceRate: r.attendanceRate,
        risk,
      });

      return {
        studentId: r.studentId,
        idNumber: r.id_number,
        name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
        subject: r.subjectName,
        term: r.term,
        attendanceRate: r.attendanceRate,
        predictedRisk: risk,
        confidence,
        driver,
        driverLabel,
        recommendedActions: actions,
      };
    });

    predictions.sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      return order[a.predictedRisk] - order[b.predictedRisk];
    });

    return res.json({
      success: true,
      modelTrained: !!loaded,
      trainedAt: loaded ? loaded.trainedAt : null,
      modelMeta: loaded ? loaded.meta : null,
      predictions,
    });
  } catch (err) {
    console.error('getPredictiveRisk error:', err);
    return res.status(500).json({ success: false, message: 'Could not load predictive risk analytics.' });
  }
}

function formatUptime(uptimeSec) {
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  const secs = Math.floor(uptimeSec % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function getDirSizeBytes(dirPath) {
  let total = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSizeBytes(full);
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch (e) {}
      }
    }
  } catch (err) {
    // Ignore folder access errors
  }
  return total;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0.00 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }
  return `${mb.toFixed(2)} MB`;
}

// In-Memory Cache for Heavy System Health Queries (TiDB RU Conservation)
let cachedSystemStats = null;
let lastSystemStatsTime = 0;
const SYSTEM_STATS_CACHE_TTL = 5 * 60 * 1000; // Cache heavy information_schema metrics for 5 minutes

/** GET /api/analytics/system-status — Live Server and Database health metrics */
async function getSystemStatus(req, res) {
  try {
    const startPing = Date.now();
    await pool.query('SELECT 1');
    const pingMs = Math.max(1, Date.now() - startPing);

    // Uptime formatting
    const uptimeSec = Math.floor(process.uptime());
    const uptimeStr = formatUptime(uptimeSec);

    // Database mode
    const dbMode = typeof pool.getCurrentMode === 'function' ? pool.getCurrentMode() : 'cloud';
    const dbModeLabel = dbMode === 'cloud' ? 'Cloud TiDB' : 'Local MySQL';

    // In-Memory Cache for Heavy TiDB Storage Stats (Prevents repetitive information_schema scans)
    const now = Date.now();
    let stats = null;

    if (cachedSystemStats && (now - lastSystemStatsTime < SYSTEM_STATS_CACHE_TTL)) {
      stats = cachedSystemStats;
    } else {
      let dbSizeBytes = 0;
      let tableCount = 0;
      let rowCount = 0;
      try {
        const [sizeRows] = await pool.query(
          `SELECT 
             COALESCE(SUM(data_length + index_length), 0) AS total_bytes,
             COUNT(*) AS table_count,
             COALESCE(SUM(table_rows), 0) AS total_rows
           FROM information_schema.TABLES
           WHERE table_schema = DATABASE()`
        );
        if (sizeRows && sizeRows.length > 0) {
          dbSizeBytes = Number(sizeRows[0].total_bytes || 0);
          tableCount = Number(sizeRows[0].table_count || 0);
          rowCount = Number(sizeRows[0].total_rows || 0);
        }
      } catch (e) {
        console.warn('DB size calculation fallback:', e.message);
      }

      const uploadsPath = path.join(__dirname, '..', 'uploads');
      const filesSizeBytes = getDirSizeBytes(uploadsPath);
      const totalSizeBytes = dbSizeBytes + filesSizeBytes;

      const dbSizeMB = Number((dbSizeBytes / (1024 * 1024)).toFixed(2));
      const filesSizeMB = Number((filesSizeBytes / (1024 * 1024)).toFixed(2));
      const totalSizeMB = Number((totalSizeBytes / (1024 * 1024)).toFixed(2));

      const quotaBytes = 5 * 1024 * 1024 * 1024; // 5 GB TiDB Cloud Serverless Free Quota
      const quotaFormatted = '5 GB';
      const percentUsed = (totalSizeBytes / quotaBytes) * 100;
      const percentDisplay = percentUsed < 0.01 ? '0.01%' : `${percentUsed.toFixed(2)}%`;
      const quotaDisplaySize = `${formatBytes(totalSizeBytes)} / ${quotaFormatted} used (${percentDisplay})`;

      let totalUsers = 0;
      try {
        const [userCountRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
        totalUsers = userCountRows[0]?.total || 0;
      } catch (e) {}

      stats = {
        dbSizeBytes,
        tableCount,
        rowCount,
        filesSizeBytes,
        totalSizeBytes,
        dbSizeMB,
        filesSizeMB,
        totalSizeMB,
        quotaBytes,
        quotaFormatted,
        percentUsed,
        percentDisplay,
        quotaDisplaySize,
        totalUsers,
      };

      cachedSystemStats = stats;
      lastSystemStatsTime = now;
    }

    const {
      dbSizeBytes,
      tableCount,
      rowCount,
      filesSizeBytes,
      totalSizeBytes,
      dbSizeMB,
      filesSizeMB,
      totalSizeMB,
      quotaBytes,
      quotaFormatted,
      percentUsed,
      percentDisplay,
      quotaDisplaySize,
      totalUsers,
    } = stats;

    return res.json({
      success: true,
      server: {
        status: 'Operational',
        uptime: uptimeStr,
        uptimeSeconds: uptimeSec,
        nodeVersion: process.version,
        memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      },
      database: {
        status: 'Connected',
        mode: dbModeLabel,
        latencyMs: pingMs,
        sizeMB: dbSizeMB,
        tables: tableCount,
        rows: rowCount,
        displaySize: quotaDisplaySize,
      },
      storage: {
        totalSizeBytes,
        totalSizeMB,
        quotaBytes,
        quotaFormatted,
        percentUsed: Number(percentUsed.toFixed(4)),
        percentDisplay,
        dbSizeBytes,
        filesSizeBytes,
        displaySize: quotaDisplaySize,
      },
      stats: {
        totalUsers,
      },
    });
  } catch (err) {
    console.error('getSystemStatus error:', err);
    return res.status(500).json({ success: false, message: 'Could not retrieve system status.' });
  }
}

/** GET /api/analytics/institutional-overview — High-level KPI metrics for the Main Executive Dashboard */
async function getInstitutionalOverview(req, res) {
  try {
    const { currentTerm, termStartDate } = await getActiveTermConfig();

    const [[usersTotal]] = await pool.query("SELECT COUNT(id) AS count FROM users");
    const [[st]] = await pool.query("SELECT COUNT(id) AS count FROM users WHERE role = 'student'");
    const [[sec]] = await pool.query("SELECT COUNT(id) AS count FROM sections");
    
    // Attendance calculation: check today first, fallback to active term window average
    const today = getManilaDate();
    const [[attToday]] = await pool.query(
      "SELECT COUNT(id) AS presentCount FROM attendance_logs WHERE scan_date = ? AND status IN ('present', 'late')",
      [today]
    );
    let attendanceRate = 0;
    if (st.count > 0 && attToday.presentCount > 0) {
      attendanceRate = Math.round((attToday.presentCount / st.count) * 100);
    } else {
      const [[attTerm]] = await pool.query(
        "SELECT ROUND((SUM(status IN ('present', 'late')) / COUNT(id)) * 100) AS rate FROM attendance_logs WHERE scan_date >= ?",
        [termStartDate]
      );
      attendanceRate = attTerm.rate !== null ? Number(attTerm.rate) : 0;
    }

    // Average school GPA strictly for active term (resets to 0.0 when new term has no grades yet)
    const [[gpaRows]] = await pool.query(
      "SELECT ROUND(AVG(average), 1) AS avgGpa FROM grades WHERE term = ?",
      [currentTerm]
    );
    const schoolGpa = gpaRows.avgGpa !== null ? Number(gpaRows.avgGpa) : 0.0;

    return res.json({
      success: true,
      activeTerm: currentTerm,
      totalUsers: Number(usersTotal.count || 0),
      enrolledStudents: Number(st.count || 0),
      activeSections: Number(sec.count || 0),
      attendanceRate: Number(attendanceRate || 0),
      schoolGpa: Number(schoolGpa || 0),
    });
  } catch (err) {
    console.error('getInstitutionalOverview error:', err);
    return res.status(500).json({ success: false, message: 'Could not load institutional overview.' });
  }
}

/** GET /api/analytics/demographics — School-wide demographic breakdown (Sex, Strand, Grade Level, 4Ps/ARAL) */
async function getDemographics(req, res) {
  try {
    const [[totalRow]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'student'");
    const total = Number(totalRow.total || 0);

    // Sex distribution
    const [sexRows] = await pool.query(
      `SELECT COALESCE(sex, 'Unspecified') AS sex, COUNT(*) AS count
       FROM users WHERE role = 'student'
       GROUP BY sex`
    );
    const sexDistribution = {
      male: 0,
      female: 0,
      unspecified: 0,
      malePct: 0,
      femalePct: 0
    };
    sexRows.forEach(r => {
      const s = String(r.sex).toLowerCase();
      if (s === 'male') sexDistribution.male = Number(r.count);
      else if (s === 'female') sexDistribution.female = Number(r.count);
      else sexDistribution.unspecified += Number(r.count);
    });
    if (total > 0) {
      sexDistribution.malePct = Math.round((sexDistribution.male / total) * 100);
      sexDistribution.femalePct = Math.round((sexDistribution.female / total) * 100);
    }

    // Grade Level distribution
    const [gradeRows] = await pool.query(
      `SELECT COALESCE(sec.grade_level, 11) AS gradeLevel, COUNT(u.id) AS count
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       WHERE u.role = 'student'
       GROUP BY gradeLevel
       ORDER BY gradeLevel ASC`
    );
    const gradeDistribution = gradeRows.map(r => ({
      gradeLevel: Number(r.gradeLevel),
      count: Number(r.count),
      pct: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0
    }));

    // Government program distribution (4Ps, ARAL, Regular)
    const [progRows] = await pool.query(
      `SELECT COALESCE(program, 'regular') AS prog, COUNT(*) AS count
       FROM users WHERE role = 'student'
       GROUP BY prog`
    );
    const programDistribution = {
      fourPs: 0,
      aral: 0,
      regular: 0,
      fourPsPct: 0,
      aralPct: 0,
      regularPct: 0
    };
    progRows.forEach(r => {
      const p = String(r.prog).toLowerCase();
      if (p === '4ps') programDistribution.fourPs = Number(r.count);
      else if (p === 'aral') programDistribution.aral = Number(r.count);
      else programDistribution.regular += Number(r.count);
    });
    if (total > 0) {
      programDistribution.fourPsPct = Math.round((programDistribution.fourPs / total) * 100);
      programDistribution.aralPct = Math.round((programDistribution.aral / total) * 100);
      programDistribution.regularPct = Math.round((programDistribution.regular / total) * 100);
    }

    // Strand/Cluster distribution
    const [strandRows] = await pool.query(
      `SELECT st.id, st.code, st.title,
              COUNT(u.id) AS totalLearners,
              SUM(CASE WHEN LOWER(u.sex) = 'male' THEN 1 ELSE 0 END) AS maleCount,
              SUM(CASE WHEN LOWER(u.sex) = 'female' THEN 1 ELSE 0 END) AS femaleCount,
              SUM(CASE WHEN LOWER(u.program) = '4ps' THEN 1 ELSE 0 END) AS fourPsCount,
              SUM(CASE WHEN LOWER(u.program) = 'aral' THEN 1 ELSE 0 END) AS aralCount
       FROM strands st
       LEFT JOIN sections sec ON sec.strand_id = st.id
       LEFT JOIN users u ON u.section_id = sec.id AND u.role = 'student'
       GROUP BY st.id, st.code, st.title
       ORDER BY st.code ASC`
    );
    const strandDistribution = strandRows.map(r => ({
      strandId: r.id,
      code: r.code,
      title: r.title,
      totalLearners: Number(r.totalLearners || 0),
      maleCount: Number(r.maleCount || 0),
      femaleCount: Number(r.femaleCount || 0),
      fourPsCount: Number(r.fourPsCount || 0),
      aralCount: Number(r.aralCount || 0),
      pct: total > 0 ? Math.round((Number(r.totalLearners || 0) / total) * 100) : 0
    }));

    return res.json({
      success: true,
      demographics: {
        totalStudents: total,
        sexDistribution,
        gradeDistribution,
        programDistribution,
        strandDistribution
      }
    });
  } catch (err) {
    console.error('getDemographics error:', err);
    return res.status(500).json({ success: false, message: 'Could not load school-wide demographics.' });
  }
}

// ============================================================================
// Mentorae Brand Palette & Shared Excel Styling Helpers
// ============================================================================
const MENTORAE_EXCEL_COLORS = {
  primaryGreen: 'FF0A5C2C',    // #0A5C2C - Deep Forest Emerald Green (Main Headers & Banners)
  subRibbonGreen: 'FF074520',  // #074520 - Dark Forest Green (Subtitles & Group Bars)
  mintTint: 'FFE8F5E9',        // #E8F5E9 - Light Green Tint (Card Backgrounds & Accents)
  mintLight: 'FFF0FDF4',       // #F0FDF4 - Ultra-soft mint zebra stripe
  white: 'FFFFFFFF',           // #FFFFFF
  darkText: 'FF1F2937',        // #1F2937 - Modern charcoal text (High legibility)
  mutedText: 'FF4B5563',       // #4B5563 - Subtle gray for meta labels
  lightGrayBorder: 'FFE5E7EB', // #E5E7EB - Light cell borders
  mediumGreenBorder: 'FF0A5C2C',// #0A5C2C - Accent borders
  badge4Ps: 'FF15803D',        // #15803D - Green for 4Ps
  badgeAral: 'FFB45309',       // #B45309 - Amber for ARAL
  honorsGreen: 'FF15803D',     // #15803D - Green for Honors
  riskRed: 'FFDC2626',         // #DC2626 - Red for At-Risk
};

const BORDER_THIN = {
  top: { style: 'thin', color: { argb: MENTORAE_EXCEL_COLORS.lightGrayBorder } },
  bottom: { style: 'thin', color: { argb: MENTORAE_EXCEL_COLORS.lightGrayBorder } },
  left: { style: 'thin', color: { argb: MENTORAE_EXCEL_COLORS.lightGrayBorder } },
  right: { style: 'thin', color: { argb: MENTORAE_EXCEL_COLORS.lightGrayBorder } },
};

const BORDER_TOTAL_ROW = {
  top: { style: 'thin', color: { argb: MENTORAE_EXCEL_COLORS.mediumGreenBorder } },
  bottom: { style: 'double', color: { argb: MENTORAE_EXCEL_COLORS.mediumGreenBorder } },
  left: { style: 'thin', color: { argb: MENTORAE_EXCEL_COLORS.lightGrayBorder } },
  right: { style: 'thin', color: { argb: MENTORAE_EXCEL_COLORS.lightGrayBorder } },
};

function styleMergedRange(ws, startCol, startRow, endCol, endRow, { value, font, fill, alignment, border }) {
  ws.mergeCells(startRow, startCol, endRow, endCol);
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    for (let c = startCol; c <= endCol; c++) {
      const cell = row.getCell(c);
      if (font) cell.font = font;
      if (fill) cell.fill = fill;
      if (alignment) cell.alignment = alignment;
      if (border) cell.border = border;
    }
  }
  if (value !== undefined) {
    ws.getCell(startRow, startCol).value = value;
  }
}

async function getSchoolMetadata() {
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('school_name', 'school_year', 'current_semester')"
    );
    const map = {};
    rows.forEach(r => { map[r.setting_key] = r.setting_value; });
    return {
      schoolName: map.school_name || 'Talisay Senior High School',
      schoolYear: map.school_year || '2026-2027',
      currentSemester: map.current_semester || '1st Semester'
    };
  } catch (err) {
    return {
      schoolName: 'Talisay Senior High School',
      schoolYear: '2026-2027',
      currentSemester: '1st Semester'
    };
  }
}

/** GET /api/analytics/export-demographics — Generates official Excel workbook for demographic reporting */
async function exportDemographics(req, res) {
  try {
    const { schoolName, schoolYear } = await getSchoolMetadata();
    const exportDateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const [[totalRow]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'student'");
    const total = Number(totalRow.total || 0);

    const [strandRows] = await pool.query(
      `SELECT st.id, st.code, st.title,
              SUM(CASE WHEN sec.grade_level = 11 THEN 1 ELSE 0 END) AS g11Count,
              SUM(CASE WHEN sec.grade_level = 12 THEN 1 ELSE 0 END) AS g12Count,
              SUM(CASE WHEN LOWER(u.sex) = 'male' THEN 1 ELSE 0 END) AS maleCount,
              SUM(CASE WHEN LOWER(u.sex) = 'female' THEN 1 ELSE 0 END) AS femaleCount,
              SUM(CASE WHEN LOWER(u.program) = '4ps' THEN 1 ELSE 0 END) AS fourPsCount,
              SUM(CASE WHEN LOWER(u.program) = 'aral' THEN 1 ELSE 0 END) AS aralCount,
              COUNT(u.id) AS totalCount
       FROM strands st
       LEFT JOIN sections sec ON sec.strand_id = st.id
       LEFT JOIN users u ON u.section_id = sec.id AND u.role = 'student'
       GROUP BY st.id, st.code, st.title
       ORDER BY st.code ASC`
    );

    const [secRows] = await pool.query(
      `SELECT sec.name AS sectionName, sec.grade_level, st.code AS strandCode, st.title AS strandTitle,
              COUNT(u.id) AS enrolledCount,
              SUM(CASE WHEN LOWER(u.sex) = 'male' THEN 1 ELSE 0 END) AS maleCount,
              SUM(CASE WHEN LOWER(u.sex) = 'female' THEN 1 ELSE 0 END) AS femaleCount,
              SUM(CASE WHEN LOWER(u.program) = '4ps' THEN 1 ELSE 0 END) AS fourPsCount,
              SUM(CASE WHEN LOWER(u.program) = 'aral' THEN 1 ELSE 0 END) AS aralCount
       FROM sections sec
       JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN users u ON u.section_id = sec.id AND u.role = 'student'
       GROUP BY sec.id, sec.name, sec.grade_level, st.code, st.title
       ORDER BY sec.grade_level ASC, st.code ASC, sec.name ASC`
    );

    const [studentRows] = await pool.query(
      `SELECT u.id_number, u.last_name, u.first_name, u.middle_initial, u.sex,
              COALESCE(u.program, 'none') AS program,
              sec.grade_level, sec.name AS section_name,
              st.code AS strand_code, st.title AS strand_title
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE u.role = 'student'
       ORDER BY sec.grade_level ASC, st.code ASC, sec.name ASC, u.last_name ASC, u.first_name ASC`
    );

    let maleTotal = 0;
    let femaleTotal = 0;
    let fourPsTotal = 0;
    let aralTotal = 0;
    let g11Total = 0;
    let g12Total = 0;

    strandRows.forEach(r => {
      maleTotal += Number(r.maleCount || 0);
      femaleTotal += Number(r.femaleCount || 0);
      fourPsTotal += Number(r.fourPsCount || 0);
      aralTotal += Number(r.aralCount || 0);
      g11Total += Number(r.g11Count || 0);
      g12Total += Number(r.g12Count || 0);
    });

    const regTotal = Math.max(0, total - fourPsTotal - aralTotal);
    const mShare = total > 0 ? (maleTotal / total) : 0;
    const fShare = total > 0 ? (femaleTotal / total) : 0;
    const fourPsShare = total > 0 ? (fourPsTotal / total) : 0;
    const aralShare = total > 0 ? (aralTotal / total) : 0;
    const regShare = total > 0 ? (regTotal / total) : 0;
    const g11Share = total > 0 ? (g11Total / total) : 0;
    const g12Share = total > 0 ? (g12Total / total) : 0;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mentorae SIS';
    wb.lastModifiedBy = 'Mentorae SIS System';
    wb.created = new Date();
    wb.modified = new Date();

    // =========================================================================
    // Tab 1: Executive Overview
    // =========================================================================
    const ws1 = wb.addWorksheet('Executive Overview', {
      views: [{ showGridLines: true }],
      properties: { defaultRowHeight: 20 }
    });

    ws1.columns = [
      { key: 'colA', width: 28 },
      { key: 'colB', width: 28 },
      { key: 'colC', width: 44 },
      { key: 'colD', width: 18 },
      { key: 'colE', width: 18 },
    ];

    // Banner Block
    styleMergedRange(ws1, 1, 1, 5, 1, {
      value: schoolName.toUpperCase(),
      font: { name: 'Segoe UI', size: 14, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws1.getRow(1).height = 30;

    styleMergedRange(ws1, 1, 2, 5, 2, {
      value: 'MENTORAE STUDENT INFORMATION SYSTEM — INSTITUTIONAL DEMOGRAPHIC REPORT',
      font: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE6F4EA' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws1.getRow(2).height = 22;

    styleMergedRange(ws1, 1, 3, 5, 3, {
      value: 'OFFICIAL POPULATION SUMMARY, GENDER DISTRIBUTION & ASSISTANCE PROGRAMS',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: { style: 'medium', color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } } }
    });
    ws1.getRow(3).height = 20;

    styleMergedRange(ws1, 1, 4, 5, 4, {
      value: `Academic Year: ${schoolYear}   |   Generated: ${exportDateStr}   |   Classification: DepEd SHS Official Institutional Profile`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws1.getRow(4).height = 18;

    // KPI Summary Scorecards (Rows 6 to 8)
    // Card 1: Total Enrolled (Cols A-B)
    styleMergedRange(ws1, 1, 6, 2, 6, {
      value: 'TOTAL ENROLLED LEARNERS',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: BORDER_THIN.top, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 1, 7, 2, 7, {
      value: total,
      font: { name: 'Segoe UI', size: 18, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    ws1.getCell(7, 1).numFmt = '#,##0';
    styleMergedRange(ws1, 1, 8, 2, 8, {
      value: '100% Student Population',
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: BORDER_THIN.bottom, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });

    // Card 2: Gender Balance (Col C)
    styleMergedRange(ws1, 3, 6, 3, 6, {
      value: 'GENDER BALANCE',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: BORDER_THIN.top, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 3, 7, 3, 7, {
      value: `${maleTotal} M / ${femaleTotal} F`,
      font: { name: 'Segoe UI', size: 14, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.darkText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 3, 8, 3, 8, {
      value: `${(mShare * 100).toFixed(1)}% Male • ${(fShare * 100).toFixed(1)}% Female`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: BORDER_THIN.bottom, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });

    // Card 3: 4Ps Beneficiaries (Col D)
    styleMergedRange(ws1, 4, 6, 4, 6, {
      value: '4Ps BENEFICIARIES',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: BORDER_THIN.top, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 4, 7, 4, 7, {
      value: fourPsTotal,
      font: { name: 'Segoe UI', size: 16, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.badge4Ps } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    ws1.getCell(7, 4).numFmt = '#,##0';
    styleMergedRange(ws1, 4, 8, 4, 8, {
      value: `${(fourPsShare * 100).toFixed(1)}% of Student Body`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: BORDER_THIN.bottom, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });

    // Card 4: ARAL Remedial (Col E)
    styleMergedRange(ws1, 5, 6, 5, 6, {
      value: 'ARAL REMEDIAL',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: BORDER_THIN.top, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 5, 7, 5, 7, {
      value: aralTotal,
      font: { name: 'Segoe UI', size: 16, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.badgeAral } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    ws1.getCell(7, 5).numFmt = '#,##0';
    styleMergedRange(ws1, 5, 8, 5, 8, {
      value: `${(aralShare * 100).toFixed(1)}% Remedial Support`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: BORDER_THIN.bottom, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });

    ws1.getRow(5).height = 10;
    ws1.getRow(6).height = 20;
    ws1.getRow(7).height = 28;
    ws1.getRow(8).height = 18;
    ws1.getRow(9).height = 14;

    // --- Table 1: Sex & Gender Demographics ---
    styleMergedRange(ws1, 1, 10, 5, 10, {
      value: '1. SEX & GENDER DEMOGRAPHICS',
      font: { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'left' }
    });
    ws1.getRow(10).height = 24;

    const hRow1 = ws1.getRow(11);
    hRow1.height = 22;
    const headers1 = ['Classification', 'Gender Group', 'Description / Cohort Coverage', 'Enrolled Count', 'Percentage Share'];
    headers1.forEach((h, idx) => {
      const c = hRow1.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.alignment = { vertical: 'middle', horizontal: idx >= 3 ? 'right' : (idx === 0 ? 'center' : 'left') };
      c.border = BORDER_THIN;
    });

    const genderRows = [
      ['Sex / Gender', 'Male Learners', 'Official Enrolled Male Students', maleTotal, mShare],
      ['Sex / Gender', 'Female Learners', 'Official Enrolled Female Students', femaleTotal, fShare],
    ];

    genderRows.forEach((r, idx) => {
      const row = ws1.getRow(12 + idx);
      row.height = 22;
      r.forEach((val, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = val;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: cIdx >= 3 ? 'right' : (cIdx === 0 ? 'center' : 'left') };
        if (cIdx === 3) c.numFmt = '#,##0';
        if (cIdx === 4) c.numFmt = '0.0%';
      });
    });

    const gTotalRow = ws1.getRow(14);
    gTotalRow.height = 24;
    const gTotalVals = ['Total', 'All Learners', 'Consolidated Senior High School Enrolment', total, 1.0];
    gTotalVals.forEach((val, cIdx) => {
      const c = gTotalRow.getCell(cIdx + 1);
      c.value = val;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } };
      c.border = BORDER_TOTAL_ROW;
      c.alignment = { vertical: 'middle', horizontal: cIdx >= 3 ? 'right' : (cIdx === 0 ? 'center' : 'left') };
      if (cIdx === 3) c.numFmt = '#,##0';
      if (cIdx === 4) c.numFmt = '0.0%';
    });

    ws1.getRow(15).height = 14;

    // --- Table 2: Government Assistance & Remedial Programs ---
    styleMergedRange(ws1, 1, 16, 5, 16, {
      value: '2. GOVERNMENT ASSISTANCE & REMEDIAL INTERVENTION PROGRAMS',
      font: { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'left' }
    });
    ws1.getRow(16).height = 24;

    const hRow2 = ws1.getRow(17);
    hRow2.height = 22;
    const headers2 = ['Program Classification', 'Program Name / Tag', 'Description / Target Beneficiary', 'Beneficiaries Count', 'Percentage of Total'];
    headers2.forEach((h, idx) => {
      const c = hRow2.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.alignment = { vertical: 'middle', horizontal: idx >= 3 ? 'right' : (idx === 0 ? 'center' : 'left') };
      c.border = BORDER_THIN;
    });

    const progRows = [
      ['Assistance Program', '4Ps Beneficiaries', 'Pantawid Pamilyang Pilipino Program Beneficiaries', fourPsTotal, fourPsShare],
      ['Assistance Program', 'ARAL Program', 'Academic Recovery and Accessible Learning (Remedial Support)', aralTotal, aralShare],
      ['Assistance Program', 'Regular Learners', 'General Senior High School Student Population', regTotal, regShare],
    ];

    progRows.forEach((r, idx) => {
      const row = ws1.getRow(18 + idx);
      row.height = 22;
      r.forEach((val, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = val;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: cIdx >= 3 ? 'right' : (cIdx === 0 ? 'center' : 'left') };
        if (cIdx === 3) c.numFmt = '#,##0';
        if (cIdx === 4) c.numFmt = '0.0%';
      });
    });

    const pTotalRow = ws1.getRow(21);
    pTotalRow.height = 24;
    const pTotalVals = ['Total', 'All Programs', 'Consolidated Student Assistance Distribution', total, 1.0];
    pTotalVals.forEach((val, cIdx) => {
      const c = pTotalRow.getCell(cIdx + 1);
      c.value = val;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } };
      c.border = BORDER_TOTAL_ROW;
      c.alignment = { vertical: 'middle', horizontal: cIdx >= 3 ? 'right' : (cIdx === 0 ? 'center' : 'left') };
      if (cIdx === 3) c.numFmt = '#,##0';
      if (cIdx === 4) c.numFmt = '0.0%';
    });

    ws1.getRow(22).height = 14;

    // --- Table 3: Grade Level Enrolment ---
    styleMergedRange(ws1, 1, 23, 5, 23, {
      value: '3. SENIOR HIGH SCHOOL GRADE LEVEL ENROLMENT',
      font: { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'left' }
    });
    ws1.getRow(23).height = 24;

    const hRow3 = ws1.getRow(24);
    hRow3.height = 22;
    const headers3 = ['Grade Level', 'Academic Stage', 'Level Description', 'Enrolled Count', 'Percentage Share'];
    headers3.forEach((h, idx) => {
      const c = hRow3.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.alignment = { vertical: 'middle', horizontal: idx >= 3 ? 'right' : (idx === 0 ? 'center' : 'left') };
      c.border = BORDER_THIN;
    });

    const gradeSummaryRows = [
      ['Grade 11', 'Senior High School - Year 1', 'Incoming Senior High School Cohort', g11Total, g11Share],
      ['Grade 12', 'Senior High School - Year 2', 'Graduating Senior High School Cohort', g12Total, g12Share],
    ];

    gradeSummaryRows.forEach((r, idx) => {
      const row = ws1.getRow(25 + idx);
      row.height = 22;
      r.forEach((val, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = val;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: cIdx >= 3 ? 'right' : (cIdx === 0 ? 'center' : 'left') };
        if (cIdx === 3) c.numFmt = '#,##0';
        if (cIdx === 4) c.numFmt = '0.0%';
      });
    });

    const grTotalRow = ws1.getRow(27);
    grTotalRow.height = 24;
    const grTotalVals = ['Total Enrolled', 'All Grade Levels', 'Consolidated Grade 11 & Grade 12', total, 1.0];
    grTotalVals.forEach((val, cIdx) => {
      const c = grTotalRow.getCell(cIdx + 1);
      c.value = val;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } };
      c.border = BORDER_TOTAL_ROW;
      c.alignment = { vertical: 'middle', horizontal: cIdx >= 3 ? 'right' : (cIdx === 0 ? 'center' : 'left') };
      if (cIdx === 3) c.numFmt = '#,##0';
      if (cIdx === 4) c.numFmt = '0.0%';
    });

    // =========================================================================
    // Tab 2: Clusters & Strands
    // =========================================================================
    const ws2 = wb.addWorksheet('Clusters & Strands', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
      properties: { defaultRowHeight: 22 }
    });

    ws2.columns = [
      { key: 'no', width: 6 },
      { key: 'code', width: 16 },
      { key: 'title', width: 44 },
      { key: 'g11', width: 13 },
      { key: 'g12', width: 13 },
      { key: 'male', width: 12 },
      { key: 'female', width: 12 },
      { key: 'fourPs', width: 11 },
      { key: 'aral', width: 11 },
      { key: 'total', width: 16 },
      { key: 'pct', width: 14 },
    ];

    styleMergedRange(ws2, 1, 1, 11, 1, {
      value: schoolName.toUpperCase(),
      font: { name: 'Segoe UI', size: 14, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws2.getRow(1).height = 30;

    styleMergedRange(ws2, 1, 2, 11, 2, {
      value: 'MENTORAE SIS — ACADEMIC TRACK & STRAND DEMOGRAPHICS',
      font: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE6F4EA' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws2.getRow(2).height = 22;

    styleMergedRange(ws2, 1, 3, 11, 3, {
      value: 'Official Breakdown by Academic Track, Grade Level, Gender, and Assistance Programs',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: { style: 'medium', color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } } }
    });
    ws2.getRow(3).height = 20;

    styleMergedRange(ws2, 1, 4, 11, 4, {
      value: `Academic Year: ${schoolYear}   |   Export Date: ${exportDateStr}   |   Classification: DepEd SHS Curriculum Strands`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws2.getRow(4).height = 18;

    const t2Header = ws2.getRow(5);
    t2Header.height = 26;
    const t2Headers = ['No.', 'Cluster Code', 'Cluster / Strand Title', 'Grade 11', 'Grade 12', 'Male', 'Female', '4Ps', 'ARAL', 'Total Learners', '% Share'];
    t2Headers.forEach((h, idx) => {
      const c = t2Header.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
      c.alignment = { vertical: 'middle', horizontal: idx >= 3 ? 'right' : (idx === 2 ? 'left' : 'center') };
      c.border = BORDER_THIN;
    });

    strandRows.forEach((r, idx) => {
      const row = ws2.getRow(6 + idx);
      row.height = 22;
      const isEven = idx % 2 === 0;
      const vals = [
        idx + 1,
        r.code,
        r.title,
        Number(r.g11Count || 0),
        Number(r.g12Count || 0),
        Number(r.maleCount || 0),
        Number(r.femaleCount || 0),
        Number(r.fourPsCount || 0),
        Number(r.aralCount || 0),
        Number(r.totalCount || 0),
        total > 0 ? (Number(r.totalCount || 0) / total) : 0
      ];
      vals.forEach((v, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = v;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        if (cIdx === 1) c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: cIdx >= 3 ? 'right' : (cIdx === 2 ? 'left' : 'center') };
        if (cIdx >= 3 && cIdx <= 9) c.numFmt = '#,##0';
        if (cIdx === 10) c.numFmt = '0.0%';
      });
    });

    const totRow2 = ws2.getRow(6 + strandRows.length);
    totRow2.height = 26;
    const totVals2 = ['', 'TOTAL', 'Institutional Enrolment Total', g11Total, g12Total, maleTotal, femaleTotal, fourPsTotal, aralTotal, total, 1.0];
    totVals2.forEach((v, cIdx) => {
      const c = totRow2.getCell(cIdx + 1);
      c.value = v;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } };
      c.border = BORDER_TOTAL_ROW;
      c.alignment = { vertical: 'middle', horizontal: cIdx >= 3 ? 'right' : (cIdx === 2 ? 'left' : 'center') };
      if (cIdx >= 3 && cIdx <= 9) c.numFmt = '#,##0';
      if (cIdx === 10) c.numFmt = '0.0%';
    });
    ws2.autoFilter = 'A5:K5';

    // =========================================================================
    // Tab 3: Sections Distribution
    // =========================================================================
    const ws3 = wb.addWorksheet('Sections Distribution', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
      properties: { defaultRowHeight: 22 }
    });

    ws3.columns = [
      { key: 'no', width: 6 },
      { key: 'grade', width: 14 },
      { key: 'strand', width: 16 },
      { key: 'section', width: 34 },
      { key: 'male', width: 15 },
      { key: 'female', width: 15 },
      { key: 'fourPs', width: 16 },
      { key: 'aral', width: 15 },
      { key: 'total', width: 16 },
    ];

    styleMergedRange(ws3, 1, 1, 9, 1, {
      value: schoolName.toUpperCase(),
      font: { name: 'Segoe UI', size: 14, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws3.getRow(1).height = 30;

    styleMergedRange(ws3, 1, 2, 9, 2, {
      value: 'MENTORAE SIS — SECTION ENROLMENT & GENDER DISTRIBUTION',
      font: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE6F4EA' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws3.getRow(2).height = 22;

    styleMergedRange(ws3, 1, 3, 9, 3, {
      value: 'Class Section Rosters and Assistance Beneficiary Counts',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: { style: 'medium', color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } } }
    });
    ws3.getRow(3).height = 20;

    styleMergedRange(ws3, 1, 4, 9, 4, {
      value: `Academic Year: ${schoolYear}   |   Export Date: ${exportDateStr}   |   Active Section Rosters`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws3.getRow(4).height = 18;

    const t3Header = ws3.getRow(5);
    t3Header.height = 26;
    const t3Headers = ['No.', 'Grade Level', 'Cluster / Track', 'Section Name', 'Male Learners', 'Female Learners', '4Ps Beneficiaries', 'ARAL Remedial', 'Total Enrolled'];
    t3Headers.forEach((h, idx) => {
      const c = t3Header.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
      c.alignment = { vertical: 'middle', horizontal: idx >= 4 ? 'right' : (idx === 3 ? 'left' : 'center') };
      c.border = BORDER_THIN;
    });

    let secMaleSum = 0;
    let secFemaleSum = 0;
    let secFourPsSum = 0;
    let secAralSum = 0;
    let secTotalSum = 0;

    secRows.forEach((r, idx) => {
      const row = ws3.getRow(6 + idx);
      row.height = 22;
      const isEven = idx % 2 === 0;

      const m = Number(r.maleCount || 0);
      const f = Number(r.femaleCount || 0);
      const fourPs = Number(r.fourPsCount || 0);
      const aral = Number(r.aralCount || 0);
      const enr = Number(r.enrolledCount || 0);

      secMaleSum += m;
      secFemaleSum += f;
      secFourPsSum += fourPs;
      secAralSum += aral;
      secTotalSum += enr;

      const vals = [
        idx + 1,
        `Grade ${r.grade_level}`,
        r.strandCode,
        r.sectionName,
        m,
        f,
        fourPs,
        aral,
        enr
      ];

      vals.forEach((v, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = v;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        if (cIdx === 2) c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: cIdx >= 4 ? 'right' : (cIdx === 3 ? 'left' : 'center') };
        if (cIdx >= 4) c.numFmt = '#,##0';
      });
    });

    const totRow3 = ws3.getRow(6 + secRows.length);
    totRow3.height = 26;
    const totVals3 = ['', 'TOTAL', '', 'Consolidated Section Totals', secMaleSum, secFemaleSum, secFourPsSum, secAralSum, secTotalSum];
    totVals3.forEach((v, cIdx) => {
      const c = totRow3.getCell(cIdx + 1);
      c.value = v;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } };
      c.border = BORDER_TOTAL_ROW;
      c.alignment = { vertical: 'middle', horizontal: cIdx >= 4 ? 'right' : (cIdx === 3 ? 'left' : 'center') };
      if (cIdx >= 4) c.numFmt = '#,##0';
    });
    ws3.autoFilter = 'A5:I5';

    // =========================================================================
    // Tab 4: Learner Directory (Student Demographic Masterlist)
    // =========================================================================
    const ws4 = wb.addWorksheet('Learner Directory', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
      properties: { defaultRowHeight: 22 }
    });

    ws4.columns = [
      { key: 'no', width: 6 },
      { key: 'idNumber', width: 20 },
      { key: 'fullName', width: 34 },
      { key: 'sex', width: 10 },
      { key: 'grade', width: 14 },
      { key: 'strand', width: 16 },
      { key: 'section', width: 30 },
      { key: 'program', width: 22 },
    ];

    styleMergedRange(ws4, 1, 1, 8, 1, {
      value: schoolName.toUpperCase(),
      font: { name: 'Segoe UI', size: 14, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws4.getRow(1).height = 30;

    styleMergedRange(ws4, 1, 2, 8, 2, {
      value: 'MENTORAE SIS — STUDENT DEMOGRAPHIC DIRECTORY & ROSTER',
      font: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE6F4EA' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws4.getRow(2).height = 22;

    styleMergedRange(ws4, 1, 3, 8, 3, {
      value: 'Comprehensive Senior High School Learner Demographic Masterlist',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: { style: 'medium', color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } } }
    });
    ws4.getRow(3).height = 20;

    styleMergedRange(ws4, 1, 4, 8, 4, {
      value: `Academic Year: ${schoolYear}   |   Export Date: ${exportDateStr}   |   Total Enrolled Learners: ${studentRows.length}`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws4.getRow(4).height = 18;

    const t4Header = ws4.getRow(5);
    t4Header.height = 26;
    const t4Headers = ['No.', 'LRN / ID Number', 'Learner Full Name', 'Sex', 'Grade Level', 'Cluster / Track', 'Section Name', 'Assistance Program'];
    t4Headers.forEach((h, idx) => {
      const c = t4Header.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
      c.alignment = { vertical: 'middle', horizontal: (idx === 2 || idx === 6) ? 'left' : 'center' };
      c.border = BORDER_THIN;
    });

    studentRows.forEach((r, idx) => {
      const row = ws4.getRow(6 + idx);
      row.height = 22;
      const isEven = idx % 2 === 0;
      const mi = r.middle_initial ? ` ${r.middle_initial}.` : '';
      const fullName = `${r.last_name}, ${r.first_name}${mi}`;
      let progLabel = 'Regular';
      let progColor = MENTORAE_EXCEL_COLORS.darkText;
      let progBold = false;
      if (String(r.program).toLowerCase() === '4ps') {
        progLabel = '4Ps Beneficiary';
        progColor = MENTORAE_EXCEL_COLORS.badge4Ps;
        progBold = true;
      } else if (String(r.program).toLowerCase() === 'aral') {
        progLabel = 'ARAL Program';
        progColor = MENTORAE_EXCEL_COLORS.badgeAral;
        progBold = true;
      }

      const vals = [
        idx + 1,
        r.id_number,
        fullName,
        r.sex || 'Unspecified',
        `Grade ${r.grade_level || '11'}`,
        r.strand_code || 'N/A',
        r.section_name || 'Unassigned',
        progLabel
      ];

      vals.forEach((v, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = v;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        if (cIdx === 1) c.numFmt = '@';
        if (cIdx === 5) c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
        if (cIdx === 7) c.font = { name: 'Segoe UI', size: 10, bold: progBold, color: { argb: progColor } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: (cIdx === 2 || cIdx === 6) ? 'left' : 'center' };
      });
    });

    const totRow4 = ws4.getRow(6 + studentRows.length);
    totRow4.height = 26;
    styleMergedRange(ws4, 1, 6 + studentRows.length, 8, 6 + studentRows.length, {
      value: `TOTAL ACTIVE ENROLLED LEARNERS: ${studentRows.length}`,
      font: { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      border: BORDER_TOTAL_ROW,
      alignment: { vertical: 'middle', horizontal: 'left' }
    });
    ws4.autoFilter = 'A5:H5';

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `TSHS_School_Demographics_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('exportDemographics error:', err);
    return res.status(500).json({ success: false, message: 'Could not export school-wide demographics.' });
  }
}

/** GET /api/analytics/export-academic-trends — Generates official Excel workbook for multi-term academic progression */
async function exportAcademicTrends(req, res) {
  try {
    const { schoolName, schoolYear } = await getSchoolMetadata();
    const exportDateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // 1. School-wide term averages
    const [trendRows] = await pool.query(
      `SELECT g.term,
              COUNT(g.id) AS recordedGradesCount,
              ROUND(AVG(g.average), 2) AS averageGrade,
              SUM(CASE WHEN g.average >= 75 THEN 1 ELSE 0 END) AS passedCount,
              SUM(CASE WHEN g.average >= 90 THEN 1 ELSE 0 END) AS honorsCount,
              SUM(CASE WHEN g.average < 75 THEN 1 ELSE 0 END) AS atRiskCount
       FROM grades g
       GROUP BY g.term
       ORDER BY g.term ASC`
    );

    // 2. Strand averages per term
    const [strandTrendRows] = await pool.query(
      `SELECT st.code AS strandCode, st.title AS strandTitle, g.term,
              ROUND(AVG(g.average), 2) AS avgGrade,
              COUNT(g.id) AS gradeCount
       FROM grades g
       JOIN sections sec ON sec.id = g.section_id
       JOIN strands st ON st.id = sec.strand_id
       GROUP BY st.code, st.title, g.term
       ORDER BY st.code ASC, g.term ASC`
    );

    // 3. Subject performance overview
    const [subjectRows] = await pool.query(
      `SELECT sub.code AS subjectCode, sub.name AS subjectName, sub.classification,
              ROUND(AVG(g.average), 2) AS avgGrade,
              SUM(CASE WHEN g.average >= 75 THEN 1 ELSE 0 END) AS passedCount,
              COUNT(g.id) AS totalGrades
       FROM grades g
       JOIN subjects sub ON sub.id = g.subject_id
       GROUP BY sub.code, sub.name, sub.classification
       ORDER BY avgGrade DESC`
    );

    let totalEvaluated = 0;
    let totalPassed = 0;
    let totalHonors = 0;
    let totalAtRisk = 0;
    let sumGpa = 0;

    trendRows.forEach(r => {
      totalEvaluated += Number(r.recordedGradesCount || 0);
      totalPassed += Number(r.passedCount || 0);
      totalHonors += Number(r.honorsCount || 0);
      totalAtRisk += Number(r.atRiskCount || 0);
      sumGpa += Number(r.averageGrade || 0);
    });

    const overallGpa = trendRows.length > 0 ? (sumGpa / trendRows.length) : 0;
    const overallPassingRate = totalEvaluated > 0 ? (totalPassed / totalEvaluated) : 0;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mentorae SIS';
    wb.lastModifiedBy = 'Mentorae SIS System';
    wb.created = new Date();
    wb.modified = new Date();

    // =========================================================================
    // Tab 1: Academic Trends Summary
    // =========================================================================
    const ws1 = wb.addWorksheet('Academic Trends Summary', {
      views: [{ state: 'frozen', ySplit: 11, showGridLines: true }],
      properties: { defaultRowHeight: 22 }
    });

    ws1.columns = [
      { key: 'term', width: 22 },
      { key: 'evaluated', width: 20 },
      { key: 'avgGpa', width: 20 },
      { key: 'passed', width: 18 },
      { key: 'rate', width: 18 },
      { key: 'honors', width: 18 },
      { key: 'atRisk', width: 18 },
    ];

    styleMergedRange(ws1, 1, 1, 7, 1, {
      value: schoolName.toUpperCase(),
      font: { name: 'Segoe UI', size: 14, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws1.getRow(1).height = 30;

    styleMergedRange(ws1, 1, 2, 7, 2, {
      value: 'MENTORAE SIS — MULTI-TERM ACADEMIC PROGRESSION REPORT',
      font: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE6F4EA' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws1.getRow(2).height = 22;

    styleMergedRange(ws1, 1, 3, 7, 3, {
      value: 'DepEd Senior High School Term GPA, Passing Rates, and Academic Distribution',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: { style: 'medium', color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } } }
    });
    ws1.getRow(3).height = 20;

    styleMergedRange(ws1, 1, 4, 7, 4, {
      value: `Academic Year: ${schoolYear}   |   Export Date: ${exportDateStr}   |   Institutional Aggregate Trends`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws1.getRow(4).height = 18;

    // KPI Scorecards (Rows 6 to 8)
    // Card 1: School GPA (Cols A-B)
    styleMergedRange(ws1, 1, 6, 2, 6, {
      value: 'OVERALL SCHOOL GPA',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: BORDER_THIN.top, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 1, 7, 2, 7, {
      value: overallGpa,
      font: { name: 'Segoe UI', size: 18, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    ws1.getCell(7, 1).numFmt = '0.00';
    styleMergedRange(ws1, 1, 8, 2, 8, {
      value: 'Institutional Average',
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: BORDER_THIN.bottom, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });

    // Card 2: Passing Rate (Cols C-D)
    styleMergedRange(ws1, 3, 6, 4, 6, {
      value: 'OVERALL PASSING RATE',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: BORDER_THIN.top, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 3, 7, 4, 7, {
      value: overallPassingRate,
      font: { name: 'Segoe UI', size: 18, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.honorsGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    ws1.getCell(7, 3).numFmt = '0.0%';
    styleMergedRange(ws1, 3, 8, 4, 8, {
      value: `${totalPassed.toLocaleString()} Total Grades >= 75`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: BORDER_THIN.bottom, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });

    // Card 3: Honors (Col E)
    styleMergedRange(ws1, 5, 6, 5, 6, {
      value: 'HONORS (90+)',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: BORDER_THIN.top, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 5, 7, 5, 7, {
      value: totalHonors,
      font: { name: 'Segoe UI', size: 16, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.honorsGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    ws1.getCell(7, 5).numFmt = '#,##0';
    styleMergedRange(ws1, 5, 8, 5, 8, {
      value: 'High Academic Performers',
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: BORDER_THIN.bottom, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });

    // Card 4: At-Risk (Cols F-G)
    styleMergedRange(ws1, 6, 6, 7, 6, {
      value: 'AT-RISK RECORDS (<75)',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: BORDER_THIN.top, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    styleMergedRange(ws1, 6, 7, 7, 7, {
      value: totalAtRisk,
      font: { name: 'Segoe UI', size: 16, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.riskRed } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { left: BORDER_THIN.left, right: BORDER_THIN.right }
    });
    ws1.getCell(7, 6).numFmt = '#,##0';
    styleMergedRange(ws1, 6, 8, 7, 8, {
      value: 'Subject Grades Needing Intervention',
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: BORDER_THIN.bottom, left: BORDER_THIN.left, right: BORDER_THIN.right }
    });

    ws1.getRow(5).height = 10;
    ws1.getRow(6).height = 20;
    ws1.getRow(7).height = 28;
    ws1.getRow(8).height = 18;
    ws1.getRow(9).height = 14;

    // Table Header
    styleMergedRange(ws1, 1, 10, 7, 10, {
      value: 'GRADING TERM PROGRESSION & PERFORMANCE',
      font: { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'left' }
    });
    ws1.getRow(10).height = 24;

    const hRow1 = ws1.getRow(11);
    hRow1.height = 24;
    const headers1 = ['Grading Term', 'Evaluated Grades', 'Term Average (GPA)', 'Passed Count', 'Passing Rate (%)', 'Honors (90+)', 'At-Risk (<75)'];
    headers1.forEach((h, idx) => {
      const c = hRow1.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.alignment = { vertical: 'middle', horizontal: idx === 0 ? 'center' : 'right' };
      c.border = BORDER_THIN;
    });

    trendRows.forEach((r, idx) => {
      const row = ws1.getRow(12 + idx);
      row.height = 22;
      const isEven = idx % 2 === 0;
      const count = Number(r.recordedGradesCount || 0);
      const passed = Number(r.passedCount || 0);
      const passRate = count > 0 ? (passed / count) : 0;
      const avg = Number(r.averageGrade || 0);
      const honors = Number(r.honorsCount || 0);
      const atRisk = Number(r.atRiskCount || 0);

      const vals = [r.term, count, avg, passed, passRate, honors, atRisk];

      vals.forEach((v, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = v;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        if (cIdx === 0) c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
        if (cIdx === 5) c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.honorsGreen } };
        if (cIdx === 6) c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.riskRed } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: cIdx === 0 ? 'center' : 'right' };
        if ([1, 3, 5, 6].includes(cIdx)) c.numFmt = '#,##0';
        if (cIdx === 2) c.numFmt = '0.00';
        if (cIdx === 4) c.numFmt = '0.0%';
      });
    });

    const totRow1 = ws1.getRow(12 + trendRows.length);
    totRow1.height = 26;
    const totVals1 = ['Consolidated Record', totalEvaluated, overallGpa, totalPassed, overallPassingRate, totalHonors, totalAtRisk];
    totVals1.forEach((v, cIdx) => {
      const c = totRow1.getCell(cIdx + 1);
      c.value = v;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } };
      c.border = BORDER_TOTAL_ROW;
      c.alignment = { vertical: 'middle', horizontal: cIdx === 0 ? 'center' : 'right' };
      if ([1, 3, 5, 6].includes(cIdx)) c.numFmt = '#,##0';
      if (cIdx === 2) c.numFmt = '0.00';
      if (cIdx === 4) c.numFmt = '0.0%';
    });
    ws1.autoFilter = 'A11:G11';

    // =========================================================================
    // Tab 2: Clusters Performance
    // =========================================================================
    const ws2 = wb.addWorksheet('Clusters Performance', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
      properties: { defaultRowHeight: 22 }
    });

    ws2.columns = [
      { key: 'no', width: 6 },
      { key: 'code', width: 16 },
      { key: 'title', width: 44 },
      { key: 'term', width: 16 },
      { key: 'avgGpa', width: 20 },
      { key: 'sample', width: 18 },
    ];

    styleMergedRange(ws2, 1, 1, 6, 1, {
      value: schoolName.toUpperCase(),
      font: { name: 'Segoe UI', size: 14, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws2.getRow(1).height = 30;

    styleMergedRange(ws2, 1, 2, 6, 2, {
      value: 'MENTORAE SIS — CLUSTER & STRAND PERFORMANCE TRENDS',
      font: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE6F4EA' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws2.getRow(2).height = 22;

    styleMergedRange(ws2, 1, 3, 6, 3, {
      value: 'Academic Track and Cluster Averages Across Evaluation Periods',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: { style: 'medium', color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } } }
    });
    ws2.getRow(3).height = 20;

    styleMergedRange(ws2, 1, 4, 6, 4, {
      value: `Academic Year: ${schoolYear}   |   Export Date: ${exportDateStr}   |   Tracks & Strands`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws2.getRow(4).height = 18;

    const t2Header = ws2.getRow(5);
    t2Header.height = 26;
    const t2Headers = ['No.', 'Cluster Code', 'Cluster / Strand Title', 'Grading Term', 'Term GPA Average', 'Sample Records'];
    t2Headers.forEach((h, idx) => {
      const c = t2Header.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
      c.alignment = { vertical: 'middle', horizontal: idx >= 4 ? 'right' : (idx === 2 ? 'left' : 'center') };
      c.border = BORDER_THIN;
    });

    strandTrendRows.forEach((r, idx) => {
      const row = ws2.getRow(6 + idx);
      row.height = 22;
      const isEven = idx % 2 === 0;
      const vals = [
        idx + 1,
        r.strandCode,
        r.strandTitle,
        r.term,
        Number(r.avgGrade || 0),
        Number(r.gradeCount || 0)
      ];
      vals.forEach((v, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = v;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        if (cIdx === 1) c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: cIdx >= 4 ? 'right' : (cIdx === 2 ? 'left' : 'center') };
        if (cIdx === 4) c.numFmt = '0.00';
        if (cIdx === 5) c.numFmt = '#,##0';
      });
    });
    ws2.autoFilter = 'A5:F5';

    // =========================================================================
    // Tab 3: Subjects Ranking
    // =========================================================================
    const ws3 = wb.addWorksheet('Subjects Ranking', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
      properties: { defaultRowHeight: 22 }
    });

    ws3.columns = [
      { key: 'no', width: 6 },
      { key: 'code', width: 16 },
      { key: 'name', width: 38 },
      { key: 'classification', width: 18 },
      { key: 'avgGrade', width: 18 },
      { key: 'passRate', width: 18 },
      { key: 'totalRecords', width: 18 },
    ];

    styleMergedRange(ws3, 1, 1, 7, 1, {
      value: schoolName.toUpperCase(),
      font: { name: 'Segoe UI', size: 14, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws3.getRow(1).height = 30;

    styleMergedRange(ws3, 1, 2, 7, 2, {
      value: 'MENTORAE SIS — SUBJECT PERFORMANCE & RANKING',
      font: { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFE6F4EA' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.subRibbonGreen } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws3.getRow(2).height = 22;

    styleMergedRange(ws3, 1, 3, 7, 3, {
      value: 'Curriculum Course Performance, Average Grades, and Passing Percentages',
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.mintTint } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { bottom: { style: 'medium', color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } } }
    });
    ws3.getRow(3).height = 20;

    styleMergedRange(ws3, 1, 4, 7, 4, {
      value: `Academic Year: ${schoolYear}   |   Export Date: ${exportDateStr}   |   Curriculum Performance`,
      font: { name: 'Segoe UI', size: 9, italic: true, color: { argb: MENTORAE_EXCEL_COLORS.mutedText } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    });
    ws3.getRow(4).height = 18;

    const t3Header = ws3.getRow(5);
    t3Header.height = 26;
    const t3Headers = ['No.', 'Subject Code', 'Subject Name', 'Classification', 'Average Grade (GPA)', 'Passing Rate (%)', 'Total Records Evaluated'];
    t3Headers.forEach((h, idx) => {
      const c = t3Header.getCell(idx + 1);
      c.value = h;
      c.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
      c.alignment = { vertical: 'middle', horizontal: idx >= 4 ? 'right' : (idx === 2 ? 'left' : 'center') };
      c.border = BORDER_THIN;
    });

    subjectRows.forEach((r, idx) => {
      const row = ws3.getRow(6 + idx);
      row.height = 22;
      const isEven = idx % 2 === 0;
      const tot = Number(r.totalGrades || 0);
      const pass = Number(r.passedCount || 0);
      const rate = tot > 0 ? (pass / tot) : 0;
      const vals = [
        idx + 1,
        r.subjectCode,
        r.subjectName,
        r.classification || 'Core',
        Number(r.avgGrade || 0),
        rate,
        tot
      ];
      vals.forEach((v, cIdx) => {
        const c = row.getCell(cIdx + 1);
        c.value = v;
        c.font = { name: 'Segoe UI', size: 10, color: { argb: MENTORAE_EXCEL_COLORS.darkText } };
        if (cIdx === 1) c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: MENTORAE_EXCEL_COLORS.primaryGreen } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? MENTORAE_EXCEL_COLORS.white : MENTORAE_EXCEL_COLORS.mintLight } };
        c.border = BORDER_THIN;
        c.alignment = { vertical: 'middle', horizontal: cIdx >= 4 ? 'right' : (cIdx === 2 ? 'left' : 'center') };
        if (cIdx === 4) c.numFmt = '0.00';
        if (cIdx === 5) c.numFmt = '0.0%';
        if (cIdx === 6) c.numFmt = '#,##0';
      });
    });
    ws3.autoFilter = 'A5:G5';

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `TSHS_Academic_Trends_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('exportAcademicTrends error:', err);
    return res.status(500).json({ success: false, message: 'Could not export academic trends.' });
  }
}

module.exports = {
  getFilterOptions,
  getGradeTrend,
  getRiskDistribution,
  getRiskDirectory,
  getRiskAssessment,
  getPredictiveRisk,
  getSystemStatus,
  getInstitutionalOverview,
  getDemographics,
  exportDemographics,
  exportAcademicTrends,
};

