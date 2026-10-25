const https = require('https');

/**
 * Normalizes a Philippine phone number into standard 11-digit local format: 09XXXXXXXXX
 * Handles:
 *  - 09XXXXXXXXX
 *  - +639XXXXXXXXX
 *  - 639XXXXXXXXX
 *  - 9XXXXXXXXX
 *
 * @param {string} phone
 * @returns {string}
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) {
    return '0' + digits.slice(2);
  }
  if (digits.startsWith('9') && digits.length === 10) {
    return '0' + digits;
  }
  if (digits.startsWith('09') && digits.length === 11) {
    return digits;
  }
  return digits;
}

/**
 * Masks a phone number for UI display (e.g. 09108731513 -> 09••••••1513)
 *
 * @param {string} phone
 * @returns {string}
 */
function maskPhoneNumber(phone) {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized || normalized.length < 7) {
    return '••••••••';
  }
  const prefix = normalized.slice(0, 2);
  const suffix = normalized.slice(-4);
  const dotCount = Math.max(4, normalized.length - 6);
  const dots = '•'.repeat(dotCount);
  return `${prefix}${dots}${suffix}`;
}

/**
 * Sends an OTP via SMS using Semaphore API (Philippines),
 * with automatic fallback to simulated/dev mode if no API key is configured.
 *
 * @param {string} toPhone - The recipient's phone number
 * @param {string} fullName - Recipient's display name
 * @param {string} otp - The 6-digit verification code
 * @returns {Promise<{ success: boolean, simulated: boolean, message: string, providerResponse?: any }>}
 */
async function sendOtpSms(toPhone, fullName, otp) {
  const normalizedPhone = normalizePhoneNumber(toPhone);
  if (!normalizedPhone || normalizedPhone.length < 10) {
    throw new Error('Invalid mobile phone number. Please ensure it is an 11-digit Philippine mobile number.');
  }

  const apiKey = (process.env.SEMAPHORE_API_KEY || '').trim();
  const senderName = (process.env.SEMAPHORE_SENDER_NAME || '').trim();
  const expiresMin = process.env.OTP_EXPIRES_MIN || 10;
  const messageText = `MENTORAE: Your password reset verification code is ${otp}. Valid for ${expiresMin} minutes. Never share this code with anyone.`;

  // Dev / Simulation mode if no valid API key is set
  const isMock = !apiKey || apiKey === 'YOUR_SEMAPHORE_API_KEY' || apiKey === 'mock' || apiKey === 'demo';
  if (isMock) {
    console.log('\n==================================================');
    console.log('📱 [SMS SERVICE - DEV / SIMULATION MODE]');
    console.log(`Recipient : ${normalizedPhone} (${fullName || 'User'})`);
    console.log(`OTP Code  : [ ${otp} ]`);
    console.log(`Message   : "${messageText}"`);
    console.log('💡 Note: Set SEMAPHORE_API_KEY in .env to deliver real SMS messages.');
    console.log('==================================================\n');

    return {
      success: true,
      simulated: true,
      message: `[Simulated SMS] Verification code sent to ${maskPhoneNumber(normalizedPhone)} (Dev OTP: ${otp})`,
    };
  }

  // Real Semaphore API Dispatch
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      apikey: apiKey,
      number: normalizedPhone,
      message: messageText,
      ...(senderName ? { sendername: senderName } : {}),
    });

    const options = {
      hostname: 'api.semaphore.co',
      port: 443,
      path: '/api/v4/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[SMS SERVICE] Successfully dispatched SMS to ${normalizedPhone} via Semaphore:`, parsed);
            return resolve({
              success: true,
              simulated: false,
              message: `Verification code sent via SMS to ${maskPhoneNumber(normalizedPhone)}.`,
              providerResponse: parsed,
            });
          } else {
            console.error(`[SMS SERVICE] Semaphore API returned status ${res.statusCode}:`, data);
            const errDetail = Array.isArray(parsed) && parsed[0] && parsed[0].message
              ? parsed[0].message
              : parsed.message || parsed.error || `Semaphore API error ${res.statusCode}`;
            return reject(new Error(errDetail));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            return resolve({
              success: true,
              simulated: false,
              message: `Verification code sent via SMS to ${maskPhoneNumber(normalizedPhone)}.`,
            });
          }
          return reject(new Error(`Failed to parse Semaphore response: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[SMS SERVICE] Request to Semaphore failed:', err.message);
      reject(new Error(`SMS Gateway connection failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('SMS gateway request timed out. Please try again.'));
    });

    req.write(payload);
    req.end();
  });
}

module.exports = {
  sendOtpSms,
  normalizePhoneNumber,
  maskPhoneNumber,
};
