import crypto from "crypto";

function parseHeaderParams(headerValue) {
  const parts = String(headerValue || "").split(";").map((part) => part.trim());
  const [type, ...rest] = parts;
  const params = {};
  for (const item of rest) {
    const [key, ...valueParts] = item.split("=");
    if (!key) continue;
    const value = valueParts.join("=").trim();
    params[key.toLowerCase()] = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  }
  return { type: type?.toLowerCase() || "", params };
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index;
  while ((index = buffer.indexOf(delimiter, start)) !== -1) {
    parts.push(buffer.slice(start, index));
    start = index + delimiter.length;
  }
  parts.push(buffer.slice(start));
  return parts;
}

export function parseMultipartFormData({ contentType, bodyBuffer }) {
  const { type, params } = parseHeaderParams(contentType);
  if (!type.includes("multipart/form-data") || !params.boundary) {
    throw new Error("Invalid multipart/form-data request.");
  }

  const boundary = Buffer.from(`--${params.boundary}`);
  const chunks = splitBuffer(bodyBuffer, boundary).slice(1, -1);

  const fields = {};
  const files = {};

  for (const chunk of chunks) {
    const trimmed = chunk.slice(chunk.indexOf(Buffer.from("\r\n")) + 2);
    if (!trimmed.length) continue;

    const headerEnd = trimmed.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headerRaw = trimmed.slice(0, headerEnd).toString("utf8");
    const content = trimmed.slice(headerEnd + 4, trimmed.length - 2); // strip trailing \r\n

    const headers = {};
    for (const line of headerRaw.split("\r\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }

    const disposition = headers["content-disposition"];
    if (!disposition) continue;
    const disp = parseHeaderParams(disposition);
    const name = disp.params.name;
    if (!name) continue;

    const filename = disp.params.filename;
    if (filename) {
      const fileType = headers["content-type"] || "application/octet-stream";
      files[name] = {
        filename,
        contentType: fileType,
        buffer: content,
        size: content.length,
        sha256: crypto.createHash("sha256").update(content).digest("hex")
      };
    } else {
      fields[name] = content.toString("utf8");
    }
  }

  return { fields, files };
}

