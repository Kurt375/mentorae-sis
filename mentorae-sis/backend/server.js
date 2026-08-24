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

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));
app.use(express.json({ limit: '8mb' })); // raised for base64 profile-picture uploads
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Mentorae SIS API is running.' });
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

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found.' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Unexpected server error.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Mentorae SIS API listening on port ${PORT}`);
});
