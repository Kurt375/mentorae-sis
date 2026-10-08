const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/db');
const ExcelJS = require('exceljs');
const { teacherTeachesSection } = require('../utils/authz');
const { notify, notifyMany } = require('../utils/notifications');
const { convertOfficeToPdf } = require('../utils/documentConverter');

function fullName(user) {
  if (!user) return 'User';
  const mi = user.middle_initial ? ` ${user.middle_initial}` : '';
  return `${user.first_name || ''}${mi} ${user.last_name || ''}`.trim() || user.username || 'User';
}

function getMimeType(fileName = '', fallback = 'application/octet-stream') {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const map = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    json: 'application/json'
  };
  return map[ext] || fallback;
}

function sendFileBuffer(req, res, buffer, fileName, mimeType) {
  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;

    if (start >= buffer.length || end >= buffer.length || start > end) {
      res.setHeader('Content-Range', `bytes */${buffer.length}`);
      return res.status(416).send('Requested range not satisfiable');
    }

    const chunksize = (end - start) + 1;
    const chunk = buffer.subarray(start, end + 1);

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`
    });
    return res.end(chunk);
  } else {
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"` );
    return res.send(buffer);
  }
}

/* ============================= TOPICS ============================= */

let contentTablesChecked = false;
async function ensureContentTables() {
  if (contentTablesChecked) return;
  try {
    // 1. Ensure topics table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        description VARCHAR(1000) NULL,
        created_by INT NOT NULL,
        status ENUM('approved','pending_review','rejected') NOT NULL DEFAULT 'approved',
        content_payload LONGTEXT NULL,
        is_recommendation TINYINT(1) NOT NULL DEFAULT 0,
        comment VARCHAR(500) NULL,
        color VARCHAR(50) NULL DEFAULT 'bg-card-purple',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    try {
      const [topicCols] = await pool.query('SHOW COLUMNS FROM topics');
      const names = topicCols.map(c => c.Field.toLowerCase());
      if (!names.includes('content_payload')) await pool.query('ALTER TABLE topics ADD COLUMN content_payload LONGTEXT NULL');
      if (!names.includes('is_recommendation')) await pool.query('ALTER TABLE topics ADD COLUMN is_recommendation TINYINT(1) NOT NULL DEFAULT 0');
      if (!names.includes('comment')) await pool.query('ALTER TABLE topics ADD COLUMN comment VARCHAR(500) NULL');
      if (!names.includes('color')) await pool.query("ALTER TABLE topics ADD COLUMN color VARCHAR(50) NULL DEFAULT 'bg-card-purple'");
    } catch (e) {}

    // 2. Ensure topic_requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS topic_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_id INT NOT NULL,
        teacher_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        description VARCHAR(1000) NULL,
        content_payload LONGTEXT NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        reviewed_by INT NULL,
        reviewed_at TIMESTAMP NULL,
        topic_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
      )
    `);

    try {
      const [trCols] = await pool.query('SHOW COLUMNS FROM topic_requests');
      const trNames = trCols.map(c => c.Field.toLowerCase());
      if (!trNames.includes('content_payload')) await pool.query('ALTER TABLE topic_requests ADD COLUMN content_payload LONGTEXT NULL');
    } catch (e) {}

    // 3. Ensure topic_quiz_attempts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS topic_quiz_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        topic_id INT NULL,
        topic_title VARCHAR(255) NOT NULL,
        subject_name VARCHAR(255) NOT NULL,
        section_name VARCHAR(100) NULL,
        score INT NOT NULL,
        total_questions INT NOT NULL,
        percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        answers_json LONGTEXT NULL,
        is_preview TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_topic (user_id, topic_title),
        INDEX idx_subject_topic_section (subject_name, topic_title, section_name),
        INDEX idx_is_preview (is_preview),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
      )
    `);

    contentTablesChecked = true;
  } catch (err) {
    console.warn('ensureContentTables notice:', err.message);
  }
}

/** GET /api/content/topics?subjectId=&subjectName= */
async function listTopics(req, res) {
  await ensureContentTables();
  const { subjectId, subjectName } = req.query;
  try {
    let whereClause = "WHERE t.status = 'approved'";
    const params = [];

    if (subjectId) {
      whereClause += ' AND t.subject_id = ?';
      params.push(subjectId);
    } else if (subjectName) {
      whereClause += ' AND s.name = ?';
      params.push(subjectName);
    }

    const [rows] = await pool.query(
      `SELECT t.*, s.name AS subject_name, u.first_name, u.last_name
       FROM topics t
       JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN users u ON u.id = t.created_by
       ${whereClause}
       ORDER BY t.created_at DESC`,
      params
    );

    const isSpecificSubject = Boolean(subjectId || subjectName);
    const formatted = rows.map(r => {
      let payload = {};
      if (r.content_payload) {
        try {
          payload = typeof r.content_payload === 'string' ? JSON.parse(r.content_payload) : r.content_payload;
        } catch (e) { }
      }
      return {
        id: r.id,
        subjectId: r.subject_id,
        subjectName: r.subject_name,
        title: r.title,
        description: r.description,
        isRecommendation: !!r.is_recommendation,
        comment: r.comment || '',
        color: r.color || 'bg-card-purple',
        createdBy: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Teacher',
        createdAt: r.created_at,
        resources: payload.resources || [],
        visibleTo: payload.visibleTo || [],
        files: (payload.files || []).map((f, fIdx) => ({
          name: f.name,
          type: f.type || getMimeType(f.name),
          size: f.size,
          topicId: r.id,
          fileIndex: fIdx,
          url: `/api/content/topics/${r.id}/files/${fIdx}/download`,
          dataUrl: (f.dataUrl && f.dataUrl.length < 100000) ? f.dataUrl : undefined,
          pdfDataUrl: (f.pdfDataUrl && f.pdfDataUrl.length < 100000) ? f.pdfDataUrl : undefined
        })),
        quiz: isSpecificSubject ? (payload.quiz || []) : [],
        flashcards: isSpecificSubject ? (payload.flashcards || []) : []
      };
    });

    return res.json({
      success: true,
      topics: formatted.filter(t => !t.isRecommendation),
      recommendations: formatted.filter(t => t.isRecommendation)
    });
  } catch (err) {
    console.error('listTopics error:', err);
    return res.status(500).json({ success: false, message: 'Could not load topics.' });
  }
}

