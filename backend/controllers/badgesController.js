const pool = require('../config/db');
const cache = require('../utils/cache');
const { canViewStudent, teacherTeachesStudent, teacherTeachesSection, getParentIdsForStudent } = require('../utils/authz');
const { notify, notifyMany } = require('../utils/notifications');
const { sendBadgeAwardedEmail } = require('../utils/mailer');

// Badges reserved for automated system distribution (cannot be manually awarded by teachers)
const SYSTEM_AWARDED_BADGE_IDS = [
  'completed_grades',
  'completed_grade',
  'honor_student',
  'honor_students',
  'early_bird',
  'perfect_attendance',
];

function isSystemAutomatedBadge(id, name = '') {
  const cleanId = String(id || '').trim().toLowerCase();
  const cleanName = String(name || '').trim().toLowerCase();
  return (
    SYSTEM_AWARDED_BADGE_IDS.includes(cleanId) ||
    cleanId.includes('completed_grade') ||
    cleanId.includes('honor_student') ||
    cleanId.includes('early_bird') ||
    cleanId.includes('perfect_attendance') ||
    cleanName.includes('completed grade') ||
    cleanName.includes('honor student') ||
    cleanName.includes('early bird') ||
    cleanName.includes('perfect attendance')
  );
}

/** GET /api/badges/catalog — the fixed set of awardable badges */
async function getCatalog(req, res) {
  try {
    const cached = cache.get('badge_catalog');
    if (cached) {
      return res.json({ success: true, badges: cached });
    }

    const [rows] = await pool.query('SELECT * FROM badge_catalog');
    const badges = rows.map((b) => ({
      ...b,
      is_system_awarded: isSystemAutomatedBadge(b.id, b.name),
    }));

    // Regular badges first, system-automated badges grouped at the bottom
    badges.sort((a, b) => {
      const aSys = a.is_system_awarded ? 1 : 0;
      const bSys = b.is_system_awarded ? 1 : 0;
      if (aSys !== bSys) return aSys - bSys;
      return (a.name || '').localeCompare(b.name || '');
    });

    cache.set('badge_catalog', badges, 3600); // 1 hour cache
    return res.json({ success: true, badges });
  } catch (err) {
    console.error('getCatalog error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the badge catalog.' });
  }
}

