import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/config.js";
import adminRoutes from "./routes/adminRoutes.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import startupRoutes from "./routes/startupRoutes.js";
import themeRoutes from "./routes/themeRoutes.js";
import { createLogger, logError, requestLogger } from "../../shared/nodeLogger.js";

const app = express();
const logger = createLogger("adminService");

app.use(helmet());
app.use(requestLogger("adminService"));

const allowedOrigins = String(config.corsOrigin || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!allowedOrigins.length) return callback(null, true);
      return callback(null, allowedOrigins.includes(origin));
    },
    credentials: true
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "adminService" });
});

app.use("/api", adminRoutes);
app.use("/api", adminAuthRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", startupRoutes);
app.use("/api", themeRoutes);
app.use("/api/admin", themeRoutes);

app.use((err, req, res, _next) => {
  logError(logger, err, req);
  const statusCode = Number(err?.statusCode) || Number(err?.status) || 500;
  const detail = err?.detail || err?.message || "Internal server error.";
  res.status(statusCode).json({ detail, request_id: req.requestId });
});

export default app;