/** POST /api/content/topics  { subjectId, subjectName, title, description, contentPayload, isRecommendation, comment, color } */
async function createTopic(req, res) {
  let { subjectId, subjectName, title, description, contentPayload, isRecommendation, comment, color } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, message: 'Topic title is required.' });
  }

  try {
    if (!subjectId && subjectName) {
      const [subjRows] = await pool.query('SELECT id FROM subjects WHERE name = ? LIMIT 1', [subjectName]);
      if (subjRows.length) subjectId = subjRows[0].id;
    }
    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'Valid subject is required.' });
    }

    // Auto-convert any attached PPTX/DOCX files to PDF so students and teachers get instant Google Classroom view
    if (contentPayload && Array.isArray(contentPayload.files)) {
      for (const file of contentPayload.files) {
        if (!file.pdfDataUrl && file.dataUrl) {
          const ext = (file.name || '').split('.').pop().toLowerCase();
          if (['pptx', 'ppt', 'docx', 'doc'].includes(ext)) {
            try {
              const conv = await convertOfficeToPdf(file.dataUrl, file.name);
              if (conv.success && conv.pdfDataUrl) {
                file.pdfDataUrl = conv.pdfDataUrl;
              }
            } catch (e) {
              console.warn('Document pre-conversion notice:', e.message);
            }
          }
        }
      }
    }

    const payloadStr = contentPayload ? JSON.stringify(contentPayload) : null;
    const isRec = isRecommendation ? 1 : 0;

    // Non-admin can only create recommendations directly
    if (req.user.role !== 'admin' && !isRec) {
      return res.status(403).json({ success: false, message: 'Teachers must submit main topics as requests for admin approval.' });
    }

    const [existingTopic] = await pool.query(
      'SELECT id FROM topics WHERE subject_id = ? AND title = ? AND is_recommendation = ? LIMIT 1',
      [subjectId, title.trim(), isRec]
    );

    let topicId;
    if (existingTopic.length > 0) {
      topicId = existingTopic[0].id;
      await pool.query(
        'UPDATE topics SET description = ?, content_payload = ?, color = ?, comment = COALESCE(?, comment) WHERE id = ?',
        [description || null, payloadStr, color || 'bg-card-purple', comment || null, topicId]
      );
    } else {
      const [result] = await pool.query(
        'INSERT INTO topics (subject_id, title, description, created_by, status, content_payload, is_recommendation, comment, color) VALUES (?, ?, ?, ?, \'approved\', ?, ?, ?, ?)',
        [subjectId, title.trim(), description || null, req.user.id, payloadStr, isRec, comment || null, color || 'bg-card-purple']
      );
      topicId = result.insertId;
    }
    return res.json({ success: true, topicId, message: isRec ? 'Recommendation saved successfully.' : 'Topic saved successfully.' });
  } catch (err) {
    console.error('createTopic error:', err);
    return res.status(500).json({ success: false, message: 'Could not create topic.' });
  }
}

/** DELETE /api/content/topics/:id */
async function deleteTopic(req, res) {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM topics WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Topic deleted successfully.' });
  } catch (err) {
    console.error('deleteTopic error:', err);
    return res.status(500).json({ success: false, message: 'Could not delete topic.' });
  }
}

/** GET /api/content/topics/:topicId/files/:fileIndex/download */
async function downloadTopicFile(req, res) {
  const { topicId, fileIndex } = req.params;
  const { asPdf, name } = req.query;

  try {
    await ensureContentTables();
    let [rows] = await pool.query(
      'SELECT id, title, content_payload FROM topics WHERE id = ?',
      [topicId]
    );

    let topic = rows[0];
    if (!topic) {
      const [reqRows] = await pool.query(
        'SELECT id, title, content_payload FROM topic_requests WHERE id = ?',
        [topicId]
      );
      topic = reqRows[0];
    }

    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found.' });
    }

    let payload = {};
    if (topic.content_payload) {
      try {
        payload = typeof topic.content_payload === 'string' ? JSON.parse(topic.content_payload) : topic.content_payload;
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Invalid topic content structure.' });
      }
    }

    const files = payload.files || [];
    let file = null;

    const numericIdx = parseInt(fileIndex, 10);
    if (!isNaN(numericIdx) && files[numericIdx]) {
      file = files[numericIdx];
    } else if (fileIndex) {
      file = files.find(f => f.name === fileIndex || f.name === decodeURIComponent(fileIndex));
    }
    if (!file && name) {
      file = files.find(f => f.name === name || f.name === decodeURIComponent(name));
    }

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found in topic.' });
    }

    let rawUrl = (asPdf === 'true' && file.pdfDataUrl) ? file.pdfDataUrl : (file.dataUrl || file.pdfDataUrl || file.url || file.filePath || file.file_path || '');
    let fileName = file.name || 'document';
    if (asPdf === 'true' && !fileName.toLowerCase().endsWith('.pdf')) {
      fileName = fileName.replace(/\.[^.]+$/, '') + '.pdf';
    }

    if (!rawUrl) {
      return res.status(404).json({ success: false, message: 'File data is empty.' });
    }

    // Base64 Data URL
    if (rawUrl.startsWith('data:')) {
      const commaIdx = rawUrl.indexOf(',');
      if (commaIdx === -1) {
        return res.status(500).json({ success: false, message: 'Malformed data URL.' });
      }
      const header = rawUrl.substring(0, commaIdx);
      const base64Data = rawUrl.substring(commaIdx + 1);
      const mimeMatch = header.match(/^data:([^;]+)/);
      const mimeType = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : getMimeType(fileName, file.type);
      const buffer = Buffer.from(base64Data, 'base64');
      return sendFileBuffer(req, res, buffer, fileName, mimeType);
    }

    // Relative file path on server
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      const absPath = path.isAbsolute(rawUrl) ? rawUrl : path.join(__dirname, '..', rawUrl);
      if (fs.existsSync(absPath)) {
        return res.download(absPath, fileName);
      }
    }

    return res.redirect(rawUrl);
  } catch (err) {
    console.error('downloadTopicFile error:', err);
    return res.status(500).json({ success: false, message: 'Error streaming file.' });
  }
}