/** POST /api/badges/award  { studentId, studentIds: [], badgeIds: [] } */
async function awardBadges(req, res) {
  let { studentId, studentIds, badgeIds } = req.body;
  if (!studentIds && studentId) {
    studentIds = [studentId];
  }
  if (!Array.isArray(studentIds) || !studentIds.length || !Array.isArray(badgeIds) || !badgeIds.length) {
    return res.status(400).json({ success: false, message: 'studentId(s) and at least one badgeId are required.' });
  }

  // Sanitize and deduplicate studentIds
  const cleanStudentIds = Array.from(new Set(studentIds.map((id) => Number(id) || id).filter(Boolean)));
  if (!cleanStudentIds.length) {
    return res.status(400).json({ success: false, message: 'Valid studentId(s) required.' });
  }

  try {
    if (req.user.role === 'teacher') {
      // Efficient batch authorization check for all target students
      const [allowedRows] = await pool.query(
        `SELECT id FROM users WHERE id IN (?) AND section_id IN (
           SELECT section_id FROM schedules WHERE teacher_id = ?
           UNION
           SELECT id AS section_id FROM sections WHERE adviser_id = ? OR co_adviser_id = ?
         )`,
        [cleanStudentIds, req.user.id, req.user.id, req.user.id]
      );
      const allowedSet = new Set(allowedRows.map((r) => String(r.id)));
      const unauthorized = cleanStudentIds.filter((id) => !allowedSet.has(String(id)));
      if (unauthorized.length > 0) {
        return res.status(403).json({
          success: false,
          message: `You do not teach student ID(s): ${unauthorized.join(', ')}.`,
        });
      }

      // Teachers cannot award automated system badges
      const forbiddenBadges = badgeIds.filter((id) => isSystemAutomatedBadge(id));
      if (forbiddenBadges.length > 0) {
        return res.status(403).json({
          success: false,
          message: `The following badge(s) are automated and can only be awarded by the system: ${forbiddenBadges.join(', ')}.`,
        });
      }
    }

    const [catalogRows] = await pool.query('SELECT * FROM badge_catalog WHERE id IN (?)', [badgeIds]);
    if (!catalogRows.length) {
      return res.status(400).json({ success: false, message: 'No valid badges selected.' });
    }

    const teacherName = req.user ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() : 'Teacher';
    const badgeNames = catalogRows.map((b) => b.name).join(', ');

    const badgeValues = [];
    const activityValues = [];

    for (const sId of cleanStudentIds) {
      for (const badge of catalogRows) {
        badgeValues.push([sId, badge.id, req.user.id]);
        activityValues.push([sId, `Awarded "${badge.name}" badge`]);
      }
    }

    // 1. Bulk insert student badges (single batch query instead of N*M individual queries)
    if (badgeValues.length > 0) {
      await pool.query('INSERT IGNORE INTO student_badges (student_id, badge_id, awarded_by) VALUES ?', [badgeValues]);
    }

    // 2. Bulk insert activity log entries (single batch query instead of N*M queries)
    if (activityValues.length > 0) {
      await pool.query('INSERT INTO activity_log (student_id, description) VALUES ?', [activityValues]);
    }

    // 3. Bulk fetch linked parents for all awarded students in a single query
    const [parentLinkRows] = await pool.query(
      'SELECT student_id, parent_id FROM parent_student_links WHERE student_id IN (?)',
      [cleanStudentIds]
    );

    // 4. Bulk insert in-app notifications for both students and parents in one batch query
    const notificationValues = [];
    for (const sId of cleanStudentIds) {
      notificationValues.push([
        sId,
        'badge_awarded',
        `🎉 Badge Unlocked: ${badgeNames}`,
        `Congratulations! Teacher ${teacherName} awarded you the "${badgeNames}" badge(s). Keep up the great work!`,
        sId,
      ]);
    }

    const seenParentStudentPairs = new Set();
    for (const link of parentLinkRows) {
      const key = `${link.parent_id}-${link.student_id}`;
      if (!seenParentStudentPairs.has(key)) {
        seenParentStudentPairs.add(key);
        notificationValues.push([
          link.parent_id,
          'badge_awarded',
          'Student Achievement: New Badge Awarded',
          `Your child has been awarded the "${badgeNames}" badge(s) by Teacher ${teacherName}!`,
          link.student_id,
        ]);
      }
    }

    if (notificationValues.length > 0) {
      await pool.query(
        'INSERT INTO notifications (recipient_id, type, title, message, related_student_id) VALUES ?',
        [notificationValues]
      );
    }

    // 5. Asynchronously dispatch celebratory emails in background without blocking the HTTP response
    setImmediate(async () => {
      for (const sId of cleanStudentIds) {
        try {
          await sendBadgeAwardedEmail({
            studentId: sId,
            teacherName,
            badges: catalogRows,
          });
        } catch (e) {
          console.error(`Background badge email error for student ${sId}:`, e.message);
        }
      }
    });
    const countLabel = cleanStudentIds.length === 1 ? '1 student' : `${cleanStudentIds.length} students`;
    return res.json({
      success: true,
      message: `Awarded "${badgeNames}" badge(s) to ${countLabel}.`,
    });
  } catch (err) {
    console.error('awardBadges error:', err);
    return res.status(500).json({ success: false, message: 'Could not award badges.' });
  }
}

