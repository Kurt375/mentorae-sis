const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendOtpEmail } = require('../utils/mailer');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function fullName(user) {
  const mi = user.middle_initial ? ` ${user.middle_initial}` : '';
  return `${user.first_name}${mi} ${user.last_name}`;
}

/** POST /api/auth/login  { identity, password } */
async function login(req, res) {
  const { identity, password } = req.body;

  if (!identity || !password) {
    return res.status(400).json({ success: false, message: 'Please enter your email/ID and password.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE (email = ? OR id_number = ?) LIMIT 1',
      [identity, identity]
    );
    const user = rows[0];

    const logAttempt = async (success, userId = null) => {
      await pool.query(
        'INSERT INTO login_audit (user_id, id_number, success, ip_address) VALUES (?, ?, ?, ?)',
        [userId, identity, success ? 1 : 0, req.ip]
      );
    };

    if (!user) {
      await logAttempt(false);
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

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      const attempts = user.failed_attempts + 1;
      const lockUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;

      await pool.query('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [
        attempts,
        lockUntil,
        user.id,
      ]);
      await logAttempt(false, user.id);

      if (lockUntil) {
        return res.status(423).json({
          success: false,
          message: `Too many failed attempts. Your account is locked for ${LOCK_MINUTES} minutes.`,
        });
      }
      return res.status(401).json({ success: false, message: 'Incorrect email/ID or password.' });
    }

    await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    await logAttempt(true, user.id);

    const payload = {
      id: user.id,
      role: user.role,
      id_number: user.id_number,
      full_name: fullName(user),
      section_id: user.section_id,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    return res.json({ success: true, message: 'Login successful.', token, user: payload });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

async function logout(req, res) {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out.' });
}

/** POST /api/auth/forgot-password/send-code  { email } — Step 1 of the login page's modal */
async function sendResetCode(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Please enter your email address.' });
  }

  const genericResponse = { success: true, message: 'If that email is registered, a verification code has been sent.' };

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    if (!user) return res.json(genericResponse);

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + (Number(process.env.OTP_EXPIRES_MIN) || 10) * 60000);

    await pool.query('INSERT INTO password_resets (user_id, otp_hash, expires_at) VALUES (?, ?, ?)', [
      user.id,
      otpHash,
      expiresAt,
    ]);

    await sendOtpEmail(user.email, fullName(user), otp);

    return res.json(genericResponse);
  } catch (err) {
    console.error('sendResetCode error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

/** POST /api/auth/forgot-password/verify-code  { email, otp } — Step 2 */
async function verifyResetCode(req, res) {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: 'Missing email or code.' });
  }

  try {
    const [userRows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
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

    await pool.query('UPDATE password_resets SET verified = 1 WHERE id = ?', [resetRow.id]);

    // Short-lived token proving this email just verified an OTP, needed for step 3
    const resetToken = jwt.sign({ purpose: 'password_reset', userId: user.id, resetId: resetRow.id }, process.env.JWT_SECRET, {
      expiresIn: '10m',
    });

    return res.json({ success: true, message: 'Verification successful!', resetToken });
  } catch (err) {
    console.error('verifyResetCode error:', err);
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
    await pool.query('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', [
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

/** GET /api/auth/me */
async function me(req, res) {
  return res.json({ success: true, user: req.user });
}

/** GET /api/auth/profile — full profile details (email, section) for the logged-in user */
async function getProfile(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.role, u.id_number, u.first_name, u.middle_initial, u.last_name, u.email, u.contact_number,
              sec.grade_level, sec.name AS sectionName, st.code AS strandCode
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    const u = rows[0];
    if (!u) return res.status(404).json({ success: false, message: 'User not found.' });

    return res.json({
      success: true,
      profile: {
        fullName: fullName(u),
        idNumber: u.id_number,
        email: u.email,
        contactNumber: u.contact_number,
        role: u.role,
        section: u.sectionName ? `Grade ${u.grade_level} - ${u.strandCode} (${u.sectionName})` : null,
      },
    });
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ success: false, message: 'Could not load profile.' });
  }
}

module.exports = { login, logout, sendResetCode, verifyResetCode, resetPassword, me, getProfile };