/** GET /api/content/topics/file-by-name?subjectName=&topicTitle=&fileName= */
async function downloadTopicFileByName(req, res) {
  const { subjectName, topicTitle, fileName } = req.query;
  if (!subjectName || !fileName) {
    return res.status(400).json({ success: false, message: 'subjectName and fileName are required.' });
  }

  try {
    await ensureContentTables();
    let query = `
      SELECT t.id, t.title, t.content_payload
      FROM topics t
      JOIN subjects s ON s.id = t.subject_id
      WHERE s.name = ?
    `;
    const params = [subjectName];
    if (topicTitle) {
      query += ' AND t.title = ?';
      params.push(topicTitle);
    }
    query += ' ORDER BY t.created_at DESC';

    const [rows] = await pool.query(query, params);
    for (const r of rows) {
      if (!r.content_payload) continue;
      let payload = {};
      try {
        payload = typeof r.content_payload === 'string' ? JSON.parse(r.content_payload) : r.content_payload;
      } catch (e) { continue; }

      const files = payload.files || [];
      const matchIdx = files.findIndex(f => f.name === fileName || decodeURIComponent(f.name) === decodeURIComponent(fileName));
      if (matchIdx !== -1) {
        req.params = { topicId: r.id, fileIndex: matchIdx };
        return downloadTopicFile(req, res);
      }
    }

    return res.status(404).json({ success: false, message: 'File not found in matching topics.' });
  } catch (err) {
    console.error('downloadTopicFileByName error:', err);
    return res.status(500).json({ success: false, message: 'Error retrieving file.' });
  }
}

/* ========================= TOPIC REQUESTS ========================= */

/** POST /api/content/topic-requests  { subjectId, subjectName, title, description, contentPayload } */
async function createTopicRequest(req, res) {
  let { subjectId, subjectName, title, description, contentPayload } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, message: 'Topic title is required.' });
  }

  try {
    await ensureContentTables();
    if (!subjectId && subjectName) {
      const [subjRows] = await pool.query('SELECT id FROM subjects WHERE name = ? LIMIT 1', [subjectName]);
      if (subjRows.length) subjectId = subjRows[0].id;
    }
    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'Valid subject is required.' });
    }

    // Auto-convert any attached PPTX/DOCX files to PDF so students and teachers get instant Google Classroom view
    if (contentPayload && Array.isArray(contentPayload.files)) {
      for (const file of contentPayload.files) {
        if (!file.pdfDataUrl && file.dataUrl) {
          const ext = (file.name || '').split('.').pop().toLowerCase();
          if (['pptx', 'ppt', 'docx', 'doc'].includes(ext)) {
            try {
              const conv = await convertOfficeToPdf(file.dataUrl, file.name);
              if (conv.success && conv.pdfDataUrl) {
                file.pdfDataUrl = conv.pdfDataUrl;
              }
            } catch (e) {
              console.warn('Document pre-conversion notice:', e.message);
            }
          }
        }
      }
    }

    const payloadStr = contentPayload ? JSON.stringify(contentPayload) : null;
    const [result] = await pool.query(
      'INSERT INTO topic_requests (subject_id, teacher_id, title, description, content_payload, status) VALUES (?, ?, ?, ?, ?, \'pending\')',
      [subjectId, req.user.id, title, description || null, payloadStr]
    );

    // Notify all active admins
    const [adminRows] = await pool.query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1");
    const adminIds = adminRows.map(a => a.id);
    await notifyMany(adminIds, {
      type: 'topic_request',
      title: 'New Topic Request',
      message: `Teacher ${fullName(req.user)} requested to add topic "${title}" in ${subjectName || 'Subject'}.`
    });

    return res.json({ success: true, requestId: result.insertId, message: 'Topic request submitted for admin review.' });
  } catch (err) {
    console.error('createTopicRequest error:', err);
    return res.status(500).json({ success: false, message: 'Could not submit topic request.' });
  }
}

/** GET /api/content/topic-requests?status=pending */
async function listTopicRequests(req, res) {
  const { status } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT tr.*, u.first_name, u.last_name, s.name AS subject_name
       FROM topic_requests tr
       JOIN users u ON u.id = tr.teacher_id
       JOIN subjects s ON s.id = tr.subject_id
       ${status ? 'WHERE tr.status = ?' : ''}
       ORDER BY tr.created_at DESC`,
      status ? [status] : []
    );

    const formatted = rows.map(r => {
      let payload = {};
      if (r.content_payload) {
        try {
          payload = typeof r.content_payload === 'string' ? JSON.parse(r.content_payload) : r.content_payload;
        } catch (e) { }
      }
      return {
        id: r.id,
        subjectId: r.subject_id,
        subjectName: r.subject_name,
        teacherId: r.teacher_id,
        requester: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Teacher',
        title: r.title,
        description: r.description,
        status: r.status,
        requestedAt: r.created_at,
        topicData: {
          title: r.title,
          description: r.description,
          resources: payload.resources || [],
          visibleTo: payload.visibleTo || [],
          files: (payload.files || []).map((f, fIdx) => ({
            name: f.name,
            type: f.type || getMimeType(f.name),
            size: f.size,
            topicId: r.id,
            fileIndex: fIdx,
            url: `/api/content/topics/${r.id}/files/${fIdx}/download`,
            dataUrl: (f.dataUrl && f.dataUrl.length < 100000) ? f.dataUrl : undefined,
            pdfDataUrl: (f.pdfDataUrl && f.pdfDataUrl.length < 100000) ? f.pdfDataUrl : undefined
          })),
          quiz: payload.quiz || [],
          flashcards: payload.flashcards || [],
          createdAt: r.created_at,
          createdBy: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Teacher'
        }
      };
    });

    return res.json({ success: true, requests: formatted });
  } catch (err) {
    console.error('listTopicRequests error:', err);
    return res.status(500).json({ success: false, message: 'Could not load topic requests.' });
  }
}

/** POST /api/content/topic-requests/:id/review  { approve: true|false, reason?: string } */
async function reviewTopicRequest(req, res) {
  const { id } = req.params;
  const { approve, reason } = req.body;
  try {
    const [reqRows] = await pool.query(
      `SELECT tr.*, s.name AS subject_name 
       FROM topic_requests tr 
       LEFT JOIN subjects s ON s.id = tr.subject_id 
       WHERE tr.id = ?`,
      [id]
    );
    const request = reqRows[0];
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This request was already reviewed.' });
    }

    if (approve) {
      const [topicResult] = await pool.query(
        'INSERT INTO topics (subject_id, title, description, created_by, status, content_payload, is_recommendation) VALUES (?, ?, ?, ?, \'approved\', ?, 0)',
        [request.subject_id, request.title, request.description, request.teacher_id, request.content_payload]
      );
      await pool.query(
        'UPDATE topic_requests SET status = \'approved\', reviewed_by = ?, reviewed_at = NOW(), topic_id = ? WHERE id = ?',
        [req.user.id, topicResult.insertId, id]
      );

      // Notify the requesting teacher
      await notify({
        recipientId: request.teacher_id,
        type: 'topic_approved',
        title: 'Topic Request Approved',
        message: `Great news! Your request to add main topic "${request.title}" to ${request.subject_name || 'your subject'} has been approved by the school administrator.`
      });

      return res.json({ success: true, topicId: topicResult.insertId, message: 'Topic request approved.' });
    } else {
      await pool.query(
        'UPDATE topic_requests SET status = \'rejected\', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
        [req.user.id, id]
      );

      // Notify the requesting teacher
      const rejectionMsg = reason && reason.trim()
        ? `Your request to add topic "${request.title}" to ${request.subject_name || 'your subject'} was not approved. Feedback: "${reason.trim()}"`
        : `Your request to add topic "${request.title}" to ${request.subject_name || 'your subject'} was not approved by the administrator.`;

      await notify({
        recipientId: request.teacher_id,
        type: 'topic_rejected',
        title: 'Topic Request Not Approved',
        message: rejectionMsg
      });

      return res.json({ success: true, message: 'Topic request marked as not approved and teacher notified.' });
    }
  } catch (err) {
    console.error('reviewTopicRequest error:', err);
    return res.status(500).json({ success: false, message: 'Could not review request.' });
  }
}

/* ============================ QUIZZES ============================= */

/** GET /api/content/quiz-sets?topicId= */
async function listQuizSets(req, res) {
  const { topicId } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT qs.*, (SELECT COUNT(*) FROM quiz_questions WHERE quiz_set_id = qs.id) AS question_count
       FROM quiz_sets qs ${topicId ? 'WHERE topic_id = ?' : ''} ORDER BY qs.created_at DESC`,
      topicId ? [topicId] : []
    );
    return res.json({ success: true, quizSets: rows });
  } catch (err) {
    console.error('listQuizSets error:', err);
    return res.status(500).json({ success: false, message: 'Could not load quiz sets.' });
  }
}

