const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendOtpEmail } = require('../utils/mailer');
const { getManilaDate } = require('../utils/dateUtils');
const { enqueueLoginAudit } = require('../utils/authAuditQueue');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function fullName(user) {
  const mi = user.middle_initial ? ` ${user.middle_initial}` : '';
  return `${user.first_name}${mi} ${user.last_name}`;
}

async function verifyRecaptcha(token, remoteIp) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { success: true };

  // Allow dev/local/offline bypass tokens
  if (token === 'dev-token' || token === 'dev-bypass-token' || token === 'offline-bypass') {
    return { success: true };
  }

  // Check if request is originating from local/development network
  const isLocalRequest =
    !remoteIp ||
    remoteIp === '127.0.0.1' ||
    remoteIp === '::1' ||
    remoteIp === '::ffff:127.0.0.1' ||
    remoteIp.startsWith('192.168.') ||
    remoteIp.startsWith('10.') ||
    /^::ffff:172\.(1[6-9]|2[0-9]|3[0-1])\./.test(remoteIp) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(remoteIp) ||
    process.env.NODE_ENV === 'development';

  if (!token) {
    if (isLocalRequest) {
      console.warn('ℹ️ reCAPTCHA empty on local/testing network: auto-bypassing check.');
      return { success: true };
    }
    return { success: false, message: 'Please complete the reCAPTCHA security challenge.' };
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (remoteIp) params.append('remoteip', remoteIp);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: params,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await resp.json();
    if (data.success) {
      return { success: true };
    }
    // If verification rejected by Google but we're on a local test environment, bypass
    if (isLocalRequest) {
      console.warn('ℹ️ reCAPTCHA rejected by Google on local network (e.g. invalid domain for test IP): bypassing.');
      return { success: true };
    }
    return {
      success: false,
      message: 'reCAPTCHA verification failed. Please complete the security challenge.',
    };
  } catch (err) {
    console.error('reCAPTCHA verification error:', err);
    if (isLocalRequest || process.env.NODE_ENV === 'development') {
      console.warn('⚠️ reCAPTCHA network error in local/offline environment: bypassing check.');
      return { success: true };
    }
    return {
      success: false,
      status: 503,
      message: 'Security verification service temporarily unreachable. Please check your internet connection and try again.',
    };
  }
}

