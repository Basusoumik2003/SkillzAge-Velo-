const jwt = require("jsonwebtoken");

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ======================================================
// NORMAL AUTH
// ======================================================

function requireAuth(req, res, next) {

    if (
        process.env.BYPASS_ADMIN_AUTH ===
        "true"
    ) {
        req.auth = {
            userId:
                "fc0628de-1939-41e0-b28e-760e4473de68",
            email:
                "admin@example.com",
            role: "admin",
            admin: true,
            bypassed: true
        };

        return next();
    }

    const header =
        String(
            req.headers.authorization || ""
        );

    const [scheme, token] =
        header.split(" ");

    if (
        scheme !== "Bearer" ||
        !token
    ) {
        return res
            .status(401)
            .json({
                detail:
                    "Missing authorization token."
            });
    }

    try {

        let payload;

        try {

            payload =
                jwt.verify(
                    token,
                    process.env.JWT_SECRET,
                    {
                        algorithms: ["HS256"]
                    }
                );

        } catch (primaryError) {

            if (
                !process.env.JWT_SECRET_ALT
            ) {
                throw primaryError;
            }

            payload =
                jwt.verify(
                    token,
                    process.env.JWT_SECRET_ALT,
                    {
                        algorithms: ["HS256"]
                    }
                );
        }

        const userId =
            String(
                payload?.sub || ""
            );

        if (
            !UUID_PATTERN.test(userId)
        ) {
            return res
                .status(401)
                .json({
                    detail:
                        "Invalid authorization token."
                });
        }

        req.auth = {
            userId,

            // IMPORTANT:
            // Needed by /api/auth/admin/check
            email:
                String(
                    payload?.email || ""
                )
                    .trim()
                    .toLowerCase(),

            role:
                payload?.role || "user",

            admin:
                payload?.admin === true
        };

        console.log(
            "[AUTH] Authenticated:",
            {
                userId: req.auth.userId,
                email: req.auth.email,
                role: req.auth.role,
                admin: req.auth.admin
            }
        );

        return next();

    } catch (error) {

        console.error(
            "[AUTH] JWT verification failed:",
            error
        );

        return res
            .status(401)
            .json({
                detail:
                    "Invalid authorization token."
            });
    }
}


// ======================================================
// ADMIN ONLY
// ======================================================

function requireAdmin(
    req,
    res,
    next
) {

    if (
        process.env.BYPASS_ADMIN_AUTH ===
        "true"
    ) {
        return next();
    }

    if (
        req.auth?.admin !== true ||
        req.auth?.role !== "admin"
    ) {
        return res
            .status(403)
            .json({
                detail:
                    "Administrator access required."
            });
    }

    return next();
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