/** GET /api/content/quiz-sets/:id — full quiz with questions (correct_option omitted for students) */
async function getQuizSet(req, res) {
  const { id } = req.params;
  try {
    const [setRows] = await pool.query('SELECT * FROM quiz_sets WHERE id = ?', [id]);
    const quizSet = setRows[0];
    if (!quizSet) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    const includeAnswers = req.user.role === 'teacher' || req.user.role === 'admin';
    const cols = includeAnswers
      ? 'id, question_text, option_a, option_b, option_c, option_d, correct_option, order_index'
      : 'id, question_text, option_a, option_b, option_c, option_d, order_index';
    const [questions] = await pool.query(
      `SELECT ${cols} FROM quiz_questions WHERE quiz_set_id = ? ORDER BY order_index ASC, id ASC`,
      [id]
    );
    return res.json({ success: true, quizSet, questions });
  } catch (err) {
    console.error('getQuizSet error:', err);
    return res.status(500).json({ success: false, message: 'Could not load quiz.' });
  }
}

/** POST /api/content/quiz-sets  { topicId, title, questions: [{questionText, optionA, optionB, optionC, optionD, correctOption}] } */
async function createQuizSet(req, res) {
  const { topicId, title, questions } = req.body;
  if (!topicId || !title || !Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ success: false, message: 'topicId, title, and at least one question are required.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO quiz_sets (topic_id, title, created_by) VALUES (?, ?, ?)',
      [topicId, title, req.user.id]
    );
    const quizSetId = result.insertId;
    let order = 0;
    for (const q of questions) {
      await conn.query(
        `INSERT INTO quiz_questions
         (quiz_set_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [quizSetId, q.questionText, q.optionA, q.optionB, q.optionC || null, q.optionD || null, q.correctOption, order++]
      );
    }
    await conn.commit();
    return res.json({ success: true, quizSetId });
  } catch (err) {
    await conn.rollback();
    console.error('createQuizSet error:', err);
    return res.status(500).json({ success: false, message: 'Could not create quiz.' });
  } finally {
    conn.release();
  }
}

/** POST /api/content/quiz-sets/:id/attempts  { answers: [{questionId, selectedOption}] } — student submits attempt */
async function submitQuizAttempt(req, res) {
  const { id } = req.params;
  const { answers } = req.body;
  if (!Array.isArray(answers) || !answers.length) {
    return res.status(400).json({ success: false, message: 'At least one answer is required.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [questions] = await conn.query('SELECT id, correct_option FROM quiz_questions WHERE quiz_set_id = ?', [id]);
    const correctMap = {};
    questions.forEach((q) => { correctMap[q.id] = q.correct_option; });

    let score = 0;
    const [attemptResult] = await conn.query(
      'INSERT INTO quiz_attempts (quiz_set_id, student_id, score, total_questions, completed_at) VALUES (?, ?, 0, ?, NOW())',
      [id, req.user.id, questions.length]
    );
    const attemptId = attemptResult.insertId;

    for (const a of answers) {
      const isCorrect = correctMap[a.questionId] && correctMap[a.questionId] === a.selectedOption ? 1 : 0;
      if (isCorrect) score++;
      await conn.query(
        'INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_option, is_correct) VALUES (?, ?, ?, ?)',
        [attemptId, a.questionId, a.selectedOption || null, isCorrect]
      );
    }
    await conn.query('UPDATE quiz_attempts SET score = ? WHERE id = ?', [score, attemptId]);
    await conn.commit();
    return res.json({ success: true, attemptId, score, totalQuestions: questions.length });
  } catch (err) {
    await conn.rollback();
    console.error('submitQuizAttempt error:', err);
    return res.status(500).json({ success: false, message: 'Could not submit quiz attempt.' });
  } finally {
    conn.release();
  }
}

/** GET /api/content/quiz-sets/:id/attempts/mine — a student's own attempt history for this quiz */
async function getMyQuizAttempts(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM quiz_attempts WHERE quiz_set_id = ? AND student_id = ? ORDER BY completed_at DESC',
      [id, req.user.id]
    );
    return res.json({ success: true, attempts: rows });
  } catch (err) {
    console.error('getMyQuizAttempts error:', err);
    return res.status(500).json({ success: false, message: 'Could not load quiz attempts.' });
  }
}

/* =========================== FLASHCARDS ============================ */

/** GET /api/content/flashcard-sets?topicId= */
async function listFlashcardSets(req, res) {
  const { topicId } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT fs.*, (SELECT COUNT(*) FROM flashcards WHERE flashcard_set_id = fs.id) AS card_count
       FROM flashcard_sets fs ${topicId ? 'WHERE topic_id = ?' : ''} ORDER BY fs.created_at DESC`,
      topicId ? [topicId] : []
    );
    return res.json({ success: true, flashcardSets: rows });
  } catch (err) {
    console.error('listFlashcardSets error:', err);
    return res.status(500).json({ success: false, message: 'Could not load flashcard sets.' });
  }
}

