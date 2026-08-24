const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { teacherTeachesSection } = require('../utils/authz');
const { notify, notifyMany } = require('../utils/notifications');

const VALID_QUARTERS = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'];

/** Student user IDs who should be able to see a module (section-scoped, or every section the teacher teaches that subject to when section_id is NULL). */
async function getRecipientStudentIds(module) {
  if (module.section_id) {
    const [rows] = await pool.query("SELECT id FROM users WHERE role = 'student' AND section_id = ?", [module.section_id]);
    return rows.map((r) => r.id);
  }
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id FROM users u
     JOIN schedules sch ON sch.section_id = u.section_id
     WHERE u.role = 'student' AND sch.teacher_id = ? AND sch.subject_id = ?`,
    [module.teacher_id, module.subject_id]
  );
  return rows.map((r) => r.id);
}

/** Whether this student can see this module (used by the download-access check). */
async function moduleVisibleToStudent(moduleRow, studentId) {
  if (moduleRow.section_id) {
    const [rows] = await pool.query('SELECT section_id FROM users WHERE id = ?', [studentId]);
    return rows[0]?.section_id === moduleRow.section_id;
  }
  const [rows] = await pool.query(
    `SELECT 1 FROM users u
     JOIN schedules sch ON sch.section_id = u.section_id
     WHERE u.id = ? AND sch.teacher_id = ? AND sch.subject_id = ? LIMIT 1`,
    [studentId, moduleRow.teacher_id, moduleRow.subject_id]
  );
  return !!rows[0];
}

/**
 * POST /api/resources  (multipart: title, description, subjectId, sectionId?, quarter, files[])
 * Gathers one or more files under a new lesson module and posts it to the
 * relevant section(s). Notifies affected students.
 */
async function createModule(req, res) {
  const { title, description, subjectId, sectionId, quarter } = req.body;
  const files = req.files || [];

  if (!title || !subjectId || !quarter || !VALID_QUARTERS.includes(quarter)) {
    cleanupUploaded(files);
    return res.status(400).json({ success: false, message: 'Title, subject, and a valid quarter are required.' });
  }
  if (!files.length) {
    return res.status(400).json({ success: false, message: 'Attach at least one file.' });
  }

  try {
    if (sectionId) {
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches) {
        cleanupUploaded(files);
        return res.status(403).json({ success: false, message: 'You do not teach this section.' });
      }
    } else {
      const [check] = await pool.query('SELECT 1 FROM schedules WHERE teacher_id = ? AND subject_id = ? LIMIT 1', [
        req.user.id,
        subjectId,
      ]);
      if (!check[0]) {
        cleanupUploaded(files);
        return res.status(403).json({ success: false, message: 'You do not teach this subject.' });
      }
    }

    const [result] = await pool.query(
      'INSERT INTO lesson_modules (teacher_id, subject_id, section_id, quarter, title, description) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, subjectId, sectionId || null, quarter, title, description || null]
    );
    const moduleId = result.insertId;

    for (const file of files) {
      await pool.query(
        `INSERT INTO lesson_module_files (module_id, original_name, file_path, file_size, mime_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [moduleId, file.originalname, path.relative(path.join(__dirname, '..'), file.path), file.size, file.mimetype, req.user.id]
      );
    }

    const module = { teacher_id: req.user.id, subject_id: subjectId, section_id: sectionId || null };
    const recipients = await getRecipientStudentIds(module);
    await notifyMany(recipients, {
      type: 'lesson_module_posted',
      title: 'New learning material posted',
      message: `"${title}" was posted by your teacher.`,
    });

    return res.json({ success: true, message: 'Module posted.', moduleId });
  } catch (err) {
    cleanupUploaded(files);
    console.error('createModule error:', err);
    return res.status(500).json({ success: false, message: 'Could not post the module.' });
  }
}

