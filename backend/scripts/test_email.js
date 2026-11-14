/**
 * Utility: test SMTP configuration and send a test notification email.
 *
 * Usage:
 *   node scripts/test_email.js [recipient@example.com]
 *
 * Example:
 *   node scripts/test_email.js your-personal-email@gmail.com
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.MAIL_FROM || `"Mentorae Portal" <${user}>`;
  const recipient = process.argv[2];

  console.log('--- Testing SMTP Configuration ---');
  console.log(`Host:     ${host}`);
  console.log(`Port:     ${port}`);
  console.log(`User:     ${user ? user : '(NOT SET)'}`);
  console.log(`Password: ${pass ? '******** (configured)' : '(NOT SET)'}`);
  console.log(`From:     ${from}`);

  if (!user || !pass) {
    console.error('\n[ERROR] SMTP_USER or SMTP_PASSWORD is not set in backend/.env.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    console.log('\nVerifying SMTP connection to Google servers...');
    await transporter.verify();
    console.log('[SUCCESS] SMTP connection verified! Authentication is valid.');
  } catch (err) {
    console.error('\n[FAILED] SMTP verification failed:');
    console.error(err.message);
    if (err.code === 'EAUTH') {
      console.error('\nTip: Google rejected authentication. Make sure:');
      console.error('1. 2-Step Verification is enabled on the Google Account.');
      console.error('2. You are using a 16-character Google App Password (not your normal Google account password).');
      console.error('3. There are no extra spaces or typos in SMTP_PASSWORD.');
    }
    process.exit(1);
  }

  if (recipient) {
    console.log(`\nSending test notification email to: ${recipient}...`);
    try {
      const info = await transporter.sendMail({
        from,
        to: recipient,
        subject: 'Mentorae SIS - Email Notification Test',
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #1f6f43;">Mentorae Notification System</h2>
            <p>This is a test email confirming that your Mentorae Gmail notification service is working properly.</p>
            <p><strong>Configured Sender:</strong> ${from}</p>
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          </div>
        `,
      });
      console.log(`[SUCCESS] Test email delivered successfully! Message ID: ${info.messageId}`);
    } catch (err) {
      console.error('\n[FAILED] Error sending test email:', err.message);
      process.exit(1);
    }
  } else {
    console.log('\nTo send an actual test email, run:');
    console.log('  node scripts/test_email.js your-email@example.com');
  }
}

testEmail();

