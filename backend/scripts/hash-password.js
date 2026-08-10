/**
 * Utility: generate a bcrypt hash for a password, to paste into the
 * database directly (users.password_hash) without ever storing it in
 * plain text.
 *
 * Usage:
 *   node scripts/hash-password.js "MyStrongPassword123!"
 */
const bcrypt = require('bcrypt');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/hash-password.js "<password>"');
  process.exit(1);
}

bcrypt.hash(input, 10).then((hash) => {
  console.log('\nBcrypt hash:\n' + hash + '\n');
});
