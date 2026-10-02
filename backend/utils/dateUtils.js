// Manila (Philippine Standard Time, UTC+8) date and time utilities

const MANILA_TIMEZONE = 'Asia/Manila';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MANILA_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TIMEZONE,
  weekday: 'long',
});

/**
 * Returns the current date in Philippine Time (Asia/Manila) as 'YYYY-MM-DD'
 * @param {Date} [date=new Date()]
 * @returns {string} e.g. '2026-10-02'
 */
function getManilaDate(date = new Date()) {
  return dateFormatter.format(date);
}

/**
 * Returns the current time in Philippine Time (Asia/Manila) as 'HH:mm:ss' (24-hour)
 * @param {Date} [date=new Date()]
 * @returns {string} e.g. '08:34:00'
 */
function getManilaTime(date = new Date()) {
  return timeFormatter.format(date);
}

/**
 * Returns the day of the week in Philippine Time (Asia/Manila)
 * @param {Date} [date=new Date()]
 * @returns {string} e.g. 'Friday'
 */
function getManilaDayOfWeek(date = new Date()) {
  return dayOfWeekFormatter.format(date);
}

/**
 * Converts 'HH:mm:ss' or 'HH:mm' to total minutes from 00:00
 * @param {string} timeStr
 * @returns {number}
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map((v) => parseInt(v, 10) || 0);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

/**
 * Checks whether a given time is within a start and end window (inclusive).
 * Handles windows spanning across midnight if start > end.
 * @param {string} current 'HH:mm:ss' or 'HH:mm'
 * @param {string} start 'HH:mm:ss' or 'HH:mm'
 * @param {string} end 'HH:mm:ss' or 'HH:mm'
 * @returns {boolean}
 */
function isTimeWithinWindow(current, start, end) {
  if (!current || !start || !end) return true;
  const curMin = timeToMinutes(current);
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);

  if (startMin <= endMin) {
    return curMin >= startMin && curMin <= endMin;
  }
  // Span across midnight (e.g. 22:00 to 06:00)
  return curMin >= startMin || curMin <= endMin;
}

module.exports = {
  MANILA_TIMEZONE,
  getManilaDate,
  getManilaTime,
  getManilaDayOfWeek,
  timeToMinutes,
  isTimeWithinWindow,
};
