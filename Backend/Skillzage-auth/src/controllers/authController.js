const bcrypt = require("bcryptjs");
const userModel = require("../models/userModel");
const db = require("../config/db");
const { signToken } = require("../utils/jwt");

const SALT_ROUNDS = 10;

function maskSensitive(value) {
  if (Array.isArray(value)) {
    return value.map(maskSensitive);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (
          [
            "password",
            "confirmPassword",
            "passwordHash",
            "token",
            "adminToken",
            "authorization",
          ].includes(key)
        ) {
          return [key, "[REDACTED]"];
        }

        return [key, maskSensitive(entry)];
      })
    );
  }

  return value;
}

function logAuth(step, payload) {
  console.log(`[auth:${step}]`, maskSensitive(payload));
}

// ======================================================
// NORMAL USER JWT
// ======================================================

function tokenForUser(user) {
  return signToken({
    sub: String(user.id),
    id: user.id,
    email: user.email,
    wix_member_id: user.wix_member_id || null,
    role: "user",
    admin: false,
  });
}

// ======================================================
// ADMIN JWT
// ======================================================

function tokenForAdmin(user, admin) {
  return signToken({
    sub: String(user.id),
    id: user.id,
    email: user.email,
    wix_member_id: user.wix_member_id || null,
    role: "admin",
    admin: true,
    admin_id: admin.id,
  });
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizeWixPayload(body) {
  const wixMemberId = String(
    body.memberId ||
      body.wixMemberId ||
      body.wix_member_id ||
      ""
  ).trim();

  const email = normalizeEmail(body.email);

  const firstName = String(
    body.firstName ||
      body.first_name ||
      ""
  ).trim();

  const lastName = String(
    body.lastName ||
      body.last_name ||
      ""
  ).trim();

  const fallbackName = email
    ? email.split("@")[0]
    : "";

  const fullName = String(
    body.fullName ||
      body.full_name ||
      body.name ||
      `${firstName} ${lastName}`.trim() ||
      fallbackName
  ).trim();

  return {
    wixMemberId,
    email,
    fullName,
  };
}

// ======================================================
// SIGNUP
// ======================================================

async function signup(req, res, next) {
  try {
    const { fullName, email, password } = req.body;

    logAuth("signup:start", {
      body: req.body,
      fullName,
      email,
      passwordLength: String(password || "").length,
      headers: {
        "user-agent": req.headers["user-agent"],
        origin: req.headers.origin,
        referer: req.headers.referer,
      },
    });

    const existingUser =
      await userModel.findByEmail(email);

    logAuth("signup:existing-user", {
      email,
      found: Boolean(existingUser),
      existingUser,
    });

    if (existingUser) {
      logAuth("signup:duplicate-email", {
        email,
        existingUser,
      });

      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    logAuth("signup:creating-user", {
      fullName,
      email,
      passwordLength: String(password || "").length,
    });

    const passwordHash = await bcrypt.hash(
      password,
      SALT_ROUNDS
    );

    logAuth("signup:password-hashed", {
      email,
      hashLength: String(passwordHash || "").length,
    });

    const user = await userModel.createUser({
      fullName,
      email,
      passwordHash,
    });

    logAuth("signup:user-created", {
      email,
      user,
    });

    const token = tokenForUser(user);

    logAuth("signup:token-created", {
      email,
      userId: user && user.id,
      tokenLength: String(token || "").length,
    });

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      data: {
        user,
        token,
      },
    });
  } catch (err) {
    logAuth("signup:error", {
      message: err.message,
      stack: err.stack,
      body: req.body,
    });

    return next(err);
  }
}

// ======================================================
// LOGIN
// ======================================================

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    logAuth("login:start", {
      body: req.body,
      email,
      passwordLength: String(password || "").length,
      headers: {
        "user-agent": req.headers["user-agent"],
        origin: req.headers.origin,
        referer: req.headers.referer,
      },
      bypassAuth: process.env.BYPASS_AUTH,
    });

    if (process.env.BYPASS_AUTH === "true") {
      logAuth("login:bypass-auth-enabled", {
        email,
      });

      const normalizedEmail =
        normalizeEmail(email);

      logAuth("login:normalized-email", {
        email,
        normalizedEmail,
      });

      let user =
        await userModel.findByEmail(
          normalizedEmail
        );

      logAuth("login:bypass-existing-user", {
        normalizedEmail,
        found: Boolean(user),
        user,
      });

      if (!user) {
        logAuth("login:bypass-create-user", {
          normalizedEmail,
        });

        user = await userModel.createUser({
          fullName: "Development User",
          email: normalizedEmail,
          passwordHash: "",
        });

        logAuth("login:bypass-user-created", {
          normalizedEmail,
          user,
        });
      }

      const token = tokenForUser(user);

      logAuth("login:bypass-token-created", {
        normalizedEmail,
        userId: user && user.id,
        tokenLength: String(token || "").length,
      });

      return res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: userModel.toPublicUser(user),
          token,
        },
      });
    }

    logAuth("login:lookup-user", {
      email,
    });

    const user =
      await userModel.findAuthUserByEmail(
        email
      );

    logAuth("login:user-found", {
      email,
      found: Boolean(user),
      user,
      hasPasswordHash: Boolean(
        user && user.password_hash
      ),
    });

    if (!user) {
      logAuth("login:user-missing", {
        email,
      });

      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    logAuth("login:compare-password", {
      email,
      passwordLength: String(password || "")
        .length,
      hasPasswordHash: Boolean(
        user.password_hash
      ),
      hashLength: user.password_hash
        ? String(user.password_hash).length
        : 0,
    });

    const isMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    logAuth(
      "login:password-compare-result",
      {
        email,
        isMatch,
      }
    );

    if (!isMatch) {
      logAuth("login:password-mismatch", {
        email,
      });

      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    const token = tokenForUser(user);

    logAuth("login:token-created", {
      email,
      userId: user && user.id,
      tokenLength: String(token || "").length,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: userModel.toPublicUser(user),
        token,
      },
    });
  } catch (err) {
    logAuth("login:error", {
      message: err.message,
      stack: err.stack,
      body: req.body,
    });

    return next(err);
  }
}

