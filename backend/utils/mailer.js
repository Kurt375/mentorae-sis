const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

async function sendOtpEmail(toEmail, fullName, otp) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background:#1f6f43; padding:20px; text-align:center; border-radius:8px 8px 0 0;">
        <h1 style="color:#fff; margin:0; font-size:22px;">MENTORAE</h1>
        <p style="color:#dff2e6; margin:4px 0 0; font-size:12px; letter-spacing:1px;">
          ANALYTICS-DRIVEN STUDENT PORTAL
        </p>
      </div>
      <div style="border:1px solid #e2e2e2; border-top:none; padding:24px; border-radius:0 0 8px 8px;">
        <p>Hi ${fullName || 'there'},</p>
        <p>Your password reset verification code is:</p>
        <p style="text-align:center; margin:28px 0;">
          <span style="font-size:32px; font-weight:bold; letter-spacing:8px; color:#1f6f43;">${otp}</span>
        </p>
        <p>This code expires in ${process.env.OTP_EXPIRES_MIN || 10} minutes. If you didn't request this, you can safely ignore this email.</p>
        <p style="color:#888; font-size:12px;">Talisay Senior High School • Mentorae Portal</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: toEmail,
    subject: 'Your Mentorae verification code',
    html,
  });
}

async function sendAnnouncementEmail(recipients, announcement) {
  if (!recipients || !recipients.length) return;
  const { title, description, eventDate, type, audience } = announcement;
  const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Upcoming';
  const typeLabel = (type || 'Event').toUpperCase();
  const audienceLabel = audience === 'all' ? 'All Students & Staff' : `${audience.charAt(0).toUpperCase() + audience.slice(1)}s`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1f6f43 0%, #155734 100%); padding: 26px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">MENTORAE</h1>
        <p style="color: #d1fae5; margin: 6px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px;">Talisay Senior High School • School Announcement</p>
      </div>
      <div style="padding: 28px 24px;">
        <div style="margin-bottom: 16px;">
          <span style="display: inline-block; background: #ecfdf5; color: #047857; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; border: 1px solid #a7f3d0; margin-right: 6px;">${typeLabel}</span>
          <span style="display: inline-block; background: #f3f4f6; color: #4b5563; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px;">Target: ${audienceLabel}</span>
        </div>
        <h2 style="color: #111827; margin: 0 0 12px; font-size: 20px; font-weight: 700; line-height: 1.3;">${title}</h2>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 18px;">
          📅 <strong>Event / Effective Date:</strong> ${formattedDate}
        </p>
        <div style="background: #f9fafb; border-left: 4px solid #1f6f43; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
${description}
        </div>
        <div style="text-align: center; margin: 28px 0 16px;">
          <p style="color: #4b5563; font-size: 13px; margin-bottom: 12px;">Visit the Mentorae portal to view the full details and live calendar.</p>
        </div>
        <p style="text-align: center; color: #9ca3af; font-size: 12px; margin: 20px 0 0;">
          You received this email because your email is registered in Mentorae SIS. If you are not a student, guardian, or staff of Talisay Senior High School, you may safely ignore this notification.
        </p>
      </div>
      <div style="background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 14px; text-align: center; color: #6b7280; font-size: 11px;">
        © 2026 Talisay Senior High School • Mentorae Analytics-Driven Student Portal
      </div>
    </div>
  `;

  // Send in BCC batches of up to 45 recipients
  const batchSize = 45;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM || '"Mentorae Portal" <no-reply@tshs.edu.ph>',
        bcc: batch,
        subject: `[Mentorae Announcement] ${title}`,
        html,
      });
    } catch (err) {
      console.error('Failed to send announcement email batch:', err.message);
    }
  }
}

module.exports = { sendOtpEmail, sendAnnouncementEmail };
