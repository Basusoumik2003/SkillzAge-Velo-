import crypto from "crypto";

export function generateOtp(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max + 1));
}

export function hashOtp(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function generateTokenId() {
  return crypto.randomUUID();
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