/** POST /api/resources/:moduleId/files (multipart: files[]) — attach more files to an existing module. */
async function addFiles(req, res) {
  const { moduleId } = req.params;
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ success: false, message: 'Attach at least one file.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM lesson_modules WHERE id = ?', [moduleId]);
    const module = rows[0];
    if (!module) {
      cleanupUploaded(files);
      return res.status(404).json({ success: false, message: 'Module not found.' });
    }
    if (req.user.role === 'teacher' && module.teacher_id !== req.user.id) {
      cleanupUploaded(files);
      return res.status(403).json({ success: false, message: 'This is not your module.' });
    }

    for (const file of files) {
      await pool.query(
        `INSERT INTO lesson_module_files (module_id, original_name, file_path, file_size, mime_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [moduleId, file.originalname, path.relative(path.join(__dirname, '..'), file.path), file.size, file.mimetype, req.user.id]
      );
    }

    const recipients = await getRecipientStudentIds(module);
    await notifyMany(recipients, {
      type: 'lesson_module_updated',
      title: 'Learning material updated',
      message: `New file(s) added to "${module.title}".`,
    });

    return res.json({ success: true, message: 'File(s) added.' });
  } catch (err) {
    cleanupUploaded(files);
    console.error('addFiles error:', err);
    return res.status(500).json({ success: false, message: 'Could not add file(s).' });
  }
}

/**
 * PUT /api/resources/files/:fileId  (multipart: file — single)
 * Replaces the content of an existing lesson file with an updated version.
 * The prior version is preserved in lesson_module_file_versions, and
 * students who can see the module are notified.
 */
async function replaceFile(req, res) {
  const { fileId } = req.params;
  const newFile = req.file;
  if (!newFile) {
    return res.status(400).json({ success: false, message: 'Attach the updated file.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT f.*, m.teacher_id, m.subject_id, m.section_id, m.title AS moduleTitle
       FROM lesson_module_files f JOIN lesson_modules m ON m.id = f.module_id
       WHERE f.id = ?`,
      [fileId]
    );
    const existing = rows[0];
    if (!existing) {
      cleanupUploaded([newFile]);
      return res.status(404).json({ success: false, message: 'File not found.' });
    }
    if (req.user.role === 'teacher' && existing.teacher_id !== req.user.id) {
      cleanupUploaded([newFile]);
      return res.status(403).json({ success: false, message: 'This is not your file to update.' });
    }

    // Preserve the current version in history before overwriting.
    await pool.query(
      `INSERT INTO lesson_module_file_versions
         (module_file_id, original_name, file_path, file_size, mime_type, version, replaced_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [existing.id, existing.original_name, existing.file_path, existing.file_size, existing.mime_type, existing.version, req.user.id]
    );

    const newRelativePath = path.relative(path.join(__dirname, '..'), newFile.path);
    await pool.query(
      `UPDATE lesson_module_files
       SET original_name = ?, file_path = ?, file_size = ?, mime_type = ?, version = version + 1, uploaded_by = ?
       WHERE id = ?`,
      [newFile.originalname, newRelativePath, newFile.size, newFile.mimetype, req.user.id, fileId]
    );

    // Remove the now-superseded physical file so disk usage doesn't grow unbounded.
    // (Comment this out if you'd rather keep old files on disk for the version history above.)
    const oldAbsolutePath = path.join(__dirname, '..', existing.file_path);
    fs.unlink(oldAbsolutePath, () => {});

    const recipients = await getRecipientStudentIds(existing);
    await notifyMany(recipients, {
      type: 'lesson_module_updated',
      title: 'Learning material updated',
      message: `"${existing.original_name}" in "${existing.moduleTitle}" was updated by your teacher — check the latest version.`,
    });

    return res.json({ success: true, message: 'File updated.' });
  } catch (err) {
    cleanupUploaded([newFile]);
    console.error('replaceFile error:', err);
    return res.status(500).json({ success: false, message: 'Could not update the file.' });
  }
}

/** GET /api/resources/mine?sectionId=&subjectId=&quarter= — teacher's own posted modules */
async function listMine(req, res) {
  try {
    const conditions = ['m.teacher_id = ?'];
    const params = [req.user.id];
    if (req.query.sectionId) {
      conditions.push('m.section_id = ?');
      params.push(req.query.sectionId);
    }
    if (req.query.subjectId) {
      conditions.push('m.subject_id = ?');
      params.push(req.query.subjectId);
    }
    if (req.query.quarter) {
      conditions.push('m.quarter = ?');
      params.push(req.query.quarter);
    }

    const [modules] = await pool.query(
      `SELECT m.id, m.title, m.description, m.quarter, m.created_at, m.updated_at,
              sub.name AS subjectName, sec.name AS sectionName, sec.grade_level, st.code AS strandCode
       FROM lesson_modules m
       JOIN subjects sub ON sub.id = m.subject_id
       LEFT JOIN sections sec ON sec.id = m.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC`,
      params
    );

    await attachFiles(modules);
    return res.json({ success: true, modules });
  } catch (err) {
    console.error('listMine (resources) error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your posted materials.' });
  }
}

/** GET /api/resources?quarter= — modules visible to the logged-in student */
async function listForStudent(req, res) {
  try {
    const [userRows] = await pool.query('SELECT section_id FROM users WHERE id = ?', [req.user.id]);
    const sectionId = userRows[0]?.section_id;
    if (!sectionId) {
      return res.json({ success: true, modules: [] });
    }

    const conditions = [
      `(m.section_id = ? OR (m.section_id IS NULL AND EXISTS (
         SELECT 1 FROM schedules sch WHERE sch.teacher_id = m.teacher_id AND sch.subject_id = m.subject_id AND sch.section_id = ?
       )))`,
    ];
    const params = [sectionId, sectionId];
    if (req.query.quarter) {
      conditions.push('m.quarter = ?');
      params.push(req.query.quarter);
    }

    const [modules] = await pool.query(
      `SELECT m.id, m.title, m.description, m.quarter, m.created_at, m.updated_at,
              sub.name AS subjectName, u.first_name AS teacherFirst, u.last_name AS teacherLast
       FROM lesson_modules m
       JOIN subjects sub ON sub.id = m.subject_id
       JOIN users u ON u.id = m.teacher_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC`,
      params
    );

    await attachFiles(modules);
    return res.json({ success: true, modules });
  } catch (err) {
    console.error('listForStudent (resources) error:', err);
    return res.status(500).json({ success: false, message: 'Could not load learning materials.' });
  }
}

/** Mutates `modules` in place, adding a `files` array to each. */
async function attachFiles(modules) {
  if (!modules.length) return;
  const ids = modules.map((m) => m.id);
  const [files] = await pool.query(
    `SELECT id, module_id, original_name, file_size, mime_type, version, uploaded_at, updated_at
     FROM lesson_module_files WHERE module_id IN (?) ORDER BY uploaded_at`,
    [ids]
  );
  const byModule = {};
  for (const f of files) {
    (byModule[f.module_id] ||= []).push(f);
  }
  for (const m of modules) {
    m.files = byModule[m.id] || [];
  }
}

/** GET /api/resources/files/:fileId/download */
async function downloadFile(req, res) {
  const { fileId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT f.*, m.teacher_id, m.subject_id, m.section_id
       FROM lesson_module_files f JOIN lesson_modules m ON m.id = f.module_id
       WHERE f.id = ?`,
      [fileId]
    );
    const file = rows[0];
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    if (req.user.role === 'teacher' && file.teacher_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not have access to this file.' });
    }
    if (req.user.role === 'student') {
      const canSee = await moduleVisibleToStudent(file, req.user.id);
      if (!canSee) return res.status(403).json({ success: false, message: 'You do not have access to this file.' });
    }
    if (req.user.role === 'parent') {
      const [links] = await pool.query('SELECT student_id FROM parent_student_links WHERE parent_id = ?', [req.user.id]);
      const checks = await Promise.all(links.map((l) => moduleVisibleToStudent(file, l.student_id)));
      if (!checks.some(Boolean)) return res.status(403).json({ success: false, message: 'You do not have access to this file.' });
    }

    const absolutePath = path.join(__dirname, '..', file.file_path);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'This file is no longer available on the server.' });
    }
    return res.download(absolutePath, file.original_name);
  } catch (err) {
    console.error('downloadFile error:', err);
    return res.status(500).json({ success: false, message: 'Could not download the file.' });
  }
}

/** DELETE /api/resources/:moduleId — teacher removes their own module (and its files). */
async function deleteModule(req, res) {
  const { moduleId } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM lesson_modules WHERE id = ?', [moduleId]);
    const module = rows[0];
    if (!module) return res.status(404).json({ success: false, message: 'Module not found.' });
    if (req.user.role === 'teacher' && module.teacher_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'This is not your module.' });
    }

    const [files] = await pool.query('SELECT file_path FROM lesson_module_files WHERE module_id = ?', [moduleId]);
    await pool.query('DELETE FROM lesson_modules WHERE id = ?', [moduleId]); // cascades files + version rows
    for (const f of files) {
      fs.unlink(path.join(__dirname, '..', f.file_path), () => {});
    }

    return res.json({ success: true, message: 'Module deleted.' });
  } catch (err) {
    console.error('deleteModule error:', err);
    return res.status(500).json({ success: false, message: 'Could not delete the module.' });
  }
}

function cleanupUploaded(files) {
  for (const f of files || []) {
    if (f?.path) fs.unlink(f.path, () => {});
  }
}

module.exports = { createModule, addFiles, replaceFile, listMine, listForStudent, downloadFile, deleteModule };