// ======================================================
// WIX MEMBER SYNC
// ======================================================

async function syncWixMember(req, res, next) {
  try {
    const wixSyncSecret = req.headers["x-wix-sync-secret"];

    if (
      !wixSyncSecret ||
      wixSyncSecret !== process.env.WIX_SYNC_SECRET
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized Wix sync request.",
      });
    }

    const {
      wixMemberId,
      email,
      fullName,
    } = normalizeWixPayload(req.body);

    logAuth("wix-sync:start", {
      body: req.body,
      wixMemberId,
      email,
      fullName,
    });

    // ==================================================
    // VALIDATION
    // ==================================================

    if (!wixMemberId) {
      return res.status(400).json({
        success: false,
        message: "Wix member ID is required.",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    // ==================================================
    // CREATE / UPDATE NORMAL USER
    // ==================================================

    const user =
      await userModel.createOrUpdateWixUser({
        wixMemberId,
        email,
        fullName,
      });

    logAuth("wix-sync:user-upserted", {
      wixMemberId,
      email,
      user,
    });

    // ==================================================
    // CHECK ADMIN CREDENTIALS
    // ==================================================

    const adminResult = await db.query(
      `
      SELECT
        id,
        email,
        can_access_admin,
        is_active
      FROM admin_credentials
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email]
    );

    const admin =
      adminResult.rows[0] || null;

    const isAdmin =
      Boolean(admin) &&
      admin.is_active === true &&
      admin.can_access_admin === true;

    logAuth("wix-sync:admin-check", {
      email,
      adminFound: Boolean(admin),
      isActive: admin?.is_active,
      canAccessAdmin:
        admin?.can_access_admin,
      isAdmin,
    });

    // ==================================================
    // ADMIN USER
    // ==================================================

    if (isAdmin) {
      const adminToken =
        tokenForAdmin(user, admin);

      logAuth("wix-sync:admin-token-created", {
        email,
        userId: user.id,
        adminId: admin.id,
        tokenLength: String(
          adminToken || ""
        ).length,
      });

      return res.status(200).json({
        success: true,
        message: "Wix admin member synced",
        data: {
          user,
          isAdmin: true,

          // Admin frontend will store this
          // as skillzage_admin_token.
          adminToken,

          // Keep token too for compatibility.
          token: adminToken,
        },
      });
    }

    // ==================================================
    // NORMAL USER
    // ==================================================

    const token = tokenForUser(user);

    logAuth("wix-sync:user-token-created", {
      wixMemberId,
      email,
      userId: user && user.id,
      tokenLength: String(token || "").length,
    });

    return res.status(200).json({
      success: true,
      message: "Wix member synced",
      data: {
        user,
        isAdmin: false,
        token,
        adminToken: "",
      },
    });
  } catch (err) {
    logAuth("wix-sync:error", {
      message: err.message,
      stack: err.stack,
      body: req.body,
    });

    return next(err);
  }
}

// ======================================================
// ADMIN CHECK
//
// Called by the frontend right after a normal login to
// see whether this account is an approved administrator.
// Relies on requireAuth populating req.auth.email
// (see middlewares/authMiddleware.js).
// ======================================================

async function adminCheck(req, res, next) {
  try {
    const normalizedEmail = normalizeEmail(
      req.auth?.email
    );

    logAuth("admin-check:start", {
      email: normalizedEmail,
    });

    if (!normalizedEmail) {
      return res.status(403).json({
        success: false,
        message:
          "Admin email is missing from authentication.",
      });
    }

    const user = await userModel.findByEmail(
      normalizedEmail
    );

    logAuth("admin-check:user-lookup", {
      email: normalizedEmail,
      found: Boolean(user),
    });

    if (!user) {
      return res.status(403).json({
        success: false,
        message: "Admin user not found.",
      });
    }

    const adminResult = await db.query(
      `
      SELECT
        id,
        email,
        can_access_admin,
        is_active
      FROM admin_credentials
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [normalizedEmail]
    );

    const admin = adminResult.rows[0] || null;

    logAuth("admin-check:admin-lookup", {
      email: normalizedEmail,
      adminFound: Boolean(admin),
      isActive: admin?.is_active,
      canAccessAdmin: admin?.can_access_admin,
    });

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Admin access denied.",
      });
    }

    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        message: "Admin account is inactive.",
      });
    }

    if (!admin.can_access_admin) {
      return res.status(403).json({
        success: false,
        message: "Admin access is disabled.",
      });
    }

    const adminToken = tokenForAdmin(user, admin);

    logAuth("admin-check:admin-token-created", {
      email: normalizedEmail,
      userId: user && user.id,
      adminId: admin.id,
      tokenLength: String(adminToken || "").length,
    });

    return res.status(200).json({
      success: true,
      message: "Admin access confirmed",
      data: {
        isAdmin: true,
        adminToken,
        user,
      },
    });
  } catch (err) {
    logAuth("admin-check:error", {
      message: err.message,
      stack: err.stack,
    });

    return next(err);
  }
}

// ======================================================
// AUTHENTICATED USER
// ======================================================

async function me(req, res, next) {
  try {
    const user =
      await userModel.findById(
        req.user.id
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  signup,
  login,
  syncWixMember,
  adminCheck,
  me,
};