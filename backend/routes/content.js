const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
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
} = require('../controllers/contentController');

// Topics
router.get('/topics', requireAuth, listTopics);
router.post('/topics', requireAuth, requireRole('admin'), createTopic);

// Topic requests (teacher submits, admin reviews)
router.post('/topic-requests', requireAuth, requireRole('teacher'), createTopicRequest);
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
