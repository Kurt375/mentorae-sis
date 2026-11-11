const pool = require('../config/db');

/**
 * Returns the active academic term and date window configuration based on system_settings.
 * Defaults follow the DepEd Senior High School SY 2026-2027 Trimester Calendar.
 */
async function getActiveTermConfig() {
  try {
    const [rows] = await pool.query(
      `SELECT setting_key, setting_value FROM system_settings 
       WHERE setting_key IN ('current_semester', 'current_quarter', 'school_year', 
                             'term_1_start_date', 'term_1_end_date', 
                             'term_2_start_date', 'term_2_end_date', 
                             'term_3_start_date', 'term_3_end_date')`
    );
    const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    const currentTerm = map.current_semester || '2nd Term';
    const schoolYear = map.school_year || '2026 - 2027';

    let termStartDate = '2026-09-16';
    let termEndDate = '2026-11-30';

    if (currentTerm === '1st Term') {
      termStartDate = map.term_1_start_date || '2026-06-08';
      termEndDate = map.term_1_end_date || '2026-09-15';
    } else if (currentTerm === '2nd Term') {
      termStartDate = map.term_2_start_date || '2026-09-16';
      termEndDate = map.term_2_end_date || '2026-11-30';
    } else if (currentTerm === '3rd Term') {
      termStartDate = map.term_3_start_date || '2027-01-04';
      termEndDate = map.term_3_end_date || '2027-04-08';
    }

    return {
      currentTerm,
      schoolYear,
      termStartDate,
      termEndDate,
    };
  } catch (err) {
    console.error('getActiveTermConfig fallback due to error:', err.message);
    return {
      currentTerm: '2nd Term',
      schoolYear: '2026 - 2027',
      termStartDate: '2026-09-16',
      termEndDate: '2026-11-30',
    };
  }
}

module.exports = { getActiveTermConfig };