/** GET /api/badges/student/:studentId — a student's earned badges + recent activity */
async function getStudentBadges(req, res) {
  try {
    if (String(req.user.id) !== String(req.params.studentId)) {
      const gate = await canViewStudent(req.user, req.params.studentId);
      if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const [badges] = await pool.query(
      `SELECT sb.badge_id, sb.earned_at, bc.name, bc.icon, bc.symbol, bc.bg, bc.color, bc.points,
              CONCAT(u.first_name, ' ', u.last_name) AS awarded_by_name
       FROM student_badges sb 
       JOIN badge_catalog bc ON bc.id = sb.badge_id
       LEFT JOIN users u ON u.id = sb.awarded_by
       WHERE sb.student_id = ? ORDER BY sb.earned_at DESC`,
      [req.params.studentId]
    );
    const [activity] = await pool.query(
      `SELECT description, created_at FROM activity_log 
       WHERE student_id = ? 
         AND (description LIKE '%badge%' OR description LIKE 'Awarded %' OR description LIKE '%re-initialized%')
       ORDER BY created_at DESC LIMIT 100`,
      [req.params.studentId]
    );
    return res.json({ success: true, badges, activity });
  } catch (err) {
    console.error('getStudentBadges error:', err);
    return res.status(500).json({ success: false, message: 'Could not load badges.' });
  }
}

/**
 * GET /api/badges/leaderboard?scope=section|school&sectionId=&limit=
 * Ranks students by total badge points. Students/parents default to their
 * own section; teachers/admins can pass sectionId or scope=school for the
 * whole campus.
 */
async function getLeaderboard(req, res) {
  try {
    let sectionId = req.query.sectionId || null;
    let scope = req.query.scope === 'school' ? 'school' : 'section';
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const { term, school_year, sy } = req.query;
    const requestedSy = school_year || sy;

    // Students and parents are permanently locked to their specific section cohort
    if (req.user.role === 'student') {
      scope = 'section';
      const [rows] = await pool.query('SELECT section_id FROM users WHERE id = ?', [req.user.id]);
      sectionId = rows[0]?.section_id || null;
    }
    if (req.user.role === 'parent') {
      scope = 'section';
      if (!sectionId) {
        const [rows] = await pool.query(
          `SELECT u.section_id FROM parent_student_links l JOIN users u ON u.id = l.student_id
           WHERE l.parent_id = ? LIMIT 1`,
          [req.user.id]
        );
        sectionId = rows[0]?.section_id || null;
      }
    }
    if (req.user.role === 'teacher' && sectionId) {
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this section.' });
      }
    }

    const conditions = ["u.role = 'student'"];
    const params = [];
    if (scope === 'section') {
      if (!sectionId) {
        return res.json({ success: true, leaderboard: [] });
      }
      conditions.push('u.section_id = ?');
      params.push(sectionId);
    }

    let dateFilterSql = '';
    const dateParams = [];

    let syStartYear = null;
    let syEndYear = null;
    if (requestedSy && requestedSy !== 'all') {
      const match = String(requestedSy).match(/(\d{4})\s*[-–—]\s*(\d{4})/);
      if (match) {
        syStartYear = parseInt(match[1], 10);
        syEndYear = parseInt(match[2], 10);
      }
    }

    if (syStartYear && syEndYear) {
      if (term === 'term1' || term === '1st Term') {
        dateFilterSql = ' AND sb.earned_at >= ? AND sb.earned_at <= ?';
        dateParams.push(`${syStartYear}-06-08 00:00:00`, `${syStartYear}-09-15 23:59:59`);
      } else if (term === 'term2' || term === '2nd Term') {
        dateFilterSql = ' AND sb.earned_at >= ? AND sb.earned_at <= ?';
        dateParams.push(`${syStartYear}-09-16 00:00:00`, `${syStartYear}-11-30 23:59:59`);
      } else if (term === 'term3' || term === '3rd Term') {
        dateFilterSql = ' AND sb.earned_at >= ? AND sb.earned_at <= ?';
        dateParams.push(`${syEndYear}-01-04 00:00:00`, `${syEndYear}-04-08 23:59:59`);
      } else if (requestedSy !== 'all') {
        dateFilterSql = ' AND sb.earned_at >= ? AND sb.earned_at <= ?';
        dateParams.push(`${syStartYear}-06-01 00:00:00`, `${syEndYear}-04-30 23:59:59`);
      }
    } else {
      if (term === 'term1' || term === '1st Term') {
        dateFilterSql = ' AND ((MONTH(sb.earned_at) IN (6,7,8)) OR (MONTH(sb.earned_at) = 9 AND DAY(sb.earned_at) <= 15))';
      } else if (term === 'term2' || term === '2nd Term') {
        dateFilterSql = ' AND ((MONTH(sb.earned_at) = 9 AND DAY(sb.earned_at) >= 16) OR MONTH(sb.earned_at) IN (10, 11, 12))';
      } else if (term === 'term3' || term === '3rd Term') {
        dateFilterSql = ' AND ((MONTH(sb.earned_at) IN (1, 2, 3)) OR (MONTH(sb.earned_at) = 4 AND DAY(sb.earned_at) <= 8))';
      }
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.profile_picture_url,
              sec.name AS sectionName, st.code AS strandCode, sec.grade_level,
              COALESCE(SUM(bc.points), 0) AS totalPoints,
              COUNT(sb.badge_id) AS badgeCount,
              GROUP_CONCAT(CASE WHEN bc.id IS NOT NULL THEN CONCAT_WS('::', bc.id, bc.name, COALESCE(bc.icon, ''), COALESCE(bc.symbol, '')) END SEPARATOR ';;') AS badges_str
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN student_badges sb ON sb.student_id = u.id ${dateFilterSql}
       LEFT JOIN badge_catalog bc ON bc.id = sb.badge_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.profile_picture_url, sec.name, st.code, sec.grade_level
       ORDER BY totalPoints DESC, badgeCount DESC, u.last_name ASC
       LIMIT ?`,
      [...dateParams, ...params, limit]
    );

    const leaderboard = rows.map((r, i) => {
      const badges = (r.badges_str && Number(r.badgeCount) > 0)
        ? r.badges_str.split(';;').map(str => {
            const [id, name, icon, symbol] = str.split('::');
            return { id, name, icon, symbol };
          }).filter(b => b.id && b.id.trim() !== '')
        : [];

      return {
        rank: i + 1,
        id: r.id,
        idNumber: r.id_number,
        name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
        profilePictureUrl: r.profile_picture_url || null,
        section: r.sectionName ? `Grade ${r.grade_level} - ${r.strandCode} (${r.sectionName})` : null,
        points: Number(r.totalPoints),
        badgeCount: r.badgeCount,
        badges
      };
    });

    return res.json({ success: true, leaderboard, scope, sectionId, term: term || 'all', schoolYear: requestedSy || 'all' });
  } catch (err) {
    console.error('getLeaderboard error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the leaderboard.' });
  }
}

/** POST /api/badges/reset — { scope: 'selected' | 'section', studentId, sectionId } */
async function resetBadges(req, res) {
  const { scope, studentId, sectionId } = req.body;
  try {
    if (scope === 'selected' && studentId) {
      await pool.query('DELETE FROM student_badges WHERE student_id = ?', [studentId]);
      await pool.query('INSERT INTO activity_log (student_id, description) VALUES (?, ?)', [
        studentId,
        'Badges re-initialized for the new grading period',
      ]);
      return res.json({ success: true, message: 'Student badges have been reset for the new term.' });
    } else if (scope === 'section' && sectionId) {
      await pool.query(
        `DELETE sb FROM student_badges sb
         JOIN users u ON u.id = sb.student_id
         WHERE u.section_id = ?`,
        [sectionId]
      );
      return res.json({ success: true, message: 'Section badges have been reset for the new term.' });
    }
    return res.status(400).json({ success: false, message: 'Invalid reset parameters.' });
  } catch (err) {
    console.error('resetBadges error:', err);
    return res.status(500).json({ success: false, message: 'Could not reset badges.' });
  }
}

/**
 * GET /api/badges/recent?sectionId=&limit=
 * Returns recent badge activity awarded to students across the class or by the teacher.
 */
async function getRecentBadgeActivity(req, res) {
  try {
    const { sectionId, term, school_year, sy } = req.query;
    const requestedSy = school_year || sy;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);

    let whereClause = '';
    const params = [];

    if (req.user.role === 'teacher') {
      if (sectionId && sectionId !== 'all') {
        whereClause = `WHERE s.section_id = ? AND (sb.awarded_by = ? OR s.section_id IN (
          SELECT section_id FROM schedules WHERE teacher_id = ?
          UNION
          SELECT id AS section_id FROM sections WHERE adviser_id = ? OR co_adviser_id = ?
        ))`;
        params.push(sectionId, req.user.id, req.user.id, req.user.id, req.user.id);
      } else {
        whereClause = `WHERE (sb.awarded_by = ? OR s.section_id IN (
          SELECT section_id FROM schedules WHERE teacher_id = ?
          UNION
          SELECT id AS section_id FROM sections WHERE adviser_id = ? OR co_adviser_id = ?
        ))`;
        params.push(req.user.id, req.user.id, req.user.id, req.user.id);
      }
    } else if (req.user.role === 'admin') {
      if (sectionId && sectionId !== 'all') {
        whereClause = 'WHERE s.section_id = ?';
        params.push(sectionId);
      }
    } else if (req.user.role === 'student') {
      whereClause = 'WHERE sb.student_id = ?';
      params.push(req.user.id);
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    let dateFilterSql = '';
    const dateParams = [];

    let syStartYear = null;
    let syEndYear = null;
    if (requestedSy && requestedSy !== 'all') {
      const match = String(requestedSy).match(/(\d{4})\s*[-–—]\s*(\d{4})/);
      if (match) {
        syStartYear = parseInt(match[1], 10);
        syEndYear = parseInt(match[2], 10);
      }
    }

    if (syStartYear && syEndYear) {
      if (term === 'term1' || term === '1st Term') {
        dateFilterSql = ' AND sb.earned_at >= ? AND sb.earned_at <= ?';
        dateParams.push(`${syStartYear}-06-08 00:00:00`, `${syStartYear}-09-15 23:59:59`);
      } else if (term === 'term2' || term === '2nd Term') {
        dateFilterSql = ' AND sb.earned_at >= ? AND sb.earned_at <= ?';
        dateParams.push(`${syStartYear}-09-16 00:00:00`, `${syStartYear}-11-30 23:59:59`);
      } else if (term === 'term3' || term === '3rd Term') {
        dateFilterSql = ' AND sb.earned_at >= ? AND sb.earned_at <= ?';
        dateParams.push(`${syEndYear}-01-04 00:00:00`, `${syEndYear}-04-08 23:59:59`);
      } else {
        dateFilterSql = ' AND sb.earned_at >= ? AND sb.earned_at <= ?';
        dateParams.push(`${syStartYear}-06-01 00:00:00`, `${syEndYear}-04-30 23:59:59`);
      }
    } else {
      if (term === 'term1' || term === '1st Term') {
        dateFilterSql = ' AND ((MONTH(sb.earned_at) IN (6,7,8)) OR (MONTH(sb.earned_at) = 9 AND DAY(sb.earned_at) <= 15))';
      } else if (term === 'term2' || term === '2nd Term') {
        dateFilterSql = ' AND ((MONTH(sb.earned_at) = 9 AND DAY(sb.earned_at) >= 16) OR MONTH(sb.earned_at) IN (10, 11, 12))';
      } else if (term === 'term3' || term === '3rd Term') {
        dateFilterSql = ' AND ((MONTH(sb.earned_at) IN (1, 2, 3)) OR (MONTH(sb.earned_at) = 4 AND DAY(sb.earned_at) <= 8))';
      }
    }

    if (whereClause) {
      whereClause += dateFilterSql;
    } else if (dateFilterSql) {
      whereClause = 'WHERE ' + dateFilterSql.replace(/^\s*AND\s+/i, '');
    }

    params.push(...dateParams, limit);

    const [rows] = await pool.query(
      `SELECT sb.id, sb.student_id, sb.badge_id, sb.earned_at,
              CONCAT(s.first_name, ' ', s.last_name) AS student_name,
              s.id_number AS student_id_number,
              s.profile_picture_url AS student_avatar,
              sec.name AS section_name,
              bc.name AS badge_name,
              bc.icon,
              bc.symbol,
              bc.bg,
              bc.color,
              bc.points,
              CONCAT(u.first_name, ' ', u.last_name) AS awarded_by_name
       FROM student_badges sb
       JOIN users s ON s.id = sb.student_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       JOIN badge_catalog bc ON bc.id = sb.badge_id
       LEFT JOIN users u ON u.id = sb.awarded_by
       ${whereClause}
       ORDER BY sb.earned_at DESC
       LIMIT ?`,
      params
    );

    return res.json({ success: true, activity: rows });
  } catch (err) {
    console.error('getRecentBadgeActivity error:', err);
    return res.status(500).json({ success: false, message: 'Could not load recent badge activity.' });
  }
}

module.exports = { getCatalog, awardBadges, getStudentBadges, getLeaderboard, resetBadges, getRecentBadgeActivity };


