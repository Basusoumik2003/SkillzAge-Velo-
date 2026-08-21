import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { config } from "../config/config.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/auth/admin/check", requireAuth, async (req, res, next) => {
  try {
    const normalizedEmail = String(req.auth?.email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(403).json({
        success: false,
        detail: "Admin email is missing from authentication."
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        id,
        email,
        full_name,
        wix_member_id,
        created_at,
        updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [normalizedEmail]
    );

    if (!rows.length) {
      return res.status(403).json({
        success: false,
        detail: "Admin user not found."
      });
    }

    const user = rows[0];
    const adminCheck = await pool.query(
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

    if (!adminCheck.rows.length) {
      return res.status(403).json({
        success: false,
        detail: "Admin access denied."
      });
    }

    const admin = adminCheck.rows[0];

    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        detail: "Admin account is inactive."
      });
    }

    if (!admin.can_access_admin) {
      return res.status(403).json({
        success: false,
        detail: "Admin access is disabled."
      });
    }

    const adminToken = jwt.sign(
      {
        sub: String(user.id),
        email: normalizedEmail,
        role: "admin",
        admin: true
      },
      config.jwtSecretKey,
      {
        algorithm: "HS256",
        expiresIn: "15m"
      }
    );

    return res.json({
      success: true,
      isAdmin: true,
      adminToken,
      user: {
        id: user.id,
        wix_member_id: user.wix_member_id || "",
        email: user.email,
        full_name: user.full_name
      }
    });
  } catch (error) {
    console.error("[ADMIN AUTH] Error:", error);
    return next(error);
  }
});

export default router;
