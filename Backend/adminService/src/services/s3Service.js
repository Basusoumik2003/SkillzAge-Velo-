import crypto from "crypto";
import { config } from "../config/config.js";

function requireS3Configured() {
  const c = config.s3;
  if (!c?.accessKeyId || !c?.secretAccessKey || !c?.region || !c?.bucketName) {
    const error = new Error("AWS S3 keys are not configured.");
    error.statusCode = 500;
    throw error;
  }
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function awsUriEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function signingKey(secretAccessKey, dateStamp, region) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function amzTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function safeSegment(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim().replace(/[^\w.\-]/g, "_"))
    .filter(Boolean)
    .join("/");
}

function safeExt(filename) {
  const match = String(filename || "")
    .toLowerCase()
    .match(/\.[a-z0-9]{1,12}$/);
  return match ? match[0] : "";
}

function buildObjectKey({ folder, filename, publicId }) {
  const folderPart = safeSegment(folder);
  let namePart = safeSegment(publicId || filename || `file_${Date.now()}`);
  if (!/\.[a-z0-9]{1,12}$/i.test(namePart)) {
    namePart += safeExt(filename);
  }
  return [folderPart, namePart].filter(Boolean).join("/");
}

function encodeObjectKey(key) {
  return key
    .split("/")
    .map((part) => awsUriEncode(part))
    .join("/");
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlTag(block, tag) {
  const match = String(block || "").match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? xmlDecode(match[1]) : "";
}

function parseListObjectsXml(xml) {
  const text = String(xml || "");
  const contents = [...text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => {
    const block = match[1] || "";
    return {
      key: xmlTag(block, "Key"),
      last_modified: xmlTag(block, "LastModified"),
      etag: xmlTag(block, "ETag").replace(/^"|"$/g, ""),
      size: Number(xmlTag(block, "Size")) || 0,
      storage_class: xmlTag(block, "StorageClass") || "",
    };
  }).filter((item) => item.key);
  return {
    objects: contents,
    is_truncated: xmlTag(text, "IsTruncated") === "true",
    next_continuation_token: xmlTag(text, "NextContinuationToken"),
    key_count: Number(xmlTag(text, "KeyCount")) || contents.length,
  };
}

function parseS3ErrorXml(xml) {
  const text = String(xml || "");
  const code = xmlTag(text, "Code");
  const message = xmlTag(text, "Message");
  return { code, message };
}

function s3RequestError({ action, response, body }) {
  const parsed = parseS3ErrorXml(body);
  const suffix = parsed.message
    ? ` ${parsed.code ? `${parsed.code}: ` : ""}${parsed.message}`
    : "";
  const error = new Error(`S3 ${action} failed (${response.status}).${suffix}`);
  error.statusCode = 502;
  error.detail = error.message;
  return error;
}

function signedHeadersForS3Request({ method, path, query = "" }) {
  requireS3Configured();
  const { accessKeyId, secretAccessKey, region, bucketName } = config.s3;
  const host = `${bucketName}.s3.${region}.amazonaws.com`;
  const payloadHash = sha256Hex("");
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    path,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(secretAccessKey, dateStamp, region),
    stringToSign,
    "hex",
  );
  return {
    host,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  };
}

export async function uploadToS3({
  buffer,
  filename,
  folder,
  publicId,
  contentType = "application/octet-stream",
}) {
  requireS3Configured();
  const { accessKeyId, secretAccessKey, region, bucketName } = config.s3;
  const publicRead = !!config.s3.publicRead;
  const body = Buffer.from(buffer);
  const objectKey = buildObjectKey({ folder, filename, publicId });
  const encodedKey = encodeObjectKey(objectKey);
  const host = `${bucketName}.s3.${region}.amazonaws.com`;
  const url = `https://${host}/${encodedKey}`;
  const payloadHash = sha256Hex(body);
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const normalizedContentType = contentType || "application/octet-stream";
  const canonicalHeaders =
    `content-type:${normalizedContentType}\n` +
    `host:${host}\n` +
    (publicRead ? "x-amz-acl:public-read\n" : "") +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = publicRead
    ? "content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date"
    : "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    `/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(secretAccessKey, dateStamp, region),
    stringToSign,
    "hex",
  );
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    Authorization: authorization,
    "Content-Type": normalizedContentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (publicRead) headers["x-amz-acl"] = "public-read";

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`S3 upload failed: ${response.status}`);
    error.statusCode = 502;
    error.detail = detail;
    throw error;
  }

  return {
    url,
    public_id: objectKey,
    key: objectKey,
    resource_type: "s3",
  };
}

