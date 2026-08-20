import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createProxyHandler } from "./proxy/proxyRequest.js";
import apiRoutes from "./routes/apiRoutes.js";
import { config } from "./config.js";
import path from "path";
import { createLogger, logError, requestLogger } from "../../shared/nodeLogger.js";

const app = express();
const logger = createLogger("gatewayService");

app.use(helmet());
app.use(requestLogger("gatewayService"));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gatewayService" });
});

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

const authProxy = createProxyHandler({
  targetBaseUrl: config.services.auth,
  rewritePath: (originalUrl) => originalUrl.replace(/^\/auth(?=\/|$)/, "/api/auth")
});
const pythonProxy = createProxyHandler({ targetBaseUrl: config.services.python });
app.use("/auth", authProxy);
app.use("/chat", pythonProxy);
app.use("/project", pythonProxy);
app.use("/github", pythonProxy);
app.use("/deliverables", pythonProxy);
app.use("/api", apiRoutes);

app.use((err, req, res, _next) => {
  logError(logger, err, req);
  const statusCode = Number(err?.statusCode) || Number(err?.status) || 500;
  const detail = err?.detail || err?.message || "Internal server error.";
  res.status(statusCode).json({ detail, request_id: req.requestId });
});

export default app;

