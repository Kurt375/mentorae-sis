/**
 * Utility: create a user account directly in the database. Mainly used
 * to seed the very first admin account (chicken-and-egg problem — you
 * need an admin logged in to create users through the UI, but need a
 * user to log in as admin in the first place).
 *
 * Usage:
 *   node scripts/add-user.js <role> <idNumber> <firstName> <lastName> <email> <password> [contactNumber]
 *
 * Example:
 *   node scripts/add-user.js admin ADMIN-0001 System Administrator admin@talisayshs.edu.ph "ChangeMe123!" 09171234567
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function main() {
  const [role, idNumber, firstName, lastName, email, password, contactNumber] = process.argv.slice(2);
  const validRoles = ['student', 'teacher', 'parent', 'admin', 'security'];

  if (!role || !validRoles.includes(role) || !idNumber || !firstName || !lastName || !email || !password) {
    console.error(
      'Usage: node scripts/add-user.js <student|teacher|parent|admin|security> <idNumber> <firstName> <lastName> <email> <password> [contactNumber]'
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    'INSERT INTO users (role, id_number, first_name, last_name, contact_number, email, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [role, idNumber, firstName, lastName, contactNumber || null, email, passwordHash]
  );

  console.log(`Created ${role} account for ${firstName} ${lastName} (${idNumber} / ${email}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
