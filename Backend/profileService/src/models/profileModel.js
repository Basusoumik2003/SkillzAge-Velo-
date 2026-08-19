const db = require('../config/db');

const PROFILE_FIELDS = `
  id,
  user_id,
  age,
  education_level,
  country,
  state,
  city,
  skills,
  interests,
  available_hours_per_week,
  has_laptop,
  has_internet,
  has_team,
  has_funding,
  participation,
  current_idea,
  startup_stage,
  goals,
  created_at,
  updated_at
`;

function normalizeText(value, maxLength = 4000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeNumeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return false;
}

function normalizeParticipation(value) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (['individual', 'team', 'either'].includes(normalized)) {
    return normalized;
  }

  return 'individual';
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item, 120))
      .filter(Boolean);
  }

  const raw = String(value ?? '').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normalizeText(item, 120))
          .filter(Boolean);
      }
    } catch {
      // fall through to string splitting
    }
  }

  return raw
    .split(/[,;\n]/)
    .map((item) => normalizeText(item, 120))
    .filter(Boolean);
}

function normalizeProfileInput(profile = {}) {
  return {
    age: normalizeInteger(profile.age, null),
    educationLevel: normalizeText(profile.educationLevel ?? profile.education_level, 100),
    country: normalizeText(profile.country, 100),
    state: normalizeText(profile.state ?? profile.stateRegion ?? profile.state_region, 100),
    city: normalizeText(profile.city, 100),
    skills: normalizeTextArray(profile.skills),
    interests: normalizeTextArray(profile.interests),
    availableHoursPerWeek: normalizeNumeric(
      profile.availableHoursPerWeek ??
        profile.available_hours_per_week ??
        profile.available_time_hours_per_week,
      null,
    ),
    hasLaptop: normalizeBoolean(profile.hasLaptop ?? profile.has_laptop),
    hasInternet: normalizeBoolean(profile.hasInternet ?? profile.has_internet),
    hasTeam: normalizeBoolean(profile.hasTeam ?? profile.has_team),
    hasFunding: normalizeBoolean(profile.hasFunding ?? profile.has_funding),
    participation: normalizeParticipation(profile.participation),
    currentIdea: normalizeText(profile.currentIdea ?? profile.current_idea, 12000),
    startupStage: normalizeText(profile.startupStage ?? profile.startup_stage, 50),
    goals: normalizeTextArray(profile.goals),
  };
}

async function findByUserId(userId) {
  const { rows } = await db.query(
    `SELECT ${PROFILE_FIELDS}
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function upsertProfile(userId, profile) {
  const normalized = normalizeProfileInput(profile);

  const { rows } = await db.query(
    `INSERT INTO user_profiles (
      user_id,
      age,
      education_level,
      country,
      state,
      city,
      skills,
      interests,
      available_hours_per_week,
      has_laptop,
      has_internet,
      has_team,
      has_funding,
      participation,
      current_idea,
      startup_stage,
      goals,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16,
      $17, NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      age = EXCLUDED.age,
      education_level = EXCLUDED.education_level,
      country = EXCLUDED.country,
      state = EXCLUDED.state,
      city = EXCLUDED.city,
      skills = EXCLUDED.skills,
      interests = EXCLUDED.interests,
      available_hours_per_week = EXCLUDED.available_hours_per_week,
      has_laptop = EXCLUDED.has_laptop,
      has_internet = EXCLUDED.has_internet,
      has_team = EXCLUDED.has_team,
      has_funding = EXCLUDED.has_funding,
      participation = EXCLUDED.participation,
      current_idea = EXCLUDED.current_idea,
      startup_stage = EXCLUDED.startup_stage,
      goals = EXCLUDED.goals,
      updated_at = NOW()
    RETURNING ${PROFILE_FIELDS}`,
    [
      userId,
      normalized.age,
      normalized.educationLevel,
      normalized.country,
      normalized.state,
      normalized.city,
      normalized.skills,
      normalized.interests,
      normalized.availableHoursPerWeek,
      normalized.hasLaptop,
      normalized.hasInternet,
      normalized.hasTeam,
      normalized.hasFunding,
      normalized.participation,
      normalized.currentIdea,
      normalized.startupStage,
      normalized.goals,
    ]
  );

  return rows[0];
}

async function deleteProfile(userId) {
  const { rows } = await db.query(
    `DELETE FROM user_profiles
     WHERE user_id = $1
     RETURNING ${PROFILE_FIELDS}`,
    [userId]
  );

  return rows[0] || null;
}

module.exports = {
  findByUserId,
  upsertProfile,
  deleteProfile,
};
