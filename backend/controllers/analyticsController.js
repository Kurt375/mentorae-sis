const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
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

/** GET /api/analytics/export-demographics — Generates official Excel workbook for demographic reporting */
async function exportDemographics(req, res) {
  try {
    const [[totalRow]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'student'");
    const total = Number(totalRow.total || 0);

    const [strandRows] = await pool.query(
      `SELECT st.code, st.title,
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
      `SELECT sec.name AS sectionName, sec.grade_level, st.code AS strandCode,
              COUNT(u.id) AS enrolledCount,
              SUM(CASE WHEN LOWER(u.sex) = 'male' THEN 1 ELSE 0 END) AS maleCount,
              SUM(CASE WHEN LOWER(u.sex) = 'female' THEN 1 ELSE 0 END) AS femaleCount
       FROM sections sec
       JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN users u ON u.section_id = sec.id AND u.role = 'student'
       GROUP BY sec.id, sec.name, sec.grade_level, st.code
       ORDER BY sec.grade_level ASC, st.code ASC, sec.name ASC`
    );

    // Sheet 1: Executive Summary
    const sheet1Data = [
      ["TALISAY SENIOR HIGH SCHOOL - INSTITUTIONAL DEMOGRAPHIC REPORT"],
      ["Academic Year:", "2026-2027", "Generated On:", new Date().toLocaleDateString()],
      ["Total Enrolled Learners:", total],
      [],
      ["DEMOGRAPHIC CATEGORY", "CLASSIFICATION", "ENROLLED COUNT", "PERCENTAGE OF TOTAL"],
    ];

    let maleTotal = 0;
    let femaleTotal = 0;
    let fourPsTotal = 0;
    let aralTotal = 0;

    strandRows.forEach(r => {
      maleTotal += Number(r.maleCount || 0);
      femaleTotal += Number(r.femaleCount || 0);
      fourPsTotal += Number(r.fourPsCount || 0);
      aralTotal += Number(r.aralCount || 0);
    });

    const mPct = total > 0 ? ((maleTotal / total) * 100).toFixed(1) + '%' : '0%';
    const fPct = total > 0 ? ((femaleTotal / total) * 100).toFixed(1) + '%' : '0%';
    sheet1Data.push(["Sex / Gender", "Male Learners", maleTotal, mPct]);
    sheet1Data.push(["Sex / Gender", "Female Learners", femaleTotal, fPct]);

    const fourPsPct = total > 0 ? ((fourPsTotal / total) * 100).toFixed(1) + '%' : '0%';
    const aralPct = total > 0 ? ((aralTotal / total) * 100).toFixed(1) + '%' : '0%';
    const regTotal = Math.max(0, total - fourPsTotal - aralTotal);
    const regPct = total > 0 ? ((regTotal / total) * 100).toFixed(1) + '%' : '0%';
    sheet1Data.push(["Assistance Program", "4Ps Beneficiaries", fourPsTotal, fourPsPct]);
    sheet1Data.push(["Assistance Program", "ARAL Program (Remedial)", aralTotal, aralPct]);
    sheet1Data.push(["Assistance Program", "Regular Learners", regTotal, regPct]);

    // Sheet 2: Cluster & Strand Details
    const sheet2Data = [
      ["No.", "Cluster Code", "Cluster Title", "Grade 11", "Grade 12", "Male", "Female", "4Ps", "ARAL", "Total Learners", "Percentage"]
    ];
    strandRows.forEach((r, idx) => {
      const pct = total > 0 ? ((Number(r.totalCount) / total) * 100).toFixed(1) + '%' : '0%';
      sheet2Data.push([
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
        pct
      ]);
    });

    // Sheet 3: Section Roster Counts
    const sheet3Data = [
      ["No.", "Grade Level", "Cluster / Track", "Section Name", "Male Learners", "Female Learners", "Total Enrolled"]
    ];
    secRows.forEach((r, idx) => {
      sheet3Data.push([
        idx + 1,
        `Grade ${r.grade_level}`,
        r.strandCode,
        r.sectionName,
        Number(r.maleCount || 0),
        Number(r.femaleCount || 0),
        Number(r.enrolledCount || 0)
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    ws1['!cols'] = [{ wch: 25 }, { wch: 28 }, { wch: 18 }, { wch: 22 }];

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 38 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    ws3['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 18 }, { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];

    XLSX.utils.book_append_sheet(wb, ws1, "Executive Demographics");
    XLSX.utils.book_append_sheet(wb, ws2, "Clusters & Strands");
    XLSX.utils.book_append_sheet(wb, ws3, "Sections Distribution");

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `TSHS_School_Demographics_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (err) {
    console.error('exportDemographics error:', err);
    return res.status(500).json({ success: false, message: 'Could not export school-wide demographics.' });
  }
}

/** GET /api/analytics/export-academic-trends — Generates official Excel workbook for multi-term academic progression */
async function exportAcademicTrends(req, res) {
  try {
    // School-wide term averages
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

    // Strand averages per term
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

    // Subject averages
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

    // Sheet 1: Academic Progression
    const sheet1Data = [
      ["TALISAY SENIOR HIGH SCHOOL - AGGREGATE ACADEMIC TRENDS REPORT"],
      ["Academic Year:", "2026-2027", "Export Date:", new Date().toLocaleDateString()],
      [],
      ["GRADING TERM", "EVALUATED GRADES", "TERM AVERAGE GPA", "PASSED COUNT", "PASSING RATE (%)", "HONORS (90+)", "AT-RISK (<75)"]
    ];

    trendRows.forEach(r => {
      const total = Number(r.recordedGradesCount || 0);
      const passed = Number(r.passedCount || 0);
      const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) + '%' : '0%';
      sheet1Data.push([
        r.term,
        total,
        Number(r.averageGrade || 0),
        passed,
        passRate,
        Number(r.honorsCount || 0),
        Number(r.atRiskCount || 0)
      ]);
    });

    // Sheet 2: Cluster Performance Trends
    const sheet2Data = [
      ["No.", "Cluster Code", "Cluster Title", "Grading Term", "Term GPA Average", "Grades Sample Size"]
    ];
    strandTrendRows.forEach((r, idx) => {
      sheet2Data.push([
        idx + 1,
        r.strandCode,
        r.strandTitle,
        r.term,
        Number(r.avgGrade || 0),
        Number(r.gradeCount || 0)
      ]);
    });

    // Sheet 3: Subject Performance Overview
    const sheet3Data = [
      ["No.", "Subject Code", "Subject Name", "Classification", "Average Grade", "Passing Rate (%)", "Total Records"]
    ];
    subjectRows.forEach((r, idx) => {
      const tot = Number(r.totalGrades || 0);
      const pass = Number(r.passedCount || 0);
      const rate = tot > 0 ? ((pass / tot) * 100).toFixed(1) + '%' : '0%';
      sheet3Data.push([
        idx + 1,
        r.subjectCode,
        r.subjectName,
        r.classification || 'Core',
        Number(r.avgGrade || 0),
        rate,
        tot
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    ws1['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 35 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    ws3['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 35 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }];

    XLSX.utils.book_append_sheet(wb, ws1, "Academic Trends Summary");
    XLSX.utils.book_append_sheet(wb, ws2, "Clusters Performance");
    XLSX.utils.book_append_sheet(wb, ws3, "Subjects Ranking");

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `TSHS_Academic_Trends_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
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

