import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOriginList(value, fallback) {
  const raw = (value || fallback || "").trim();
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const config = {
  port: asNumber(process.env.PORT, 8001),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecretKey: process.env.JWT_SECRET_KEY || "change_me",
  jwtIssuer: process.env.JWT_ISSUER || "internlabs-auth-service",
  jwtAudience: process.env.JWT_AUDIENCE || "internlabs-api",
  jwtExpireMinutes: asNumber(process.env.JWT_EXPIRE_MINUTES, 120),
  refreshExpireDays: asNumber(process.env.REFRESH_EXPIRE_DAYS, 30),
  otpLength: asNumber(process.env.OTP_LENGTH, 6),
  otpExpiryMinutes: asNumber(process.env.OTP_EXPIRY_MINUTES, 10),
  otpMaxAttempts: asNumber(process.env.OTP_MAX_ATTEMPTS, 5),
  corsOrigins: asOriginList(
    process.env.CORS_ORIGIN,
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,https://internzbee.in,https://www.internzbee.in"
  ),
  services: {
    auth: process.env.AUTH_SERVICE_URL || "http://127.0.0.1:8002",
    profile: process.env.PROFILE_SERVICE_URL || "http://127.0.0.1:8003",
    admin: process.env.ADMIN_SERVICE_URL || "http://127.0.0.1:8004",
    user: process.env.USER_SERVICE_URL || "http://127.0.0.1:8008",
    contact: process.env.CONTACT_SERVICE_URL || "http://127.0.0.1:8005",
    payment: process.env.PAYMENT_SERVICE_URL || "http://127.0.0.1:8006",
    invoice: process.env.INVOICE_SERVICE_URL || "http://127.0.0.1:8080",
    python: process.env.PYTHON_SERVICE_URL || process.env.BACKEND_SERVICE_URL || "http://127.0.0.1:8000"
  },
  azureMail: {
    tenantId: process.env.TENANT_ID || "",
    clientId: process.env.CLIENT_ID || "",
    clientSecret: process.env.CLIENT_SECRET || "",
    mailbox: process.env.MAILBOX || ""
  },
  googleOauth: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || ""
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || ""
  }
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}