/** GET /api/content/flashcard-sets/:id */
async function getFlashcardSet(req, res) {
  const { id } = req.params;
  try {
    const [setRows] = await pool.query('SELECT * FROM flashcard_sets WHERE id = ?', [id]);
    if (!setRows[0]) return res.status(404).json({ success: false, message: 'Flashcard set not found.' });
    const [cards] = await pool.query(
      'SELECT id, front_text, back_text, order_index FROM flashcards WHERE flashcard_set_id = ? ORDER BY order_index ASC, id ASC',
      [id]
    );
    return res.json({ success: true, flashcardSet: setRows[0], cards });
  } catch (err) {
    console.error('getFlashcardSet error:', err);
    return res.status(500).json({ success: false, message: 'Could not load flashcard set.' });
  }
}

/** POST /api/content/flashcard-sets  { topicId, title, cards: [{frontText, backText}] } */
async function createFlashcardSet(req, res) {
  const { topicId, title, cards } = req.body;
  if (!topicId || !title || !Array.isArray(cards) || !cards.length) {
    return res.status(400).json({ success: false, message: 'topicId, title, and at least one card are required.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO flashcard_sets (topic_id, title, created_by) VALUES (?, ?, ?)',
      [topicId, title, req.user.id]
    );
    const setId = result.insertId;
    let order = 0;
    for (const c of cards) {
      await conn.query(
        'INSERT INTO flashcards (flashcard_set_id, front_text, back_text, order_index) VALUES (?, ?, ?, ?)',
        [setId, c.frontText, c.backText, order++]
      );
    }
    await conn.commit();
    return res.json({ success: true, flashcardSetId: setId });
  } catch (err) {
    await conn.rollback();
    console.error('createFlashcardSet error:', err);
    return res.status(500).json({ success: false, message: 'Could not create flashcard set.' });
  } finally {
    conn.release();
  }
}

/** POST /api/content/flashcard-sets/:id/progress  { cardsReviewed } — student progress checkpoint */
async function saveFlashcardProgress(req, res) {
  const { id } = req.params;
  const { cardsReviewed } = req.body;
  try {
    await pool.query(
      `INSERT INTO flashcard_progress (flashcard_set_id, student_id, cards_reviewed)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE cards_reviewed = GREATEST(cards_reviewed, VALUES(cards_reviewed))`,
      [id, req.user.id, cardsReviewed || 0]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('saveFlashcardProgress error:', err);
    return res.status(500).json({ success: false, message: 'Could not save progress.' });
  }
}

/** POST /api/content/convert-document  { fileName, dataUrl } */
async function convertDocument(req, res) {
  const { fileName, dataUrl } = req.body;
  if (!fileName || !dataUrl) {
    return res.status(400).json({ success: false, message: 'File name and data URL are required.' });
  }

  try {
    const result = await convertOfficeToPdf(dataUrl, fileName);
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error || 'Document conversion failed.' });
    }
    return res.json({
      success: true,
      pdfDataUrl: result.pdfDataUrl,
      cached: result.cached,
      message: 'Document converted successfully.'
    });
  } catch (err) {
    console.error('convertDocument error:', err);
    return res.status(500).json({ success: false, message: 'Could not convert document.' });
  }
}

/**
 * POST /api/content/topics/:id/cache-file-pdf
 * Body: { fileName, pdfDataUrl }
 * Saves converted PDF Data URL into topic's content_payload.files for instant subsequent viewing.
 */
async function cacheTopicFilePdf(req, res) {
  const { id } = req.params;
  const { fileName, pdfDataUrl } = req.body;
  if (!id || !fileName || !pdfDataUrl) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }

  try {
    const [rows] = await pool.query('SELECT content_payload FROM topics WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    let payload = rows[0].content_payload;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) { payload = null; }
    }

    if (payload && Array.isArray(payload.files)) {
      let modified = false;
      payload.files.forEach(f => {
        if (f.name === fileName) {
          f.pdfDataUrl = pdfDataUrl;
          f.convertedToPdf = true;
          modified = true;
        }
      });

      if (modified) {
        await pool.query('UPDATE topics SET content_payload = ? WHERE id = ?', [JSON.stringify(payload), id]);
      }
    }

    return res.json({ success: true, message: 'PDF cached successfully.' });
  } catch (err) {
    console.error('cacheTopicFilePdf error:', err);
    return res.status(500).json({ success: false, message: 'Could not cache PDF.' });
  }
}

const PREVIEW_DIR = path.join(__dirname, '../uploads/temp_previews');
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

// Clean up previews older than 24 hours periodically
function cleanOldPreviews() {
  try {
    if (!fs.existsSync(PREVIEW_DIR)) return;
    const files = fs.readdirSync(PREVIEW_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(PREVIEW_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 24 * 3600 * 1000) {
        try { fs.unlinkSync(fp); } catch (e) {}
      }
    }
  } catch (e) {}
}
setInterval(cleanOldPreviews, 6 * 3600 * 1000);

/**
 * POST /api/content/public-preview-token
 * Body: { fileName, dataUrl }
 * Saves document into temporary public storage with an unguessable token
 * so Google Docs Viewer and Microsoft Office Online can fetch and render it.
 */
