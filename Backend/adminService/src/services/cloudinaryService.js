import crypto from "crypto";
import { config } from "../config/config.js";

function requireCloudinaryConfigured() {
  const c = config.cloudinary;
  if (!c?.cloudName || !c?.apiKey || !c?.apiSecret) {
    const error = new Error("Cloudinary keys are not configured.");
    error.statusCode = 500;
    throw error;
  }
}

function cloudinarySignature(params, apiSecret) {
  const sortedKeys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort();
  const toSign = sortedKeys.map((k) => `${k}=${params[k]}`).join("&") + apiSecret;
  return crypto.createHash("sha1").update(toSign).digest("hex");
}

export async function uploadToCloudinary({ buffer, filename, folder, resourceType = "auto", publicId }) {
  requireCloudinaryConfigured();
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder, public_id: publicId, timestamp };
  const signature = cloudinarySignature(params, apiSecret);

  const form = new FormData();
  const safeName = String(filename || "file").replace(/[^\w.\-]/g, "_");
  form.append("file", new Blob([buffer]), safeName);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  if (folder) form.append("folder", folder);
  if (publicId) form.append("public_id", publicId);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`;
  const resp = await fetch(endpoint, { method: "POST", body: form });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = new Error("Cloudinary upload failed.");
    error.statusCode = 502;
    error.detail = json;
    throw error;
  }

  return {
    url: json.secure_url || json.url || "",
    public_id: json.public_id || "",
    resource_type: json.resource_type || resourceType
  };
}
