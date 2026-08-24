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

module.exports = { sendOtpEmail };
