const db = require('../config/db');

/**
 * Find a user by email. Returns the full row (including password_hash)
 * because it's needed for login comparisons — never send this row to a client
 * without stripping the password hash first (see toPublicUser).
 */
async function findByEmail(email) {
  const { rows } = await db.query(
    'SELECT id, full_name, email, gender, password_hash, created_at, updated_at FROM users WHERE email = $1',
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(
    'SELECT id, full_name, email, gender, created_at, updated_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function createUser({ fullName, email, gender, passwordHash }) {
  const { rows } = await db.query(
    `INSERT INTO users (full_name, email, gender, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name, email, gender, created_at, updated_at`,
    [fullName, email, gender, passwordHash]
  );
  return rows[0];
}

/** Strips sensitive fields before a user record is sent in an API response. */
function toPublicUser(user) {
  if (!user) return null;
  const { password_hash, ...publicUser } = user;
  return publicUser;
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  toPublicUser,
};
