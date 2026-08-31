const pool = require('../config/db');
const { teacherTeachesSection } = require('../utils/authz');

/* ============================= TOPICS ============================= */

/** GET /api/content/topics?subjectId= */
async function listTopics(req, res) {
  const { subjectId } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM topics WHERE status = 'approved' ${subjectId ? 'AND subject_id = ?' : ''} ORDER BY created_at DESC`,
      subjectId ? [subjectId] : []
    );
    return res.json({ success: true, topics: rows });
  } catch (err) {
    console.error('listTopics error:', err);
    return res.status(500).json({ success: false, message: 'Could not load topics.' });
  }
}

/** POST /api/content/topics  { subjectId, title, description } — admin only, auto-approved */
async function createTopic(req, res) {
  const { subjectId, title, description } = req.body;
  if (!subjectId || !title) {
    return res.status(400).json({ success: false, message: 'subjectId and title are required.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO topics (subject_id, title, description, created_by, status) VALUES (?, ?, ?, ?, "approved")',
      [subjectId, title, description || null, req.user.id]
    );
    return res.json({ success: true, topicId: result.insertId });
  } catch (err) {
    console.error('createTopic error:', err);
    return res.status(500).json({ success: false, message: 'Could not create topic.' });
  }
}

/* ========================= TOPIC REQUESTS ========================= */

/** POST /api/content/topic-requests  { subjectId, title, description } — teacher proposes a topic */
async function createTopicRequest(req, res) {
  const { subjectId, title, description } = req.body;
  if (!subjectId || !title) {
    return res.status(400).json({ success: false, message: 'subjectId and title are required.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO topic_requests (subject_id, teacher_id, title, description) VALUES (?, ?, ?, ?)',
      [subjectId, req.user.id, title, description || null]
    );
    return res.json({ success: true, requestId: result.insertId });
  } catch (err) {
    console.error('createTopicRequest error:', err);
    return res.status(500).json({ success: false, message: 'Could not submit topic request.' });
  }
}

/** GET /api/content/topic-requests?status=pending — admin review queue */
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
    return res.json({ success: true, requests: rows });
  } catch (err) {
    console.error('listTopicRequests error:', err);
    return res.status(500).json({ success: false, message: 'Could not load topic requests.' });
  }
}

/** POST /api/content/topic-requests/:id/review  { approve: true|false } — admin only */
async function reviewTopicRequest(req, res) {
  const { id } = req.params;
  const { approve } = req.body;
  try {
    const [reqRows] = await pool.query('SELECT * FROM topic_requests WHERE id = ?', [id]);
    const request = reqRows[0];
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This request was already reviewed.' });
    }

    if (approve) {
      const [topicResult] = await pool.query(
        'INSERT INTO topics (subject_id, title, description, created_by, status) VALUES (?, ?, ?, ?, "approved")',
        [request.subject_id, request.title, request.description, request.teacher_id]
      );
      await pool.query(
        'UPDATE topic_requests SET status = "approved", reviewed_by = ?, reviewed_at = NOW(), topic_id = ? WHERE id = ?',
        [req.user.id, topicResult.insertId, id]
      );
      return res.json({ success: true, topicId: topicResult.insertId });
    } else {
      await pool.query(
        'UPDATE topic_requests SET status = "rejected", reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
        [req.user.id, id]
      );
      return res.json({ success: true });
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

module.exports = {
  listTopics,
  createTopic,
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
};