async function createPublicPreviewToken(req, res) {
  const { fileName, dataUrl } = req.body;
  if (!fileName || !dataUrl) {
    return res.status(400).json({ success: false, message: 'File name and data URL are required.' });
  }

  try {
    const token = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(fileName || '').toLowerCase();
    const safeBase = (path.basename(fileName, ext) || 'document').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const storedFileName = `${token}_${safeBase}${ext}`;
    const filePath = path.join(PREVIEW_DIR, storedFileName);

    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const fileBuffer = Buffer.from(b64, 'base64');
    fs.writeFileSync(filePath, fileBuffer);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const cleanFileName = `${safeBase}${ext}`;
    const publicUrl = `${baseUrl}/api/content/raw-preview/${token}/${cleanFileName}`;
    const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}&embedded=true`;
    const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;

    return res.json({
      success: true,
      token,
      publicUrl,
      googleViewerUrl,
      officeViewerUrl
    });
  } catch (err) {
    console.error('createPublicPreviewToken error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate preview token.' });
  }
}

/**
 * GET & HEAD /api/content/raw-preview/:token/:fileName
 * Public unauthenticated endpoint for Google Docs / Office Online crawlers
 */
async function serveRawPreview(req, res) {
  const { token, fileName } = req.params;
  if (!token || !/^[a-f0-9]{32}$/i.test(token)) {
    return res.status(400).send('Invalid preview token');
  }

  try {
    if (!fs.existsSync(PREVIEW_DIR)) {
      return res.status(404).send('Preview directory not found');
    }
    const files = fs.readdirSync(PREVIEW_DIR);
    const matching = files.find(f => f.startsWith(`${token}_`));
    if (!matching) {
      return res.status(404).send('Preview file not found or expired');
    }

    const filePath = path.join(PREVIEW_DIR, matching);
    const ext = path.extname(matching).toLowerCase();
    const stat = fs.statSync(filePath);

    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.txt': 'text/plain'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const safeDownloadName = fileName ? path.basename(fileName) : matching.replace(/^[a-f0-9]+_/, '');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName.replace(/"/g, '')}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error('serveRawPreview error:', err);
    return res.status(500).send('Could not serve preview file');
  }
}

/**
 * GET /api/content/templates/flashcards
 * Downloads styled starter Excel template for bulk flashcards creation
 */
async function downloadFlashcardsTemplate(req, res) {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mentorae SIS';
    wb.created = new Date();

    const ws = wb.addWorksheet('Flashcards', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }]
    });

    ws.columns = [
      { header: 'Term', key: 'term', width: 30 },
      { header: 'Definition', key: 'definition', width: 65 },
      { header: 'Example / Notes (Optional)', key: 'notes', width: 35 }
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
        right: { style: 'thin', color: { argb: 'FF15803D' } }
      };
    });

    const sampleCards = [
      {
        term: 'Photosynthesis',
        definition: 'The biological process by which green plants use sunlight to synthesize nutrients from carbon dioxide and water.',
        notes: 'Produces oxygen as a byproduct'
      },
      {
        term: 'Mitochondria',
        definition: 'Organelle known as the powerhouse of the cell, responsible for cellular respiration and ATP production.',
        notes: 'Contains its own circular DNA'
      },
      {
        term: "Newton's First Law",
        definition: 'An object at rest stays at rest, and an object in motion continues in motion with the same speed and direction unless acted upon by an external force.',
        notes: 'Also known as the Law of Inertia'
      },
      {
        term: 'Osmosis',
        definition: 'The spontaneous net movement of solvent molecules through a selectively permeable membrane into a region of higher solute concentration.',
        notes: 'Equalizes solute concentrations'
      }
    ];

    sampleCards.forEach(card => {
      const row = ws.addRow(card);
      row.height = 24;
      row.getCell(1).font = { name: 'Segoe UI', bold: true, color: { argb: 'FF111827' } };
      row.getCell(2).font = { name: 'Segoe UI', color: { argb: 'FF374151' } };
      row.getCell(3).font = { name: 'Segoe UI', italic: true, color: { argb: 'FF6B7280' } };
      row.alignment = { vertical: 'middle', wrapText: true };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mentorae_Flashcards_Template.xlsx"');

    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error('downloadFlashcardsTemplate error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate flashcards template.' });
  }
}

/**
 * GET /api/content/templates/quiz
 * Downloads styled starter Excel template for bulk practice quiz creation
 */
async function downloadQuizTemplate(req, res) {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mentorae SIS';
    wb.created = new Date();

    const ws = wb.addWorksheet('Practice Quiz', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }]
    });

    ws.columns = [
      { header: 'Question', key: 'question', width: 55 },
      { header: 'Option A', key: 'optionA', width: 25 },
      { header: 'Option B', key: 'optionB', width: 25 },
      { header: 'Option C', key: 'optionC', width: 25 },
      { header: 'Option D', key: 'optionD', width: 25 },
      { header: 'Correct Answer (A/B/C/D)', key: 'answer', width: 26 },
      { header: 'Explanation / Note (Optional)', key: 'explanation', width: 40 }
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
        right: { style: 'thin', color: { argb: 'FF15803D' } }
      };
    });

    const sampleQuestions = [
      {
        question: 'Which organelle is responsible for generating cellular energy in the form of ATP?',
        optionA: 'Ribosome',
        optionB: 'Mitochondria',
        optionC: 'Golgi Apparatus',
        optionD: 'Endoplasmic Reticulum',
        answer: 'B',
        explanation: 'Mitochondria are often referred to as the powerhouse of the cell.'
      },
      {
        question: 'What is the chemical formula for ordinary table salt?',
        optionA: 'NaCl',
        optionB: 'KCl',
        optionC: 'H2O',
        optionD: 'CO2',
        answer: 'A',
        explanation: 'Table salt consists of sodium (Na) and chlorine (Cl).'
      },
      {
        question: 'Which law of motion states that for every action, there is an equal and opposite reaction?',
        optionA: 'First Law of Motion',
        optionB: 'Second Law of Motion',
        optionC: 'Third Law of Motion',
        optionD: 'Law of Universal Gravitation',
        answer: 'C',
        explanation: "Newton's Third Law describes paired forces."
      }
    ];

    sampleQuestions.forEach(q => {
      const row = ws.addRow(q);
      row.height = 24;
      row.getCell(1).font = { name: 'Segoe UI', bold: true, color: { argb: 'FF111827' } };
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(6).font = { name: 'Segoe UI', bold: true, color: { argb: 'FF0A5C2C' } };
      row.alignment = { vertical: 'middle', wrapText: true };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mentorae_Practice_Quiz_Template.xlsx"');

    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error('downloadQuizTemplate error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate quiz template.' });
  }
}

/**
 * POST /api/content/topics/:id/append-content
 * Body: { flashcards: [...], quiz: [...] }
 * Allows teacher/admin to batch-append new flashcards or quiz questions to an existing topic.
 */
async function appendTopicContent(req, res) {
  const { id } = req.params;
  const { flashcards, quiz } = req.body;

  if ((!flashcards || !flashcards.length) && (!quiz || !quiz.length)) {
    return res.status(400).json({ success: false, message: 'Please provide flashcards or quiz questions to append.' });
  }

  try {
    await ensureContentTables();
    const [rows] = await pool.query('SELECT id, content_payload FROM topics WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Topic not found.' });
    }

    let payload = {};
    if (rows[0].content_payload) {
      try {
        payload = typeof rows[0].content_payload === 'string'
          ? JSON.parse(rows[0].content_payload)
          : rows[0].content_payload;
      } catch (e) { }
    }

    payload.resources = Array.isArray(payload.resources) ? payload.resources : [];
    payload.flashcards = Array.isArray(payload.flashcards) ? payload.flashcards : [];
    payload.quiz = Array.isArray(payload.quiz) ? payload.quiz : [];

    let addedCards = 0;
    if (Array.isArray(flashcards) && flashcards.length > 0) {
      flashcards.forEach(c => {
        const term = (c.term || c.front || '').trim();
        const definition = (c.definition || c.back || '').trim();
        if (term || definition) {
          payload.flashcards.push({
            id: c.id || `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            term,
            definition
          });
          addedCards++;
        }
      });
      if (!payload.resources.includes('Flashcards')) {
        payload.resources.push('Flashcards');
      }
    }

    let addedQuestions = 0;
    if (Array.isArray(quiz) && quiz.length > 0) {
      quiz.forEach(q => {
        const text = (q.text || q.question || '').trim();
        if (text) {
          let opts = q.options;
          if (Array.isArray(opts)) {
            opts = { A: opts[0] || '', B: opts[1] || '', C: opts[2] || '', D: opts[3] || '' };
          } else if (!opts || typeof opts !== 'object') {
            opts = {
              A: q.optionA || '',
              B: q.optionB || '',
              C: q.optionC || '',
              D: q.optionD || ''
            };
          }
          const answer = (q.answer || q.correctAnswer || 'A').toString().trim().toUpperCase();
          payload.quiz.push({
            id: q.id || `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            text,
            options: {
              A: opts.A || '',
              B: opts.B || '',
              C: opts.C || '',
              D: opts.D || ''
            },
            answer: ['A', 'B', 'C', 'D'].includes(answer) ? answer : 'A'
          });
          addedQuestions++;
        }
      });
      if (!payload.resources.includes('Practice Quiz')) {
        payload.resources.push('Practice Quiz');
      }
    }

    await pool.query(
      'UPDATE topics SET content_payload = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(payload), id]
    );

    return res.json({
      success: true,
      message: `Successfully added ${addedCards} flashcard(s) and ${addedQuestions} quiz question(s).`,
      totalFlashcards: payload.flashcards.length,
      totalQuestions: payload.quiz.length
    });
  } catch (err) {
    console.error('appendTopicContent error:', err);
    return res.status(500).json({ success: false, message: 'Failed to append content to topic.' });
  }
}

/* =================== TOPIC PRACTICE QUIZ ATTEMPTS ==================== */

/**
 * POST /api/content/topic-quiz/attempt
 * Body: { topicId, topicTitle, subjectName, sectionName, score, totalQuestions, answers, isPreview }
 */
async function submitTopicQuizAttempt(req, res) {
  try {
    await ensureContentTables();
    const { topicId, topicTitle, subjectName, sectionName, score, totalQuestions, answers, isPreview } = req.body;

    if (!topicTitle || !subjectName) {
      return res.status(400).json({ success: false, message: 'topicTitle and subjectName are required.' });
    }

    const numScore = Number.isInteger(score) ? score : parseInt(score, 10) || 0;
    const numTotal = Number.isInteger(totalQuestions) ? totalQuestions : parseInt(totalQuestions, 10) || 0;
    const percentage = numTotal > 0 ? Math.round(((numScore / numTotal) * 100) * 100) / 100 : 0.00;

    // A run is marked as preview if isPreview is true OR user role is teacher/admin
    const userRole = req.user?.role || 'student';
    const previewFlag = (isPreview === true || userRole !== 'student') ? 1 : 0;

    let finalTopicId = topicId ? parseInt(topicId, 10) : null;
    if (!finalTopicId) {
      const [matched] = await pool.query(
        `SELECT t.id FROM topics t
         JOIN subjects s ON s.id = t.subject_id
         WHERE LOWER(t.title) = LOWER(?) AND LOWER(s.name) = LOWER(?) LIMIT 1`,
        [topicTitle.trim(), subjectName.trim()]
      );
      if (matched && matched.length > 0) {
        finalTopicId = matched[0].id;
      }
    }

    const answersJson = answers && Array.isArray(answers) ? JSON.stringify(answers) : null;

    const [insertResult] = await pool.query(
      `INSERT INTO topic_quiz_attempts (
        user_id, topic_id, topic_title, subject_name, section_name,
        score, total_questions, percentage, answers_json, is_preview, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        req.user.id,
        finalTopicId,
        topicTitle.trim(),
        subjectName.trim(),
        (sectionName || '').trim() || null,
        numScore,
        numTotal,
        percentage,
        answersJson,
        previewFlag
      ]
    );

    return res.json({
      success: true,
      attemptId: insertResult.insertId,
      score: numScore,
      totalQuestions: numTotal,
      percentage,
      isPreview: !!previewFlag,
      message: previewFlag ? 'Preview quiz attempt recorded.' : 'Practice quiz attempt recorded successfully.'
    });
  } catch (err) {
    console.error('submitTopicQuizAttempt error:', err);
    return res.status(500).json({ success: false, message: 'Could not record quiz attempt.' });
  }
}

/**
 * GET /api/content/topic-quiz/my-attempts
 * Query: ?subjectName=&topicTitle=&topicId=
 */
async function getMyTopicQuizAttempts(req, res) {
  try {
    await ensureContentTables();
    const { subjectName, topicTitle, topicId } = req.query;
    let query = `
      SELECT id, topic_id, topic_title, subject_name, section_name,
             score, total_questions, percentage, answers_json, is_preview, created_at
      FROM topic_quiz_attempts
      WHERE user_id = ?
    `;
    const params = [req.user.id];

    if (subjectName) {
      query += ' AND LOWER(subject_name) = LOWER(?)';
      params.push(subjectName.trim());
    }

    if (topicTitle) {
      query += ' AND LOWER(topic_title) = LOWER(?)';
      params.push(topicTitle.trim());
    } else if (topicId) {
      query += ' AND topic_id = ?';
      params.push(topicId);
    }

    query += ' ORDER BY created_at DESC LIMIT 50';

    const [rows] = await pool.query(query, params);

    const attempts = rows.map(r => {
      let answers = null;
      if (r.answers_json) {
        try {
          answers = JSON.parse(r.answers_json);
        } catch (e) {}
      }
      return {
        id: r.id,
        topicId: r.topic_id,
        topicTitle: r.topic_title,
        subjectName: r.subject_name,
        sectionName: r.section_name,
        score: r.score,
        totalQuestions: r.total_questions,
        percentage: parseFloat(r.percentage),
        isPreview: !!r.is_preview,
        createdAt: r.created_at,
        answers
      };
    });

    return res.json({ success: true, attempts });
  } catch (err) {
    console.error('getMyTopicQuizAttempts error:', err);
    return res.status(500).json({ success: false, message: 'Could not load quiz attempts.' });
  }
}

/**
 * GET /api/content/topic-quiz/student-summary
 * Query: ?subjectName=
 * Returns student's best and latest scores for all topics in a subject
 */
async function getStudentSubjectQuizSummary(req, res) {
  try {
    await ensureContentTables();
    const { subjectName } = req.query;
    if (!subjectName) {
      return res.status(400).json({ success: false, message: 'subjectName query parameter is required.' });
    }

    const [rows] = await pool.query(
      `SELECT
        topic_title,
        MAX(score) AS best_score,
        MAX(total_questions) AS total_questions,
        MAX(percentage) AS best_percentage,
        COUNT(*) AS attempts_count,
        MAX(created_at) AS last_taken_at
       FROM topic_quiz_attempts
       WHERE user_id = ?
         AND LOWER(subject_name) = LOWER(?)
         AND is_preview = 0
       GROUP BY topic_title`,
      [req.user.id, subjectName.trim()]
    );

    const summaries = {};
    rows.forEach(r => {
      summaries[r.topic_title.toLowerCase()] = {
        topicTitle: r.topic_title,
        bestScore: r.best_score,
        totalQuestions: r.total_questions,
        bestPercentage: parseFloat(r.best_percentage || 0),
        attemptsCount: r.attempts_count,
        lastTakenAt: r.last_taken_at
      };
    });

    return res.json({ success: true, summaries });
  } catch (err) {
    console.error('getStudentSubjectQuizSummary error:', err);
    return res.status(500).json({ success: false, message: 'Could not load quiz summary.' });
  }
}

/**
 * GET /api/content/topic-quiz/class-results
 * Query: ?subjectName=&topicTitle=&sectionName=
 * Teacher/Admin view of student attempts on a topic quiz
 */
async function getClassTopicQuizResults(req, res) {
  try {
    await ensureContentTables();
    const { subjectName, topicTitle, sectionName } = req.query;
    if (!subjectName || !topicTitle) {
      return res.status(400).json({ success: false, message: 'subjectName and topicTitle are required.' });
    }

    let query = `
      SELECT
        a.id,
        a.user_id,
        u.first_name,
        u.last_name,
        u.id_number AS lrn,
        u.email,
        a.section_name,
        a.score,
        a.total_questions,
        a.percentage,
        a.created_at
      FROM topic_quiz_attempts a
      JOIN users u ON u.id = a.user_id
      WHERE LOWER(a.subject_name) = LOWER(?)
        AND LOWER(a.topic_title) = LOWER(?)
        AND a.is_preview = 0
    `;
    const params = [subjectName.trim(), topicTitle.trim()];

    if (sectionName && sectionName.trim()) {
      query += ' AND (LOWER(a.section_name) = LOWER(?) OR a.section_name IS NULL)';
      params.push(sectionName.trim());
    }

    query += ' ORDER BY a.created_at DESC';

    const [rows] = await pool.query(query, params);

    const studentMap = {};
    rows.forEach(r => {
      const uid = r.user_id;
      const pct = parseFloat(r.percentage || 0);
      if (!studentMap[uid]) {
        studentMap[uid] = {
          userId: uid,
          name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown Student',
          lrn: r.lrn || 'N/A',
          email: r.email || '',
          sectionName: r.section_name || 'N/A',
          attemptsCount: 0,
          bestScore: 0,
          bestPercentage: 0,
          totalQuestions: r.total_questions,
          latestScore: r.score,
          latestPercentage: pct,
          lastTakenAt: r.created_at,
          history: []
        };
      }
      const st = studentMap[uid];
      st.attemptsCount++;
      if (pct > st.bestPercentage || (pct === st.bestPercentage && r.score > st.bestScore)) {
        st.bestScore = r.score;
        st.bestPercentage = pct;
      }
      st.history.push({
        attemptId: r.id,
        score: r.score,
        totalQuestions: r.total_questions,
        percentage: pct,
        createdAt: r.created_at
      });
    });

    const students = Object.values(studentMap);
    const totalStudents = students.length;
    const avgPercentage = totalStudents > 0
      ? Math.round((students.reduce((acc, s) => acc + s.bestPercentage, 0) / totalStudents) * 10) / 10
      : 0;
    const highestScore = totalStudents > 0
      ? Math.max(...students.map(s => s.bestScore))
      : 0;
    const passedCount = students.filter(s => s.bestPercentage >= 60).length;
    const passRate = totalStudents > 0
      ? Math.round((passedCount / totalStudents) * 100)
      : 0;

    return res.json({
      success: true,
      stats: {
        totalStudents,
        averagePercentage: avgPercentage,
        passRate,
        highestScore,
        totalQuestions: rows[0]?.total_questions || 0
      },
      students
    });
  } catch (err) {
    console.error('getClassTopicQuizResults error:', err);
    return res.status(500).json({ success: false, message: 'Could not load class quiz results.' });
  }
}

module.exports = {
  listTopics,
  createTopic,
  deleteTopic,
  createTopicRequest,
  listTopicRequests,
  reviewTopicRequest,
  listQuizSets,
  getQuizSet,
  createQuizSet,
  submitQuizAttempt,
  getMyQuizAttempts,
  listFlashcardSets,
  getFlashcardSet,
  createFlashcardSet,
  saveFlashcardProgress,
  convertDocument,
  cacheTopicFilePdf,
  createPublicPreviewToken,
  serveRawPreview,
  downloadFlashcardsTemplate,
  downloadQuizTemplate,
  appendTopicContent,
  submitTopicQuizAttempt,
  getMyTopicQuizAttempts,
  getStudentSubjectQuizSummary,
  getClassTopicQuizResults,
  downloadTopicFile,
  downloadTopicFileByName,
};
