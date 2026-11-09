process.env.TZ = 'Asia/Manila';
// Expand libuv worker threadpool for concurrent bcrypt and crypto operations
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '64';
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

// --- Security & Origin Allowlist ---
const envOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://mentorae-sis-frontend.vercel.app',
  'https://mentorae-sis.vercel.app',
  ...envOrigins
];

// 1. Safe HTTP Security Headers
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Content Security Policy: frame-ancestors prevents external clickjacking while allowing
  // our production domains, preview branches, and local dev environments to embed PDFs/docs
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://mentorae-sis-frontend.vercel.app https://mentorae-sis.vercel.app https://*.vercel.app https://*.onrender.com http://localhost:* http://127.0.0.1:*"
  );
  // Omit X-Frame-Options on file-delivery routes so frontend can embed document previews cross-subdomain;
  // keep SAMEORIGIN on general API endpoints for legacy browser protection
  if (!req.path.startsWith('/api/content/') && !req.path.startsWith('/api/resources/files/')) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  // Standard Referrer Policy to prevent token/path leakage to third parties
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable client-side caching of sensitive student data from API
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  // Enforce HTTPS in production via HSTS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// 2. Strict CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin || origin === 'null') return callback(null, true);

    // Explicitly allowed production & custom origins
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow localhost / loopback on any port for local development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }

    // Allow local private network testing (e.g. tablet/phone connected to school or home Wi-Fi)
    if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow official Mentorae Vercel preview deployments for this project (e.g. mentorae-sis-frontend-git-branch.vercel.app)
    if (/^https:\/\/mentorae-sis(-frontend)?(-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) {
      return callback(null, true);
    }

    // Allow official Mentorae Render deployments
    if (/^https:\/\/mentorae[a-z0-9-]*\.onrender\.com$/i.test(origin)) {
      return callback(null, true);
    }

    // Block unauthorized third-party origins
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
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

const { startAttendanceScheduler } = require('./jobs/attendanceJob');

const PORT = process.env.PORT || 5000;
const isServerless = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME);
if (!isServerless && process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Mentorae SIS API listening on port ${PORT}`);
    startAttendanceScheduler();
  });
}

module.exports = app;