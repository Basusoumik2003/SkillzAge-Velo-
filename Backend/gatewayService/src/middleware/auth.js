import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || "");
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ detail: "Missing authorization token." });
  }

  try {
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecretKey, { algorithms: ["HS256"] });
    } catch (primaryError) {
      if (!config.jwtSecretKeyAlt) throw primaryError;
      payload = jwt.verify(token, config.jwtSecretKeyAlt, { algorithms: ["HS256"] });
    }
    const userId = Number(payload?.sub);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ detail: "Invalid authorization token." });
    }
    req.auth = { userId };
    return next();
  } catch {
    return res.status(401).json({ detail: "Invalid authorization token." });
  }
}
