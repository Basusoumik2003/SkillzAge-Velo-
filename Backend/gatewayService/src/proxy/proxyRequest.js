import { URL } from "url";

function isJsonContentType(contentType) {
  return String(contentType || "").toLowerCase().includes("application/json");
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export function createProxyHandler({ targetBaseUrl, rewritePath }) {
  const base = new URL(targetBaseUrl);

  return async function proxyHandler(req, res, next) {
    try {
      const requestPath = rewritePath ? rewritePath(req.originalUrl, req) : req.originalUrl;
      const targetUrl = new URL(requestPath, base);

      console.log("[GATEWAY PROXY]", {
        method: req.method,
        originalUrl: req.originalUrl,
        requestPath,
        targetBaseUrl,
        targetUrl: targetUrl.toString()
      });

      const headers = {};
      for (const [key, value] of Object.entries(req.headers || {})) {
        if (!value) continue;
        const lower = key.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lower)) continue;
        headers[key] = value;
      }

      const method = String(req.method || "GET").toUpperCase();
      let body;
      if (method !== "GET" && method !== "HEAD") {
        const contentType = String(req.headers["content-type"] || "");
        if (isJsonContentType(contentType) && req.body && typeof req.body === "object") {
          body = Buffer.from(JSON.stringify(req.body));
          if (!headers["content-type"] && !headers["Content-Type"]) {
            headers["content-type"] = "application/json";
          }
        } else if (Buffer.isBuffer(req.body)) {
          body = req.body;
        } else {
          body = await readRawBody(req);
        }
      }

      const upstream = await fetch(targetUrl.toString(), {
        method,
        headers,
        body
      });

      console.log("[GATEWAY PROXY RESPONSE]", {
        targetUrl: targetUrl.toString(),
        status: upstream.status
      });

      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === "transfer-encoding") return;
        if (lower === "content-length") return;
        res.setHeader(key, value);
      });

      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.send(buf);
    } catch (err) {
      return next(err);
    }
  };
}