export function createPresignedS3GetUrl({
  key,
  expiresSeconds = 600,
  responseContentDisposition = "",
  responseContentType = "",
}) {
  requireS3Configured();
  const { accessKeyId, secretAccessKey, sessionToken, region, bucketName } = config.s3;
  const objectKey = safeSegment(key);
  if (!objectKey) {
    const error = new Error("S3 object key is required.");
    error.statusCode = 400;
    throw error;
  }

  const encodedKey = encodeObjectKey(objectKey);
  const host = `${bucketName}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const expires = Math.max(60, Math.min(3600, Math.round(Number(expiresSeconds) || 600)));
  const credential = `${accessKeyId}/${credentialScope}`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  });
  if (sessionToken) params.set("X-Amz-Security-Token", sessionToken);
  const contentDisposition = String(responseContentDisposition || "").trim();
  const contentType = String(responseContentType || "").trim();
  if (contentDisposition) params.set("response-content-disposition", contentDisposition);
  if (contentType) params.set("response-content-type", contentType);
  const canonicalQuery = Array.from(params.entries())
    .map(([k, v]) => `${awsUriEncode(k)}=${awsUriEncode(v)}`)
    .sort()
    .join("&");
  const canonicalRequest = [
    "GET",
    `/${encodedKey}`,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(secretAccessKey, dateStamp, region),
    stringToSign,
    "hex",
  );
  return `https://${host}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export async function listS3Objects({
  prefix = "",
  continuationToken = "",
  maxKeys = 100,
} = {}) {
  requireS3Configured();
  const { bucketName } = config.s3;
  const safePrefix = safeSegment(prefix);
  const safeToken = String(continuationToken || "").trim();
  const limit = Math.max(1, Math.min(1000, Math.round(Number(maxKeys) || 100)));
  const params = new URLSearchParams({
    "list-type": "2",
    "max-keys": String(limit),
  });
  if (safePrefix) params.set("prefix", safePrefix);
  if (safeToken) params.set("continuation-token", safeToken);
  const canonicalQuery = Array.from(params.entries())
    .map(([k, v]) => `${awsUriEncode(k)}=${awsUriEncode(v)}`)
    .sort()
    .join("&");
  const { host, headers } = signedHeadersForS3Request({
    method: "GET",
    path: "/",
    query: canonicalQuery,
  });
  const response = await fetch(`https://${host}/?${canonicalQuery}`, {
    method: "GET",
    headers,
  });
  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw s3RequestError({ action: "list", response, body });
  }
  return {
    bucket: bucketName,
    prefix: safePrefix,
    ...parseListObjectsXml(body),
  };
}

export async function deleteS3Object({ key }) {
  requireS3Configured();
  const objectKey = safeSegment(key);
  if (!objectKey) {
    const error = new Error("S3 object key is required.");
    error.statusCode = 400;
    throw error;
  }
  const encodedKey = encodeObjectKey(objectKey);
  const { host, headers } = signedHeadersForS3Request({
    method: "DELETE",
    path: `/${encodedKey}`,
  });
  const response = await fetch(`https://${host}/${encodedKey}`, {
    method: "DELETE",
    headers,
  });
  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw s3RequestError({ action: "delete", response, body });
  }
  return { key: objectKey, deleted: true };
}

export async function s3ObjectExists({ key }) {
  requireS3Configured();
  const objectKey = safeSegment(key);
  if (!objectKey) return false;
  const encodedKey = encodeObjectKey(objectKey);
  const { host, headers } = signedHeadersForS3Request({
    method: "HEAD",
    path: `/${encodedKey}`,
  });
  const response = await fetch(`https://${host}/${encodedKey}`, {
    method: "HEAD",
    headers,
  });
  if (response.status === 404 || response.status === 403) return false;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw s3RequestError({ action: "availability check", response, body });
  }
  return true;
}

export async function requireS3ObjectAvailable({ key }) {
  const exists = await s3ObjectExists({ key });
  if (!exists) {
    const error = new Error("This data is not available.");
    error.statusCode = 404;
    throw error;
  }
  return true;
}

export async function fetchS3Object({ key }) {
  requireS3Configured();
  const objectKey = safeSegment(key);
  if (!objectKey) {
    const error = new Error("S3 object key is required.");
    error.statusCode = 400;
    throw error;
  }
  const encodedKey = encodeObjectKey(objectKey);
  const { host, headers } = signedHeadersForS3Request({
    method: "GET",
    path: `/${encodedKey}`,
  });
  const response = await fetch(`https://${host}/${encodedKey}`, {
    method: "GET",
    headers,
  });
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw s3RequestError({ action: "fetch", response, body: body.toString("utf8") });
  }
  return {
    key: objectKey,
    body,
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentLength: Number(response.headers.get("content-length")) || body.length,
  };
}
