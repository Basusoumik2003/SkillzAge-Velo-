const db = require('../config/db');

const USER_FIELDS = 'id, full_name, email, wix_member_id, created_at, updated_at';

async function findById(id) {
  const { rows } = await db.query(
    `SELECT ${USER_FIELDS}
     FROM users
     WHERE id = $1`,
    [id]
  );

  return rows[0] || null;
}

module.exports = {
  findById,
};
