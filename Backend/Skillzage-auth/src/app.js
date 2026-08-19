const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const { notFound, errorHandler } = require("./middlewares/errorMiddleware");

const app = express();
const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || "http://127.0.0.1:5002";

function summarizeRequest(req) {
  return {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    contentType: req.headers["content-type"],
  };
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use((req, res, next) => {
  console.log("[service:http:incoming]", summarizeRequest(req));
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log("[service:http:completed]", {
      ...summarizeRequest(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

app.get("/health", (req, res) =>
  res.status(200).json({ success: true, message: "OK" }),
);

app.use("/api/auth", authRoutes);

app.use("/api/profile", async (req, res, next) => {
  try {
    const targetUrl = new URL(req.originalUrl, PROFILE_SERVICE_URL);
    const headers = {};

    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }
    if (req.headers["content-type"]) {
      headers["content-type"] = req.headers["content-type"];
    }
    if (req.headers.accept) {
      headers.accept = req.headers.accept;
    }

    const hasBody = !["GET", "HEAD"].includes(req.method);
    const upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody && req.body !== undefined ? JSON.stringify(req.body) : undefined,
    });

    res.status(upstreamResponse.status);

    const responseContentType = upstreamResponse.headers.get("content-type");
    if (responseContentType) {
      res.set("content-type", responseContentType);
    }

    const responseText = await upstreamResponse.text();
    return res.send(responseText);
  } catch (err) {
    return next(err);
  }
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
