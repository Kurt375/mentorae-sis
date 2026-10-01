const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
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
  downloadFlashcardsTemplate,
  downloadQuizTemplate,
  appendTopicContent,
  submitTopicQuizAttempt,
  getMyTopicQuizAttempts,
  getStudentSubjectQuizSummary,
  getClassTopicQuizResults,
} = require('../controllers/contentController');

// Document conversion (PPTX/DOCX to PDF)
router.post('/convert-document', requireAuth, convertDocument);

// Templates for bulk content
router.get('/templates/flashcards', downloadFlashcardsTemplate);
router.get('/templates/quiz', downloadQuizTemplate);

// Topics
router.get('/topics', requireAuth, listTopics);
router.post('/topics', requireAuth, requireRole('teacher', 'admin'), createTopic);
router.delete('/topics/:id', requireAuth, requireRole('teacher', 'admin'), deleteTopic);
router.post('/topics/:id/append-content', requireAuth, requireRole('teacher', 'admin'), appendTopicContent);

// Topic Practice Quiz Attempts & Analytics
router.post('/topic-quiz/attempt', requireAuth, submitTopicQuizAttempt);
router.get('/topic-quiz/my-attempts', requireAuth, getMyTopicQuizAttempts);
router.get('/topic-quiz/student-summary', requireAuth, getStudentSubjectQuizSummary);
router.get('/topic-quiz/class-results', requireAuth, requireRole('teacher', 'admin'), getClassTopicQuizResults);

// Topic requests (teacher/admin submits, admin reviews)
router.post('/topic-requests', requireAuth, requireRole('teacher', 'admin'), createTopicRequest);
router.get('/topic-requests', requireAuth, requireRole('admin'), listTopicRequests);
router.post('/topic-requests/:id/review', requireAuth, requireRole('admin'), reviewTopicRequest);

// Quizzes
router.get('/quiz-sets', requireAuth, listQuizSets);
router.get('/quiz-sets/:id', requireAuth, getQuizSet);
router.post('/quiz-sets', requireAuth, requireRole('teacher', 'admin'), createQuizSet);
router.post('/quiz-sets/:id/attempts', requireAuth, requireRole('student'), submitQuizAttempt);
router.get('/quiz-sets/:id/attempts/mine', requireAuth, requireRole('student'), getMyQuizAttempts);

// Flashcards
router.get('/flashcard-sets', requireAuth, listFlashcardSets);
router.get('/flashcard-sets/:id', requireAuth, getFlashcardSet);
router.post('/flashcard-sets', requireAuth, requireRole('teacher', 'admin'), createFlashcardSet);
router.post('/flashcard-sets/:id/progress', requireAuth, requireRole('student'), saveFlashcardProgress);

module.exports = router;
