import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { PDFParse } from "pdf-parse";
import { config } from "../config/config.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKITDOWN_SCRIPT = path.resolve(__dirname, "../../../scripts/markitdown_convert.py");

const MAX_EXTRACTED_CHARS = 40000;
const PLAIN_TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json"];

function truncate(text) {
  return String(text || "").trim().slice(0, MAX_EXTRACTED_CHARS);
}

function extensionOf(filename) {
  const match = String(filename || "").toLowerCase().match(/\.[a-z0-9]{1,12}$/);
  return match ? match[0] : "";
}

/**
 * Converts a file via Microsoft's markitdown (PDF, DOCX, PPTX, XLSX, HTML,
 * images with captions, audio transcripts, ...). Returns "" instead of
 * throwing if markitdown isn't installed, times out, or can't handle the
 * format — callers fall back to a narrower extractor in that case.
 */
async function convertWithMarkitdown(buffer, filename) {
  const ext = extensionOf(filename) || ".bin";
  const tempPath = path.join(os.tmpdir(), `markitdown_${crypto.randomBytes(8).toString("hex")}${ext}`);
  try {
    await fs.writeFile(tempPath, buffer);
    const { stdout } = await execFileAsync(config.pythonExecutable || "python", [MARKITDOWN_SCRIPT, tempPath], {
      timeout: 60000,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    });
    return truncate(stdout);
  } catch {
    return "";
  } finally {
    fs.unlink(tempPath).catch(() => {});
  }
}

/**
 * Best-effort text extraction from an uploaded file buffer.
 * Tries markitdown first (broadest format coverage), then falls back to
 * pdf-parse for PDFs and a raw passthrough for plain-text-ish formats.
 * Anything else that all of those miss returns "" — the document still
 * uploads fine, it just won't be searchable yet.
 */
export async function extractTextFromFile({ buffer, filename, contentType }) {
  if (!buffer?.length) return "";

  const viaMarkitdown = await convertWithMarkitdown(buffer, filename);
  if (viaMarkitdown) return viaMarkitdown;

  const ext = extensionOf(filename);
  const isPdf = ext === ".pdf" || String(contentType || "").includes("pdf");
  if (isPdf) {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      return truncate(result.text);
    } catch {
      return "";
    }
  }

  if (PLAIN_TEXT_EXTENSIONS.includes(ext) || String(contentType || "").startsWith("text/")) {
    try {
      return truncate(buffer.toString("utf8"));
    } catch {
      return "";
    }
  }

  return "";
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function guessExtensionFromContentType(contentType) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("pdf")) return ".pdf";
  if (type.includes("wordprocessingml")) return ".docx";
  if (type.includes("presentationml")) return ".pptx";
  if (type.includes("spreadsheetml")) return ".xlsx";
  if (type.includes("html")) return ".html";
  return "";
}

/**
 * Best-effort fetch + text extraction for a URL source. Never throws —
 * a failed/slow fetch just means the source stays link-only.
 */
export async function extractTextFromUrl(url, { timeoutMs = 8000 } = {}) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) return "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, { signal: controller.signal });
    if (!response.ok) return "";
    const contentType = String(response.headers.get("content-type") || "");
    const buffer = Buffer.from(await response.arrayBuffer());

    const ext = guessExtensionFromContentType(contentType) || extensionOf(new URL(target).pathname);
    const viaMarkitdown = await convertWithMarkitdown(buffer, `source${ext || ".html"}`);
    if (viaMarkitdown) return viaMarkitdown;

    if (contentType.includes("pdf")) return extractTextFromFile({ buffer, filename: "source.pdf", contentType });
    const body = buffer.toString("utf8");
    if (contentType.includes("html")) return truncate(stripHtml(body));
    return truncate(body);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}
