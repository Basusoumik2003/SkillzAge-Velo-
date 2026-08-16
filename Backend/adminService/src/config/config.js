import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: asNumber(process.env.ADMIN_PORT || process.env.PORT, 8004),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecretKey: process.env.JWT_SECRET_KEY || "change_me",
  jwtSecretKeyAlt: process.env.JWT_SECRET_KEY_ALT || "",
  jwtExpireMinutes: asNumber(process.env.JWT_EXPIRE_MINUTES, 120),
  corsOrigin:
    process.env.CORS_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
  s3: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    region: process.env.AWS_REGION || "",
    bucketName: process.env.AWS_BUCKET_NAME || "",
    publicRead:
      String(process.env.AWS_S3_PUBLIC_READ || "").toLowerCase() === "true",
  },
  services: {
    recommendation:
      process.env.RECOMMENDATION_SERVICE_URL || "http://127.0.0.1:8010",
    python:
      process.env.PYTHON_SERVICE_URL || process.env.BACKEND_SERVICE_URL || "http://127.0.0.1:8000",
  },
  pythonExecutable: process.env.PYTHON_EXECUTABLE || "python",
  autoIndexProjectDocuments:
    String(process.env.AUTO_INDEX_PROJECT_DOCUMENTS || "true").toLowerCase() !==
    "false",
  azureMail: {
    tenantId: process.env.TENANT_ID || "",
    clientId: process.env.CLIENT_ID || "",
    clientSecret: process.env.CLIENT_SECRET || "",
    mailbox: process.env.MAILBOX || "",
  },
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}
