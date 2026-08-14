import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function signAccessToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecretKey, {
    algorithm: "HS256",
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: `${config.jwtExpireMinutes}m`
  });
}

export function signRefreshToken(userId, tokenId) {
  return jwt.sign({ sub: String(userId), jti: tokenId, typ: "refresh" }, config.jwtSecretKey, {
    algorithm: "HS256",
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: `${config.refreshExpireDays}d`
  });
}