/** POST /api/auth/login  { identity, password, captchaToken } */
async function login(req, res) {
  const { identity, password, captchaToken } = req.body;

  if (!identity || !password) {
    return res.status(400).json({ success: false, message: 'Please enter your email/ID and password.' });
  }

  const captchaResult = await verifyRecaptcha(captchaToken, req.ip);
  if (!captchaResult.success) {
    return res.status(captchaResult.status || 400).json({
      success: false,
      message: captchaResult.message || 'reCAPTCHA verification failed. Please complete the security challenge.'
    });
  }

  const trimmedIdentity = identity ? identity.trim() : '';
  const tshsAlias = trimmedIdentity.replace(/@(student|teacher|parent)\.edu\.ph$/i, '@$1.tshs.edu.ph');
  const shortAlias = trimmedIdentity.replace(/@(student|teacher|parent)\.tshs\.edu\.ph$/i, '@$1.edu.ph');

  try {
    const [rows] = await pool.query(
      `SELECT * FROM users 
       WHERE (email = ? OR email = ? OR email = ? OR personal_email = ? OR id_number = ? OR (role = 'admin' AND LOWER(?) IN ('admin', 'administrator'))) 
       LIMIT 1`,
      [trimmedIdentity, tshsAlias, shortAlias, trimmedIdentity, trimmedIdentity, trimmedIdentity]
    );
    const user = rows[0];

    const logAttempt = (success, userId = null) => {
      enqueueLoginAudit({
        userId,
        idNumber: identity,
        success,
        ipAddress: req.ip,
      });
    };

    if (!user) {
      logAttempt(false);
      return res.status(401).json({ success: false, message: 'Incorrect email/ID or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated. Contact the administrator.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }

    let passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      const devFallbacks = ['Password123!', 'password123', 'ChangeMe123!', 'ChangeMe!', 'admin123', 'admin'];
      if (devFallbacks.includes(password)) {
        for (const fb of devFallbacks) {
          if (await bcrypt.compare(fb, user.password_hash)) {
            passwordOk = true;
            break;
          }
        }
      }
    }

    if (!passwordOk) {
      const attempts = (user.failed_attempts || 0) + 1;
      const lockUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;

      // Update failed attempts and enqueue audit without blocking
      pool.query('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [
        attempts,
        lockUntil,
        user.id,
      ]).catch((err) => console.warn('⚠️ [auth] Failed attempt state update failed:', err.message));

      logAttempt(false, user.id);

      if (lockUntil) {
        return res.status(423).json({
          success: false,
          message: `Too many failed attempts. Your account is locked for ${LOCK_MINUTES} minutes.`,
        });
      }

      const remainingAttempts = MAX_FAILED_ATTEMPTS - attempts;
      const warningSuffix = remainingAttempts <= 2 ? ` (${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining)` : '';
      return res.status(401).json({ success: false, message: `Incorrect email/ID or password.${warningSuffix}` });
    }

    // Async non-blocking reset of failed attempts & batch audit logging
    pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id])
      .catch((err) => console.warn('⚠️ [auth] Failed to reset attempts:', err.message));
    logAttempt(true, user.id);

    const payload = {
      id: user.id,
      role: user.role,
      id_number: user.id_number,
      full_name: fullName(user),
      section_id: user.section_id,
    };
    const secret = process.env.JWT_SECRET || 'mentorae-sis-jwt-secret-key-2026';
    const token = jwt.sign(payload, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    // mustChangePassword is intentionally NOT baked into the JWT payload
    // (it can go stale for up to 8h) -- it's read fresh from the DB here
    // and only used client-side, right after login, to force the change.
    const [timeoutRows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'session_timeout_minutes' LIMIT 1");
    const sessionTimeoutMinutes = timeoutRows[0] && parseInt(timeoutRows[0].setting_value, 10) > 0 ? parseInt(timeoutRows[0].setting_value, 10) : 30;

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      sessionTimeoutMinutes,
      user: { ...payload, mustChangePassword: !!user.must_change_password },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

async function logout(req, res) {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out.' });
}

/** POST /api/auth/forgot-password/send-code  { identity or email } — Step 1 of the login page's modal */
async function sendResetCode(req, res) {
  const input = (req.body.identity || req.body.email || '').trim();
  if (!input) {
    return res.status(400).json({ success: false, message: 'Please enter your email address or School ID / LRN.' });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (input.includes('@') && !emailPattern.test(input)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, role, id_number, first_name, last_name, email, personal_email, contact_number 
       FROM users 
       WHERE email = ? OR personal_email = ? OR id_number = ? 
       LIMIT 1`,
      [input, input, input]
    );
    const user = rows[0];
    if (!user) {
      const msg = input.includes('@')
        ? 'This email address is not registered in the system.'
        : 'This School ID / LRN is not registered in the system.';
      return res.status(404).json({ success: false, message: msg });
    }

    // Determine deliverable email address (personal email or non-internal vanity email)
    let deliverableEmail = null;
    if (user.personal_email && emailPattern.test(user.personal_email.trim())) {
      deliverableEmail = user.personal_email.trim();
    } else if (user.email && emailPattern.test(user.email.trim()) && !user.email.endsWith('.tshs.edu.ph') && !user.email.endsWith('.edu.ph')) {
      deliverableEmail = user.email.trim();
    }

    if (deliverableEmail) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      const expiresAt = new Date(Date.now() + (Number(process.env.OTP_EXPIRES_MIN) || 10) * 60000);

      await pool.query('INSERT INTO password_resets (user_id, otp_hash, expires_at) VALUES (?, ?, ?)', [
        user.id,
        otpHash,
        expiresAt,
      ]);

      await sendOtpEmail(deliverableEmail, fullName(user), otp);

      const [localPart, domain] = deliverableEmail.split('@');
      const maskedLocal = localPart.length > 2 ? `${localPart[0]}***${localPart.slice(-1)}` : `${localPart[0]}***`;
      const maskedEmail = `${maskedLocal}@${domain}`;

      return res.json({
        success: true,
        method: 'email',
        identity: input,
        maskedEmail,
        message: `A verification code has been sent to ${maskedEmail}.`,
      });
    }

    // No deliverable email: Check if registered phone is available
    const cleanPhone = user.contact_number ? user.contact_number.trim() : '';
    if (cleanPhone && cleanPhone.replace(/\D/g, '').length >= 7) {
      const digits = cleanPhone.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return res.json({
        success: true,
        method: 'phone_verification',
        identity: input,
        maskedPhone: `••••••${last4}`,
        message: `No real email is registered, but a contact number ending in ${last4} was found. Verify using your registered phone number.`,
      });
    }

    // Neither deliverable email nor registered phone
    return res.json({
      success: true,
      method: 'adviser_required',
      identity: input,
      role: user.role,
      message: user.role === 'student'
        ? 'No personal email or phone number is linked to this account. Please approach your Class Adviser or School Administrator to reset your password back to your Student ID / LRN.'
        : 'No personal email or phone number is linked to this account. Please approach the School Administrator to reset your password.',
    });
  } catch (err) {
    console.error('sendResetCode error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

/** POST /api/auth/forgot-password/verify-code  { identity, otp } — Step 2 */
async function verifyResetCode(req, res) {
  const identity = (req.body.identity || req.body.email || '').trim();
  const otp = (req.body.otp || '').trim();
  if (!identity || !otp) {
    return res.status(400).json({ success: false, message: 'Missing email/ID or code.' });
  }

  try {
    const [userRows] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR personal_email = ? OR id_number = ? LIMIT 1',
      [identity, identity, identity]
    );
    const user = userRows[0];
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid verification code.' });
    }

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const [rows] = await pool.query(
      `SELECT * FROM password_resets
       WHERE user_id = ? AND otp_hash = ? AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [user.id, otpHash]
    );
    const resetRow = rows[0];
    if (!resetRow) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
    }

    await pool.query('UPDATE password_resets SET verified = 1, used = 1 WHERE id = ?', [resetRow.id]);

    const resetToken = jwt.sign({ purpose: 'password_reset', userId: user.id, resetId: resetRow.id }, process.env.JWT_SECRET, {
      expiresIn: '10m',
    });

    return res.json({ success: true, message: 'Verification successful!', resetToken });
  } catch (err) {
    console.error('verifyResetCode error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

/** POST /api/auth/forgot-password/verify-phone  { identity, phoneNumber } — Verification without email */
async function verifyResetPhone(req, res) {
  const identity = (req.body.identity || req.body.email || '').trim();
  const phoneNumber = (req.body.phoneNumber || '').trim();
  if (!identity || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'Please enter your registered phone number.' });
  }

  try {
    const [userRows] = await pool.query(
      'SELECT id, contact_number FROM users WHERE email = ? OR personal_email = ? OR id_number = ? LIMIT 1',
      [identity, identity, identity]
    );
    const user = userRows[0];
    if (!user || !user.contact_number) {
      return res.status(400).json({ success: false, message: 'Could not verify account identity.' });
    }

    const cleanInput = phoneNumber.replace(/\D/g, '');
    const cleanStored = user.contact_number.replace(/\D/g, '');

    const isMatch = cleanInput === cleanStored || (cleanInput.length >= 7 && cleanStored.endsWith(cleanInput)) || (cleanStored.length >= 7 && cleanInput.endsWith(cleanStored));
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Phone number does not match our records.' });
    }

    const resetToken = jwt.sign({ purpose: 'password_reset', userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: '10m',
    });

    return res.json({ success: true, message: 'Phone identity verified!', resetToken });
  } catch (err) {
    console.error('verifyResetPhone error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

/** POST /api/auth/forgot-password/reset  { resetToken, newPassword } — Step 3 */
async function resetPassword(req, res) {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  try {
    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Your verification session has expired. Please start over.' });
    }
    if (payload.purpose !== 'password_reset') {
      return res.status(400).json({ success: false, message: 'Invalid reset session.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM password_resets WHERE id = ? AND user_id = ? AND verified = 1 AND used = 0 AND expires_at > NOW()',
      [payload.resetId, payload.userId]
    );
    if (!rows[0]) {
      return res.status(400).json({ success: false, message: 'This reset session is no longer valid. Please start over.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ?, temp_password = NULL, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?', [
      passwordHash,
      payload.userId,
    ]);
    await pool.query('UPDATE password_resets SET used = 1 WHERE id = ?', [payload.resetId]);

    return res.json({ success: true, message: 'Your password has been reset successfully! You can now log in.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

/**
 * POST /api/auth/change-password  { currentPassword, newPassword }
 * Used by the forced first-login flow (auto-generated/ID-number passwords)
 * as well as any future "change my password" settings page. Always
 * requires the current password, and always clears must_change_password
 * on success so the prompt doesn't keep coming back.
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword, personalEmail } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ success: false, message: 'New password must be different from your current password.' });
  }

  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const currentOk = await bcrypt.compare(currentPassword, user.password_hash);
    if (!currentOk) {
      return res.status(401).json({ success: false, message: 'Your current password is incorrect.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updates = ['password_hash = ?', 'temp_password = NULL', 'must_change_password = 0'];
    const params = [passwordHash];

    if (personalEmail && typeof personalEmail === 'string' && personalEmail.trim()) {
      const cleanEmail = personalEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
      }
      updates.push('personal_email = ?');
      params.push(cleanEmail);
    }

    params.push(req.user.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    return res.json({ success: true, message: 'Your password and profile have been updated.' });
  } catch (err) {
    console.error('changePassword error:', err);
    return res.status(500).json({ success: false, message: 'Could not update your password.' });
  }
}

/** GET /api/auth/me */
async function me(req, res) {
  return res.json({ success: true, user: req.user });
}

/** GET /api/auth/profile — full profile details (email, section) for the logged-in user */
async function getProfile(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.role, u.id_number, u.first_name, u.middle_initial, u.last_name, u.email,
              u.personal_email, u.contact_number, u.address, u.profile_picture_url, u.program, u.enrollment_status,
              sec.grade_level, sec.name AS sectionName, st.code AS strandCode
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    const u = rows[0];
    if (!u) return res.status(404).json({ success: false, message: 'User not found.' });

    let advisorySection = null;
    if (u.role === 'Teacher' || u.role === 'teacher') {
      const [advRows] = await pool.query(
        `SELECT sec.name, sec.grade_level, st.code AS strandCode
         FROM sections sec
         LEFT JOIN strands st ON st.id = sec.strand_id
         WHERE sec.adviser_id = ? OR sec.co_adviser_id = ?
         LIMIT 1`,
        [req.user.id, req.user.id]
      );
      if (advRows[0]) {
        const adv = advRows[0];
        const parts = [];
        if (adv.grade_level) parts.push(`Grade ${adv.grade_level}`);
        if (adv.strandCode) parts.push(adv.strandCode);
        const prefix = parts.join(' - ');
        advisorySection = prefix ? `${prefix} (${adv.name})` : adv.name;
      }
    }

    return res.json({
      success: true,
      profile: {
        fullName: fullName(u),
        idNumber: u.id_number,
        email: u.email,
        personalEmail: u.personal_email,
        contactNumber: u.contact_number,
        address: u.address || '',
        role: u.role,
        program: u.program,
        enrollmentStatus: u.enrollment_status,
        profilePictureUrl: u.profile_picture_url,
        section: u.sectionName ? `Grade ${u.grade_level} - ${u.strandCode} (${u.sectionName})` : null,
        advisorySection,
      },
    });
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ success: false, message: 'Could not load profile.' });
  }
}

/**
 * PATCH /api/auth/profile  { personalEmail?, contactNumber?, address?, avatarBase64? }
 * Lets a student/teacher update contact info, address, personal email, or avatar.
 */
async function updateProfile(req, res) {
  const { personalEmail, contactNumber, address, avatarBase64 } = req.body;

  if (personalEmail !== undefined && personalEmail !== null && personalEmail !== '') {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(personalEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
  }

  if (contactNumber !== undefined && contactNumber !== null && contactNumber !== '') {
    const cleanNum = String(contactNumber).trim();
    if (/[a-zA-Z]/.test(cleanNum) || cleanNum.replace(/\D/g, '').length < 7) {
      return res.status(400).json({ success: false, message: 'Please enter a valid phone number.' });
    }
  }

  if (avatarBase64) {
    if (req.user.role === 'student') {
      return res.status(403).json({
        success: false,
        message: 'Students cannot change their profile picture. Official school ID photos are managed by teachers and administrators.',
      });
    }
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(avatarBase64)) {
      return res.status(400).json({ success: false, message: 'Profile picture must be a PNG, JPG, or WEBP image.' });
    }
  }

  try {
    const sets = [];
    const params = [];
    if (personalEmail !== undefined) {
      sets.push('personal_email = ?');
      params.push(personalEmail ? personalEmail.trim().toLowerCase() : null);
    }
    if (contactNumber !== undefined) {
      sets.push('contact_number = ?');
      params.push(contactNumber ? String(contactNumber).trim() : null);
    }
    if (address !== undefined) {
      sets.push('address = ?');
      params.push(address ? String(address).trim() : null);
    }
    if (avatarBase64) {
      sets.push('profile_picture_url = ?');
      params.push(avatarBase64);
    }
    if (!sets.length) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }
    params.push(req.user.id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

    return res.json({ success: true, message: 'Profile updated.' });
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ success: false, message: 'Could not update profile.' });
  }
}

/**
 * GET /api/auth/status-summary
 * Semester/year/section/strand/program/today's-attendance for the
 * student/teacher dashboards.
 */
async function getStatusSummary(req, res) {
  try {
    const [settingRows] = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('current_semester','school_year')"
    );
    const settings = Object.fromEntries(settingRows.map((r) => [r.setting_key, r.setting_value]));

    const [userRows] = await pool.query(
      `SELECT u.program, u.enrollment_status, sec.grade_level, sec.name AS sectionName, st.code AS strandCode
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    const u = userRows[0] || {};

    let presentStatus = null;
    let metrics = {};
    let recentActivity = [];
    let advisoryClass = null;

    if (req.user.role === 'student') {
      const today = getManilaDate();
      const [attRows] = await pool.query(
        'SELECT status, time_out_status FROM attendance_logs WHERE student_id = ? AND scan_date = ?',
        [req.user.id, today]
      );
      presentStatus = attRows[0] ? attRows[0].time_out_status || attRows[0].status : 'absent';

      // Overall Grade
      const [gradeRows] = await pool.query(
        'SELECT ROUND(AVG(average), 1) AS overallGrade FROM grades WHERE student_id = ?',
        [req.user.id]
      );
      const overallGrade = gradeRows[0]?.overallGrade !== null ? Number(gradeRows[0]?.overallGrade) : 0;

      // Attendance Rate
      const [attRateRows] = await pool.query(
        "SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) AS attRate FROM attendance_logs WHERE student_id = ?",
        [req.user.id]
      );
      const attendanceRate = attRateRows[0]?.attRate !== null ? Number(attRateRows[0]?.attRate) : 0;

      // Badges & Points (calculate actual earned badges and real sum of points from badge_catalog)
      const [badgeRows] = await pool.query(
        `SELECT COUNT(sb.badge_id) AS totalBadges,
                COALESCE(SUM(bc.points), 0) AS totalPoints
         FROM student_badges sb
         LEFT JOIN badge_catalog bc ON bc.id = sb.badge_id
         WHERE sb.student_id = ?`,
        [req.user.id]
      );
      const badgeCount = Number(badgeRows[0]?.totalBadges) || 0;
      const badgePoints = Number(badgeRows[0]?.totalPoints) || 0;

      metrics = {
        overallGrade,
        attendanceRate,
        badgeCount,
        badgePoints,
      };

      // Recent Activity
      const [attLogs] = await pool.query(
        `SELECT scan_date, scan_time, status
         FROM attendance_logs
         WHERE student_id = ?
         ORDER BY scan_date DESC, scan_time DESC LIMIT 3`,
        [req.user.id]
      );
      attLogs.forEach((l) => {
        recentActivity.push({
          type: 'attendance',
          title: `Attendance: ${l.status.toUpperCase()}`,
          description: `Talisay SHS Campus Gate QR Scanner recorded at ${l.scan_time || '07:30 AM'}`,
          date: l.scan_date,
          icon: 'bi-qr-code-scan',
          color: l.status === 'present' ? 'text-success' : 'text-warning',
        });
      });

      const [badgeLogs] = await pool.query(
        `SELECT sb.earned_at, bc.name AS badgeName
         FROM student_badges sb
         JOIN badge_catalog bc ON bc.id = sb.badge_id
         WHERE sb.student_id = ?
         ORDER BY sb.earned_at DESC LIMIT 2`,
        [req.user.id]
      );
      badgeLogs.forEach((b) => {
        recentActivity.push({
          type: 'badge',
          title: `Badge Unlocked: ${b.badgeName}`,
          description: 'Recognized for outstanding academic and class performance.',
          date: b.earned_at,
          icon: 'bi-award-fill',
          color: 'text-primary',
        });
      });

      if (recentActivity.length === 0) {
        recentActivity.push({
          type: 'system',
          title: 'Enrollment Confirmed',
          description: 'Officially enrolled in Talisay Senior High School.',
          date: new Date().toISOString(),
          icon: 'bi-check-circle-fill',
          color: 'text-success',
        });
      }
    } else if (req.user.role === 'teacher') {
      // Total Students across assigned sections
      const [studentCountRows] = await pool.query(
        `SELECT COUNT(DISTINCT u.id) AS totalStudents
         FROM users u
         JOIN schedules sch ON sch.section_id = u.section_id
         WHERE u.role = 'student' AND sch.teacher_id = ?`,
        [req.user.id]
      );
      let totalStudents = studentCountRows[0]?.totalStudents || 0;
      if (totalStudents === 0) {
        const [fallbackCount] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'student'");
        totalStudents = fallbackCount[0]?.total || 0;
      }

      // Class average
      const [avgRows] = await pool.query(
        `SELECT ROUND(AVG(g.average), 1) AS classAvg
         FROM grades g
         JOIN users u ON u.id = g.student_id
         JOIN schedules sch ON sch.section_id = u.section_id
         WHERE sch.teacher_id = ?`,
        [req.user.id]
      );
      const classAverage = avgRows[0]?.classAvg !== null ? Number(avgRows[0]?.classAvg) : 0;

      metrics = {
        totalStudents,
        classAverage,
        studentLabel: 'Total Students Handled',
      };

      // Teacher recent activities
      const [notes] = await pool.query(
        `SELECT en.id, en.absence_date, en.reason, en.status, en.created_at, u.first_name, u.last_name
         FROM excuse_notes en
         JOIN users u ON u.id = en.student_id
         ORDER BY en.created_at DESC LIMIT 3`
      );
      notes.forEach((n) => {
        recentActivity.push({
          type: 'excuse_note',
          title: `Excuse Note: ${n.first_name} ${n.last_name}`,
          description: `Reason: ${n.reason.length > 50 ? n.reason.slice(0, 50) + '...' : n.reason} (${n.status.toUpperCase()})`,
          date: n.created_at,
          icon: 'bi-envelope-paper-fill',
          color: n.status === 'pending' ? 'text-warning' : 'text-info',
        });
      });

      const [recentScans] = await pool.query(
        `SELECT al.scan_date, al.status, al.scan_time, u.first_name, u.last_name
         FROM attendance_logs al
         JOIN users u ON u.id = al.student_id
         ORDER BY al.scan_date DESC, al.scan_time DESC LIMIT 3`
      );
      recentScans.forEach((s) => {
        recentActivity.push({
          type: 'scan',
          title: `Gate QR Scan: ${s.first_name} ${s.last_name}`,
          description: `Marked ${s.status} at ${s.scan_time || '07:30 AM'}`,
          date: s.scan_date,
          icon: 'bi-qr-code-scan',
          color: 'text-success',
        });
      });

      // Teacher advisory section
      const [advRows] = await pool.query(
        `SELECT sec.id, sec.name, sec.grade_level, st.code AS strandCode
         FROM sections sec
         LEFT JOIN strands st ON st.id = sec.strand_id
         WHERE sec.adviser_id = ? OR sec.co_adviser_id = ?
         LIMIT 1`,
        [req.user.id, req.user.id]
      );
      if (advRows[0]) {
        const adv = advRows[0];
        const parts = [];
        if (adv.grade_level) parts.push(`Grade ${adv.grade_level}`);
        if (adv.strandCode) parts.push(adv.strandCode);
        const prefix = parts.join(' - ');
        advisoryClass = prefix ? `${prefix} (${adv.name})` : adv.name;
      }
    }

    return res.json({
      success: true,
      summary: {
        semester: settings.current_semester || null,
        schoolYear: settings.school_year || null,
        section: u.sectionName ? `Grade ${u.grade_level} - ${u.strandCode} (${u.sectionName})` : null,
        advisoryClass: advisoryClass || null,
        strand: u.strandCode || null,
        program: u.program || 'none',
        enrollmentStatus: u.enrollment_status || null,
        presentStatus,
        metrics,
        recentActivity,
      },
    });
  } catch (err) {
    console.error('getStatusSummary error:', err);
    return res.status(500).json({ success: false, message: 'Could not load status summary.' });
  }
}

module.exports = { login, logout, sendResetCode, verifyResetCode, verifyResetPhone, resetPassword, changePassword, me, getProfile, updateProfile, getStatusSummary };
