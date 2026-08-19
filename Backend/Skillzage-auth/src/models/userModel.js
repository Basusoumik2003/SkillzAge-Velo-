const db = require('../config/db');

const PUBLIC_USER_FIELDS =
  'id, full_name, email, wix_member_id, created_at, updated_at';
const AUTH_USER_FIELDS =
  'id, full_name, email, password_hash, wix_member_id, created_at, updated_at';

function logUserModel(action, details) {
  console.log(`[userModel:${action}]`, details);
}

async function findByEmail(email) {
  logUserModel('findByEmail:start', { email });
  const { rows } = await db.query(
    `SELECT ${PUBLIC_USER_FIELDS}
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  const user = rows[0] || null;
  logUserModel('findByEmail:result', { email, found: Boolean(user), user });
  return user;
}

async function findAuthUserByEmail(email) {
  logUserModel('findAuthUserByEmail:start', { email });
  const { rows } = await db.query(
    `SELECT ${AUTH_USER_FIELDS}
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  const user = rows[0] || null;
  logUserModel('findAuthUserByEmail:result', {
    email,
    found: Boolean(user),
    user: user
      ? {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          wix_member_id: user.wix_member_id,
          hasPasswordHash: Boolean(user.password_hash),
        }
      : null,
  });
  return user;
}

async function findById(id) {
  logUserModel('findById:start', { id });
  const { rows } = await db.query(
    `SELECT ${PUBLIC_USER_FIELDS}
     FROM users
     WHERE id = $1`,
    [id]
  );

  const user = rows[0] || null;
  logUserModel('findById:result', { id, found: Boolean(user), user });
  return user;
}

async function findByWixMemberId(wixMemberId) {
  logUserModel('findByWixMemberId:start', { wixMemberId });
  const { rows } = await db.query(
    `SELECT ${PUBLIC_USER_FIELDS}
     FROM users
     WHERE wix_member_id = $1`,
    [wixMemberId]
  );

  const user = rows[0] || null;
  logUserModel('findByWixMemberId:result', { wixMemberId, found: Boolean(user), user });
  return user;
}

async function createUser({ fullName, email, passwordHash = '', wixMemberId = null }) {
  logUserModel('createUser:start', {
    fullName,
    email,
    hasPasswordHash: Boolean(passwordHash),
    wixMemberId,
  });

  const { rows } = await db.query(
    `INSERT INTO users (
      full_name,
      email,
      password_hash,
      wix_member_id
    )
    VALUES ($1, $2, $3, $4)
    RETURNING ${PUBLIC_USER_FIELDS}`,
    [fullName, email, passwordHash, wixMemberId]
  );

  const user = rows[0] || null;
  logUserModel('createUser:result', { email, user });
  return user;
}

async function createOrUpdateWixUser({
  wixMemberId,
  email,
  fullName
}) {
  logUserModel('createOrUpdateWixUser:start', {
    wixMemberId,
    email,
    fullName,
  });
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Check Wix Member ID
    const byWix = await client.query(
      `SELECT ${PUBLIC_USER_FIELDS}
       FROM users
       WHERE wix_member_id = $1
       FOR UPDATE`,
      [wixMemberId]
    );

    if (byWix.rows[0]) {

      const { rows } = await client.query(
        `UPDATE users
         SET
           full_name = COALESCE(NULLIF($2, ''), full_name),
           email = $3,
           updated_at = NOW()
         WHERE id = $1
         RETURNING ${PUBLIC_USER_FIELDS}`,
        [
          byWix.rows[0].id,
          fullName,
          email
        ]
      );

      await client.query('COMMIT');

      logUserModel('createOrUpdateWixUser:updated-by-wix', {
        wixMemberId,
        email,
        user: rows[0],
      });
      return rows[0];
    }

    // 2. Check email
    const byEmail = await client.query(
      `SELECT ${PUBLIC_USER_FIELDS}
       FROM users
       WHERE LOWER(email) = LOWER($1)
       FOR UPDATE`,
      [email]
    );

    if (byEmail.rows[0]) {

      const { rows } = await client.query(
        `UPDATE users
         SET
           wix_member_id = $2,
           full_name = COALESCE(NULLIF($3, ''), full_name),
           updated_at = NOW()
         WHERE id = $1
         RETURNING ${PUBLIC_USER_FIELDS}`,
        [
          byEmail.rows[0].id,
          wixMemberId,
          fullName
        ]
      );

      await client.query('COMMIT');

      logUserModel('createOrUpdateWixUser:updated-by-email', {
        wixMemberId,
        email,
        user: rows[0],
      });
      return rows[0];
    }

    // 3. New Wix user
    const { rows } = await client.query(
      `INSERT INTO users (
        full_name,
        email,
        wix_member_id
      )
      VALUES ($1, $2, $3)
      RETURNING ${PUBLIC_USER_FIELDS}`,
      [
        fullName,
        email,
        wixMemberId
      ]
    );

    await client.query('COMMIT');

    logUserModel('createOrUpdateWixUser:inserted', {
      wixMemberId,
      email,
      user: rows[0],
    });
    return rows[0];

  } catch (err) {

    await client.query('ROLLBACK');
    throw err;

  } finally {

    client.release();
  }
}

function toPublicUser(user) {
  if (!user) return null;
  return user;
}

module.exports = {
  findByEmail,
  findAuthUserByEmail,
  findById,
  findByWixMemberId,
  createUser,
  createOrUpdateWixUser,
  toPublicUser
};
