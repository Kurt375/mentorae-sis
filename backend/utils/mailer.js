const nodemailer = require('nodemailer');
const pool = require('../config/db');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const DEFAULT_MAIL_FROM = process.env.MAIL_FROM || '"Mentorae Portal" <no-reply@tshs.edu.ph>';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPortalBaseUrl() {
  return process.env.PORTAL_BASE_URL || 'https://mentorae-sis-frontend.vercel.app';
}

function isDeliverableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  if (!emailRegex.test(clean)) return false;
  // Simulated internal domains that do not accept incoming SMTP internet email
  if (clean.endsWith('.tshs.edu.ph') || clean.endsWith('.talisay.shs')) {
    return false;
  }
  return true;
}

async function isEmailNotificationEnabled() {
  try {
    const [[setting]] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'notify_email'"
    );
    return !setting || setting.setting_value !== '0';
  } catch (err) {
    return true;
  }
}

async function getDeliverableEmailsForUser(userId) {
  if (!userId) return [];
  try {
    const [rows] = await pool.query(
      'SELECT id, first_name, last_name, role, email, personal_email FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!rows.length) return [];
    const u = rows[0];
    const emails = [];
    if (isDeliverableEmail(u.personal_email)) emails.push(u.personal_email.trim().toLowerCase());
    if (isDeliverableEmail(u.email)) emails.push(u.email.trim().toLowerCase());
    return [...new Set(emails)];
  } catch (err) {
    console.error('getDeliverableEmailsForUser error:', err.message);
    return [];
  }
}

async function getDeliverableEmailsForStudentAndParents(studentId) {
  if (!studentId) return { student: null, studentEmails: [], parentEmails: [], allEmails: [] };
  try {
    const [stRows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.id_number, u.email, u.personal_email,
              sec.name AS section_name, sec.grade_level
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       WHERE u.id = ? LIMIT 1`,
      [studentId]
    );
    if (!stRows.length) return { student: null, studentEmails: [], parentEmails: [], allEmails: [] };
    const student = stRows[0];
    student.fullName = `${student.first_name} ${student.last_name}`.trim();

    const studentEmails = [];
    if (isDeliverableEmail(student.personal_email)) studentEmails.push(student.personal_email.trim().toLowerCase());
    if (isDeliverableEmail(student.email)) studentEmails.push(student.email.trim().toLowerCase());

    const [parents] = await pool.query(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.personal_email
       FROM parent_student_links psl
       JOIN users p ON p.id = psl.parent_id
       WHERE psl.student_id = ? AND p.is_active = 1`,
      [studentId]
    );

    const parentEmails = [];
    parents.forEach(p => {
      if (isDeliverableEmail(p.personal_email)) parentEmails.push(p.personal_email.trim().toLowerCase());
      if (isDeliverableEmail(p.email)) parentEmails.push(p.email.trim().toLowerCase());
    });

    const uniqueStudent = [...new Set(studentEmails)];
    const uniqueParent = [...new Set(parentEmails)];
    const allEmails = [...new Set([...uniqueStudent, ...uniqueParent])];

    return {
      student,
      studentEmails: uniqueStudent,
      parentEmails: uniqueParent,
      allEmails,
    };
  } catch (err) {
    console.error('getDeliverableEmailsForStudentAndParents error:', err.message);
    return { student: null, studentEmails: [], parentEmails: [], allEmails: [] };
  }
}

function wrapEmailTemplate(title, preheader, bodyHtml) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)}</title>
      <style>
        @media only screen and (max-width: 600px) {
          .email-card { width: 100% !important; border-radius: 0 !important; }
          .email-inner { padding: 20px 16px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      ${preheader ? `<span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; font-size:0;">${escapeHtml(preheader)}</span>` : ''}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f3f4f6; padding: 24px 12px;">
        <tr>
          <td align="center">
            <table class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e5e7eb;">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #1f6f43 0%, #155734 100%); padding: 26px 24px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 1px;">MENTORAE</h1>
                  <p style="color: #d1fae5; margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1.6px; font-weight: 600;">
                    Talisay Senior High School • Analytics-Driven Student Portal
                  </p>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td class="email-inner" style="padding: 28px 26px; color: #374151; font-size: 14px; line-height: 1.6;">
                  ${bodyHtml}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 18px 24px; text-align: center; color: #6b7280; font-size: 11px; line-height: 1.5;">
                  <p style="margin: 0 0 6px 0; font-weight: 600; color: #4b5563;">
                    Talisay Senior High School • Mentorae SIS Platform
                  </p>
                  <p style="margin: 0; color: #9ca3af;">
                    This is an automated notification. If you have questions regarding your account or enrollment, please contact the school administration or your class adviser.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/** 1. Password Reset OTP Verification */
async function sendOtpEmail(toEmail, fullName, otp) {
  const bodyHtml = `
    <h2 style="color: #111827; margin: 0 0 12px; font-size: 20px; font-weight: 700;">Password Reset Request</h2>
    <p style="color: #4b5563; margin: 0 0 16px;">Hi <strong>${escapeHtml(fullName || 'there')}</strong>,</p>
    <p style="color: #4b5563; margin: 0 0 20px;">We received a request to reset your Mentorae password. Please use the 6-digit verification code below to complete the process:</p>
    
    <div style="text-align: center; margin: 28px 0; padding: 16px; background-color: #ecfdf5; border: 1px dashed #10b981; border-radius: 8px;">
      <span style="font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1f6f43;">${escapeHtml(otp)}</span>
    </div>
    
    <p style="color: #6b7280; font-size: 13px; margin: 0 0 12px;">This code will expire in <strong>${process.env.OTP_EXPIRES_MIN || 10} minutes</strong>. If you did not initiate this password reset, please ignore this email or notify your school administrator immediately.</p>
  `;

  const html = wrapEmailTemplate('Mentorae Verification Code', `Your password reset code is ${otp}`, bodyHtml);

  await transporter.sendMail({
    from: DEFAULT_MAIL_FROM,
    to: toEmail,
    subject: 'Your Mentorae Verification Code',
    html,
  });
}

/** 2. School Announcements */
async function sendAnnouncementEmail(recipients, announcement) {
  if (!recipients || !recipients.length) return;
  const enabled = await isEmailNotificationEnabled();
  if (!enabled) return;

  const { title, description, eventDate, type, audience } = announcement;
  const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Upcoming';
  const typeLabel = (type || 'Event').toUpperCase();
  const audienceLabel = audience === 'all' ? 'All Students, Teachers & Parents' : `${audience.charAt(0).toUpperCase() + audience.slice(1)}s`;

  const bodyHtml = `
    <div style="margin-bottom: 16px;">
      <span style="display: inline-block; background: #ecfdf5; color: #047857; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; border: 1px solid #a7f3d0; margin-right: 6px;">${escapeHtml(typeLabel)}</span>
      <span style="display: inline-block; background: #f3f4f6; color: #4b5563; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px;">Target: ${escapeHtml(audienceLabel)}</span>
    </div>
    <h2 style="color: #111827; margin: 0 0 12px; font-size: 21px; font-weight: 700; line-height: 1.3;">${escapeHtml(title)}</h2>
    <p style="color: #4b5563; font-size: 13px; margin: 0 0 18px;">
      📅 <strong>Event / Effective Date:</strong> ${escapeHtml(formattedDate)}
    </p>
    <div style="background: #f9fafb; border-left: 4px solid #1f6f43; padding: 18px; border-radius: 0 8px 8px 0; margin-bottom: 24px; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
${escapeHtml(description)}
    </div>
    <div style="text-align: center; margin: 26px 0 12px;">
      <a href="${getPortalBaseUrl()}/announcements.html" style="background-color: #1f6f43; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(31, 111, 67, 0.2);">
        View Official Announcement Board &rarr;
      </a>
    </div>
  `;

  const html = wrapEmailTemplate(`Announcement: ${title}`, `[School Announcement] ${title}`, bodyHtml);

  const batchSize = 45;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    try {
      await transporter.sendMail({
        from: DEFAULT_MAIL_FROM,
        to: DEFAULT_MAIL_FROM,
        bcc: batch,
        subject: `[Mentorae Announcement] ${title}`,
        html,
      });
    } catch (err) {
      console.error('Failed to send announcement email batch:', err.message);
    }
  }
}

/** 3. Attendance Updates (Check-In, Late, Absent, Excused, Check-Out, Early Leave, 7AM Cutoff) */
async function sendAttendanceEmail(opts) {
  const enabled = await isEmailNotificationEnabled();
  if (!enabled) return;

  const { studentId, status, time, date, remarks, isEarlyOut } = opts;
  const { student, allEmails } = await getDeliverableEmailsForStudentAndParents(studentId);
  if (!allEmails.length || !student) return;

  const formattedDate = date ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', weekday: 'long' }) : 'Today';
  const formattedTime = time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const sectionStr = [student.grade_level ? `Grade ${student.grade_level}` : '', student.section_name].filter(Boolean).join(' - ') || 'Senior High School';

  let badgeText = 'STATUS UPDATE';
  let badgeBg = '#ecfdf5';
  let badgeColor = '#065f46';
  let badgeBorder = '#a7f3d0';
  let statusHeadline = 'Attendance Recorded';
  let guidanceText = 'Attendance has been logged in the official school attendance ledger.';

  switch (String(status).toLowerCase()) {
    case 'present':
      badgeText = 'PRESENT (ON TIME)';
      badgeBg = '#ecfdf5';
      badgeColor = '#065f46';
      badgeBorder = '#a7f3d0';
      statusHeadline = 'Student Marked Present';
      guidanceText = 'The student was present during the morning homeroom and campus check-in.';
      break;
    case 'late':
      badgeText = 'LATE-PRESENT';
      badgeBg = '#fffbeb';
      badgeColor = '#92400e';
      badgeBorder = '#fde68a';
      statusHeadline = 'Student Arrived Late';
      guidanceText = `The student checked in after the 7:00 AM on-time cutoff (${formattedTime}). Please ensure timely arrival on campus.`;
      break;
    case 'absent':
      badgeText = 'RECORDED ABSENT';
      badgeBg = '#fef2f2';
      badgeColor = '#991b1b';
      badgeBorder = '#fecaca';
      statusHeadline = 'Absence Alert Recorded';
      guidanceText = 'The student was recorded absent during the school check-in. If this is an authorized absence, please submit an official excuse letter with valid proof via the Mentorae parent portal within 48 hours.';
      break;
    case 'excused':
      badgeText = 'EXCUSED ABSENCE';
      badgeBg = '#eff6ff';
      badgeColor = '#1e40af';
      badgeBorder = '#bfdbfe';
      statusHeadline = 'Absence Certified Excused';
      guidanceText = 'The student\'s absence excuse documentation has been officially reviewed and certified by the class adviser.';
      break;
    case 'early_leave':
      badgeText = 'EARLY DISMISSAL';
      badgeBg = '#fff7ed';
      badgeColor = '#9a3412';
      badgeBorder = '#fed7aa';
      statusHeadline = 'Early Campus Departure';
      guidanceText = `The student checked out from campus prior to official dismissal (${formattedTime}).`;
      break;
    case 'checked_out':
    case 'attendance_out':
      badgeText = 'CHECKED OUT';
      badgeBg = '#f3f4f6';
      badgeColor = '#374151';
      badgeBorder = '#d1d5db';
      statusHeadline = 'Campus Check-Out Confirmed';
      guidanceText = `The student has successfully checked out for the day at ${formattedTime}.`;
      break;
    case 'tardy_warning':
      badgeText = 'MORNING CUTOFF NOTICE';
      badgeBg = '#fffbeb';
      badgeColor = '#92400e';
      badgeBorder = '#fde68a';
      statusHeadline = '7:00 AM Attendance Alert';
      guidanceText = 'The 7:00 AM on-time scan window has closed. Any subsequent check-in today will be logged as late.';
      break;
  }

  const bodyHtml = `
    <div style="margin-bottom: 16px;">
      <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; border: 1px solid ${badgeBorder};">
        ${escapeHtml(badgeText)}
      </span>
    </div>
    
    <h2 style="color: #111827; margin: 0 0 6px; font-size: 20px; font-weight: 700;">${escapeHtml(statusHeadline)}</h2>
    <p style="color: #6b7280; font-size: 13px; margin: 0 0 20px;">${escapeHtml(formattedDate)} • ${escapeHtml(formattedTime)}</p>

    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; margin-bottom: 22px;">
      <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td width="35%" style="color: #6b7280; font-weight: 600;">Student Name:</td>
          <td style="color: #111827; font-weight: 700;">${escapeHtml(student.fullName)}</td>
        </tr>
        ${student.id_number ? `
        <tr>
          <td style="color: #6b7280; font-weight: 600;">LRN / Student ID:</td>
          <td style="color: #111827; font-family: monospace;">${escapeHtml(student.id_number)}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #6b7280; font-weight: 600;">Section & Grade:</td>
          <td style="color: #111827;">${escapeHtml(sectionStr)}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-weight: 600;">Time Logged:</td>
          <td style="color: #111827;">${escapeHtml(formattedTime)}</td>
        </tr>
        ${remarks ? `
        <tr>
          <td style="color: #6b7280; font-weight: 600; vertical-align: top;">Remarks / Note:</td>
          <td style="color: #111827; font-style: italic;">"${escapeHtml(remarks)}"</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="background-color: #ffffff; border-left: 4px solid #1f6f43; padding: 14px 16px; margin-bottom: 24px; font-size: 13px; color: #4b5563; line-height: 1.5;">
      ${escapeHtml(guidanceText)}
    </div>

    <div style="text-align: center; margin: 26px 0 10px;">
      <a href="${getPortalBaseUrl()}/Parent/attendance_parent.html" style="background-color: #1f6f43; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(31, 111, 67, 0.2);">
        View Full Attendance Ledger in Mentorae &rarr;
      </a>
    </div>
  `;

  const html = wrapEmailTemplate(`Attendance Alert: ${student.fullName} - ${badgeText}`, `[Attendance] ${student.fullName} was marked ${badgeText}`, bodyHtml);

  for (const email of allEmails) {
    try {
      await transporter.sendMail({
        from: DEFAULT_MAIL_FROM,
        to: email,
        subject: `[Mentorae Attendance] ${student.fullName}: ${badgeText} (${formattedDate})`,
        html,
      });
    } catch (err) {
      console.error(`Failed to send attendance email to ${email}:`, err.message);
    }
  }
}

/** 4. Topics Recommended by Teachers & Targeted Remedial Lessons */
async function sendInterventionEmail(opts) {
  const enabled = await isEmailNotificationEnabled();
  if (!enabled) return;

  const { studentId, teacherName, subjectName, topicTitle, note, isRecommendation } = opts;
  const { student, allEmails } = await getDeliverableEmailsForStudentAndParents(studentId);
  if (!allEmails.length || !student) return;

  const typeBadgeLabel = isRecommendation ? "TEACHER'S RECOMMENDATION" : 'TARGETED REMEDIAL LESSON';
  const badgeBg = isRecommendation ? '#ecfdf5' : '#fff7ed';
  const badgeColor = isRecommendation ? '#065f46' : '#c2410c';
  const badgeBorder = isRecommendation ? '#a7f3d0' : '#fed7aa';
  const actionTitle = isRecommendation ? 'Recommended Study Topic Assigned' : 'Remedial Intervention Lesson Assigned';

  const bodyHtml = `
    <div style="margin-bottom: 16px;">
      <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; border: 1px solid ${badgeBorder};">
        ${escapeHtml(typeBadgeLabel)}
      </span>
    </div>

    <h2 style="color: #111827; margin: 0 0 8px; font-size: 21px; font-weight: 700; line-height: 1.3;">
      ${escapeHtml(actionTitle)}
    </h2>
    <p style="color: #4b5563; font-size: 14px; margin: 0 0 20px;">
      Teacher <strong>${escapeHtml(teacherName || 'Your Teacher')}</strong> has assigned a targeted learning module to <strong>${escapeHtml(student.fullName)}</strong> to support academic mastery.
    </p>

    <!-- Assignment Details Box -->
    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 22px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 14px;">
        <tr>
          <td width="30%" style="color: #6b7280; font-weight: 600;">Subject:</td>
          <td style="color: #111827; font-weight: 700;">${escapeHtml(subjectName || 'Academic Subject')}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-weight: 600;">Assigned Topic:</td>
          <td style="color: #1f6f43; font-weight: 700; font-size: 15px;">${escapeHtml(topicTitle)}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-weight: 600;">Assigned By:</td>
          <td style="color: #111827;">Teacher ${escapeHtml(teacherName || 'Subject Teacher')}</td>
        </tr>
        ${student.section_name ? `
        <tr>
          <td style="color: #6b7280; font-weight: 600;">Section:</td>
          <td style="color: #111827;">${escapeHtml(student.section_name)}</td>
        </tr>` : ''}
      </table>
    </div>

    ${note && note.trim() ? `
    <!-- Teacher Note Callout -->
    <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 16px 18px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
      <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #854d0e; text-transform: uppercase; letter-spacing: 0.5px;">Teacher Instructions & Guidance:</p>
      <p style="margin: 0; font-size: 14px; color: #713f12; line-height: 1.5; font-style: italic;">
        "${escapeHtml(note.trim())}"
      </p>
    </div>` : ''}

    <!-- Recommended Next Steps Checklist -->
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin-bottom: 26px;">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #111827;">Recommended Action Checklist:</h3>
      <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 13px; line-height: 1.8;">
        <li>Review the attached concept notes and lesson summary.</li>
        <li>Practice with the interactive flashcard deck for this module.</li>
        <li>Complete the self-paced practice quiz to reinforce key concepts.</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 26px 0 10px;">
      <a href="${getPortalBaseUrl()}/Student/dashboard_student.html" style="background-color: #1f6f43; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 28px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(31, 111, 67, 0.25);">
        Open Learning Module in Mentorae &rarr;
      </a>
    </div>
  `;

  const html = wrapEmailTemplate(`Lesson Assigned: ${topicTitle}`, `[Mentorae Lesson] ${topicTitle} assigned by Teacher ${teacherName}`, bodyHtml);

  for (const email of allEmails) {
    try {
      await transporter.sendMail({
        from: DEFAULT_MAIL_FROM,
        to: email,
        subject: `[Mentorae] ${typeBadgeLabel}: ${topicTitle} (${subjectName || 'Subject'})`,
        html,
      });
    } catch (err) {
      console.error(`Failed to send intervention email to ${email}:`, err.message);
    }
  }
}

/** 5. Badges Awarded */
async function sendBadgeAwardedEmail(opts) {
  const enabled = await isEmailNotificationEnabled();
  if (!enabled) return;

  const { studentId, teacherName, badges } = opts;
  if (!badges || !badges.length) return;

  const { student, allEmails } = await getDeliverableEmailsForStudentAndParents(studentId);
  if (!allEmails.length || !student) return;

  const badgeNames = badges.map(b => b.name).join(', ');
  const totalPoints = badges.reduce((sum, b) => sum + (Number(b.points) || 10), 0);

  const badgeCardsHtml = badges.map(b => `
    <div style="background-color: #ffffff; border: 1px solid #fde68a; border-radius: 10px; padding: 16px; margin-bottom: 12px; display: flex; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size: 32px; margin-right: 16px; line-height: 1;">${escapeHtml(b.symbol || '⭐')}</div>
      <div style="flex: 1;">
        <h4 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #111827;">${escapeHtml(b.name)}</h4>
        <span style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 12px;">+${escapeHtml(b.points || 15)} Points</span>
      </div>
    </div>
  `).join('');

  const bodyHtml = `
    <div style="text-align: center; margin-bottom: 20px;">
      <span style="font-size: 44px;">🎉</span>
      <h2 style="color: #111827; margin: 10px 0 6px; font-size: 22px; font-weight: 800;">Congratulations, ${escapeHtml(student.fullName)}!</h2>
      <p style="color: #4b5563; font-size: 14px; margin: 0;">
        Teacher <strong>${escapeHtml(teacherName || 'Your Teacher')}</strong> has recognized your hard work and awarded you new achievement badge(s)!
      </p>
    </div>

    <!-- Badge Highlights -->
    <div style="background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <div style="text-align: center; margin-bottom: 14px;">
        <span style="display: inline-block; background-color: #f59e0b; color: #ffffff; font-size: 12px; font-weight: 800; text-transform: uppercase; padding: 4px 14px; border-radius: 20px; letter-spacing: 0.5px;">
          +${escapeHtml(totalPoints)} Total Points Earned!
        </span>
      </div>
      ${badgeCardsHtml}
    </div>

    <p style="color: #4b5563; font-size: 13px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
      Every badge you earn adds points to your overall standing on the class leaderboard and permanent academic portfolio in Mentorae. Keep up the remarkable effort!
    </p>

    <div style="text-align: center; margin: 26px 0 10px;">
      <a href="${getPortalBaseUrl()}/Student/dashboard_student.html" style="background-color: #1f6f43; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 28px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(31, 111, 67, 0.25);">
        View Your Achievements & Leaderboard &rarr;
      </a>
    </div>
  `;

  const html = wrapEmailTemplate(`New Badge Earned: ${badgeNames}`, `🎉 Congratulations! You earned the "${badgeNames}" badge(s)`, bodyHtml);

  for (const email of allEmails) {
    try {
      await transporter.sendMail({
        from: DEFAULT_MAIL_FROM,
        to: email,
        subject: `🎉 [Mentorae Achievement] New Badge Awarded: ${badgeNames}`,
        html,
      });
    } catch (err) {
      console.error(`Failed to send badge email to ${email}:`, err.message);
    }
  }
}

/** 6. Topic Request Status Updates (For Teachers / Curriculum Contributors) */
async function sendTopicRequestUpdateEmail(opts) {
  const enabled = await isEmailNotificationEnabled();
  if (!enabled) return;

  const { teacherId, topicTitle, subjectName, status, reason } = opts;
  const emails = await getDeliverableEmailsForUser(teacherId);
  if (!emails.length) return;

  const isApproved = status === 'approved';
  const badgeText = isApproved ? 'TOPIC REQUEST APPROVED' : 'REQUEST REVIEW UPDATE';
  const badgeBg = isApproved ? '#ecfdf5' : '#fef2f2';
  const badgeColor = isApproved ? '#065f46' : '#991b1b';
  const badgeBorder = isApproved ? '#a7f3d0' : '#fecaca';

  const bodyHtml = `
    <div style="margin-bottom: 16px;">
      <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; border: 1px solid ${badgeBorder};">
        ${escapeHtml(badgeText)}
      </span>
    </div>

    <h2 style="color: #111827; margin: 0 0 10px; font-size: 20px; font-weight: 700;">
      Curriculum Topic Request ${isApproved ? 'Approved' : 'Reviewed'}
    </h2>

    <p style="color: #4b5563; font-size: 14px; margin: 0 0 18px;">
      ${isApproved
        ? `Great news! Your request to introduce "<strong>${escapeHtml(topicTitle)}</strong>" to <strong>${escapeHtml(subjectName || 'the subject')}</strong> has been approved by the school administrator.`
        : `Your request to add topic "<strong>${escapeHtml(topicTitle)}</strong>" to <strong>${escapeHtml(subjectName || 'the subject')}</strong> was reviewed by the administrator.`}
    </p>

    ${reason && reason.trim() ? `
    <div style="background-color: #f9fafb; border-left: 4px solid #6b7280; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 22px;">
      <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #374151;">Administrator Feedback / Remarks:</p>
      <p style="margin: 0; font-size: 13px; color: #4b5563; font-style: italic;">
        "${escapeHtml(reason.trim())}"
      </p>
    </div>` : ''}

    <div style="text-align: center; margin: 26px 0 10px;">
      <a href="${getPortalBaseUrl()}/Teacher/dashboard_teacher.html" style="background-color: #1f6f43; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 8px; display: inline-block;">
        Open Teacher Dashboard &rarr;
      </a>
    </div>
  `;

  const html = wrapEmailTemplate(`Topic Request ${status}`, `Topic request "${topicTitle}" update`, bodyHtml);

  for (const email of emails) {
    try {
      await transporter.sendMail({
        from: DEFAULT_MAIL_FROM,
        to: email,
        subject: `[Mentorae] Topic Request ${isApproved ? 'Approved' : 'Update'}: ${topicTitle}`,
        html,
      });
    } catch (err) {
      console.error(`Failed to send topic request update email to ${email}:`, err.message);
    }
  }
}

/** 7. General System Notifications Fallback (Excuse Note results, Password Resets, etc.) */
async function sendGeneralNotificationEmail(opts) {
  const enabled = await isEmailNotificationEnabled();
  if (!enabled) return;

  const { recipientId, toEmail, title, message, type } = opts;
  let targetEmails = [];
  if (toEmail && isDeliverableEmail(toEmail)) {
    targetEmails = [toEmail.trim().toLowerCase()];
  } else if (recipientId) {
    targetEmails = await getDeliverableEmailsForUser(recipientId);
  }
  if (!targetEmails.length) return;

  const bodyHtml = `
    <h2 style="color: #111827; margin: 0 0 12px; font-size: 20px; font-weight: 700;">${escapeHtml(title)}</h2>
    <div style="background-color: #f9fafb; border-left: 4px solid #1f6f43; padding: 16px 18px; border-radius: 0 8px 8px 0; margin-bottom: 24px; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
${escapeHtml(message)}
    </div>
    <div style="text-align: center; margin: 24px 0 10px;">
      <a href="${getPortalBaseUrl()}" style="background-color: #1f6f43; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 8px; display: inline-block;">
        Open Mentorae Portal &rarr;
      </a>
    </div>
  `;

  const html = wrapEmailTemplate(title, title, bodyHtml);

  for (const email of targetEmails) {
    try {
      await transporter.sendMail({
        from: DEFAULT_MAIL_FROM,
        to: email,
        subject: `[Mentorae Notification] ${title}`,
        html,
      });
    } catch (err) {
      console.error(`Failed to send general notification email to ${email}:`, err.message);
    }
  }
}

module.exports = {
  transporter,
  isDeliverableEmail,
  isEmailNotificationEnabled,
  getDeliverableEmailsForUser,
  getDeliverableEmailsForStudentAndParents,
  sendOtpEmail,
  sendAnnouncementEmail,
  sendAttendanceEmail,
  sendInterventionEmail,
  sendBadgeAwardedEmail,
  sendTopicRequestUpdateEmail,
  sendGeneralNotificationEmail,
};
