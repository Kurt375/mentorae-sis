const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const gradesRoutes = require('./routes/grades');
const classesRoutes = require('./routes/classes');
const badgesRoutes = require('./routes/badges');
const schedulesRoutes = require('./routes/schedules');
const announcementsRoutes = require('./routes/announcements');
const settingsRoutes = require('./routes/settings');
const databaseRoutes = require('./routes/database');
const analyticsRoutes = require('./routes/analytics');
const usersRoutes = require('./routes/users');
const referenceRoutes = require('./routes/reference');
const parentRoutes = require('./routes/parent');
const notificationsRoutes = require('./routes/notifications');
const resourcesRoutes = require('./routes/resources');
const contentRoutes = require('./routes/content');

const app = express();
app.set('trust proxy', 1);

const envOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  'https://mentorae-student-portal.netlify.app',
  'https://comforting-fox-c29e5a.netlify.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
  ...envOrigins
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, file://)
    if (!origin || origin === 'null') return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.endsWith('.netlify.app') ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl || req.url}`);
  next();
});

const pool = require('./config/db');

app.get('/api/health', (req, res) => {
  const activeDatabase = pool.getCurrentMode ? pool.getCurrentMode() : 'cloud';
  res.json({
    success: true,
    message: 'Mentorae SIS API is running.',
    activeDatabase,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/schedules', schedulesRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/content', contentRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found.' });
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Unexpected server error.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Mentorae SIS API listening on port ${PORT}`);
});