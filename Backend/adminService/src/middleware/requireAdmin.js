import { pool } from "../config/db.js";
import { requireAuth } from "./auth.js";

export async function requireAdmin(req, res, next) {
  try {
    // =====================================================
    // FIRST: VERIFY NORMAL JWT
    // =====================================================

    await new Promise((resolve, reject) => {
      requireAuth(req, res, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    // =====================================================
    // GET EMAIL FROM JWT
    // =====================================================

    const email = String(
      req.auth?.email || ""
    )
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(403).json({
        success: false,
        detail: "Admin email is missing from authentication.",
      });
    }

    console.log(
      "[ADMIN AUTH] Checking admin email:",
      email
    );

    // =====================================================
    // CHECK ADMIN CREDENTIALS TABLE
    // =====================================================

    const result = await pool.query(
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

    // =====================================================
    // EMAIL NOT FOUND
    // =====================================================

    if (!result.rows.length) {
      console.warn(
        "[ADMIN AUTH] Admin email not found:",
        email
      );

      return res.status(403).json({
        success: false,
        detail: "Admin access denied.",
      });
    }

    const admin = result.rows[0];

    // =====================================================
    // ADMIN ACCOUNT DISABLED
    // =====================================================

    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        detail: "Admin account is inactive.",
      });
    }

    // =====================================================
    // ADMIN ACCESS DISABLED
    // =====================================================

    if (!admin.can_access_admin) {
      return res.status(403).json({
        success: false,
        detail: "Admin access is disabled.",
      });
    }

    // =====================================================
    // ADMIN VERIFIED
    // =====================================================

    req.admin = {
      id: admin.id,
      email: admin.email,
      can_access_admin: admin.can_access_admin,
      is_active: admin.is_active,
    };

    console.log(
      "[ADMIN AUTH] ✅ Admin verified:",
      admin.email
    );

    return next();

  } catch (error) {
    console.error(
      "[ADMIN AUTH] Verification error:",
      error
    );

    return res.status(500).json({
      success: false,
      detail: "Unable to verify admin access.",
    });
  }
}
