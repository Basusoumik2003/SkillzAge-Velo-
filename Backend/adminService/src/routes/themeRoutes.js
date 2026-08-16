import express from "express";
import crypto from "crypto";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { parseMultipartFormData } from "../utils/multipart.js";
import { createPresignedS3GetUrl, uploadToS3 } from "../services/s3Service.js";

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const pages = new Set(["global", "home", "dashboard", "login", "signup", "about", "contact", "projects", "tracks", "workspace", "profile", "footer", "navbar"]);
const positions = new Set(["top", "bottom", "top_left", "top_right", "bottom_left", "bottom_right", "left_edge", "right_edge", "center_left", "center_right", "floating"]);
const bannerPages = new Set(["home", "dashboard", "login", "signup", "about", "contact", "projects", "tracks"]);
const statuses = new Set(["draft", "scheduled", "published", "archived"]);
const placementSlots = new Set(["navbar_left", "navbar_center", "navbar_right", "navbar_bottom", "navbar_strip", "navbar_under", "hero_left", "hero_top", "hero_right", "page_top", "page_bottom", "footer_left", "footer_top", "footer_right", "floating", "page_background"]);
function normalizePlacementSlot(value, fallback = "floating") {
  const placement = clean(value || fallback, 40);
  return placementSlots.has(placement) || positions.has(placement) ? placement : fallback;
}
function pageForPlacement(placement, page = "global") {
  if (String(placement || "").startsWith("navbar")) return "navbar";
  if (String(placement || "").startsWith("footer")) return "footer";
  if (page === "navbar" || page === "footer") return "global";
  return pages.has(page) ? page : "global";
}
function positionForPlacement(placement, fallback = "floating") {
  if (["navbar_bottom", "footer_bottom", "page_bottom"].includes(placement)) return "bottom";
  if (["hero_top", "footer_top", "page_top"].includes(placement)) return "top";
  return positions.has(fallback) && fallback !== "top" && fallback !== "bottom" ? fallback : "floating";
}

async function requireAdmin(req) {
  const { rows } = await pool.query("SELECT ac.id FROM users u INNER JOIN admin_credentials ac ON LOWER(ac.email) = LOWER(u.email) WHERE u.id = $1 LIMIT 1", [req.auth.userId]);
  if (!rows.length) { const error = new Error("Administrator access required."); error.statusCode = 403; throw error; }
}
function clean(value, max = 255) { return String(value ?? "").trim().slice(0, max); }
function slugify(value) { return clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 170) || `theme-${crypto.randomUUID().slice(0, 8)}`; }
function bool(value, fallback = true) { if (value === undefined || value === null || value === "") return fallback; return value === true || String(value).toLowerCase() === "true"; }
function numberOrNull(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function numberOrDefault(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed) : fallback; }
function canonicalAssetUrl(value) { try { const parsed = new URL(String(value || "")); parsed.search = ""; parsed.hash = ""; return parsed.toString(); } catch { return value; } }
function signedAssetUrl(value) { try { const parsed = new URL(String(value || "")); const key = decodeURIComponent(parsed.pathname).split("/").filter(Boolean).join("/"); return key ? createPresignedS3GetUrl({ key, expiresSeconds: 900 }) : value; } catch { return value; } }
function parseTheme(row, assets, decorations, settings) { return { ...row, assets: assets.map((asset) => ({ ...asset, file_url: signedAssetUrl(asset.file_url) })), decorations: decorations.map((item) => ({ ...item, image_url: signedAssetUrl(item.image_url) })), settings: settings || { show_top_decoration: true, show_bottom_decoration: true, show_side_decorations: true, show_banner: true, show_popup: false } }; }
function normalizeThemeId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
async function getTheme(id, client = pool) {
  const normalizedId = normalizeThemeId(id);
  if (!normalizedId) return null;
  const theme = (await client.query("SELECT * FROM themes WHERE id=$1 LIMIT 1", [normalizedId])).rows[0];
  if (!theme) return null;
  const [assets, decorations, settings] = await Promise.all([
    client.query("SELECT * FROM theme_assets WHERE theme_id=$1 ORDER BY id", [normalizedId]),
    client.query("SELECT * FROM theme_decorations WHERE theme_id=$1 ORDER BY id", [normalizedId]),
    client.query("SELECT * FROM theme_settings WHERE theme_id=$1", [normalizedId])
  ]);
  return parseTheme(theme, assets.rows, decorations.rows, settings.rows[0]);
}
function normalizePayloadBody(body, fallback = {}) {
  if (!body || typeof body !== "object") return fallback;
  if (body.config && typeof body.config === "string") {
    try {
      const parsedConfig = JSON.parse(body.config);
      if (parsedConfig && typeof parsedConfig === "object") {
        return { ...fallback, ...parsedConfig, config: body.config };
      }
    } catch {
      // fall through to the direct body fields below
    }
  }
  if (body.fields && typeof body.fields === "object") {
    return { ...fallback, ...body.fields };
  }
  return { ...fallback, ...body };
}
function payload(body, fallback = {}) {
  const source = normalizePayloadBody(body, fallback);
  const name = clean(source.name, 160); if (!name) { const error = new Error("Theme name is required."); error.statusCode = 400; throw error; }
  const start = source.start_date ? new Date(source.start_date) : null; const end = source.end_date ? new Date(source.end_date) : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime())) || (start && end && end < start)) { const error = new Error("Theme dates are invalid."); error.statusCode = 400; throw error; }
  return { name, slug: slugify(source.slug || name), description: clean(source.description, 5000), status: statuses.has(source.status) ? source.status : "draft", start, end, category: clean(source.category || "Seasonal", 80), thumbnail_url: clean(source.thumbnail_url, 5000), tokens: source.tokens && typeof source.tokens === "object" ? source.tokens : {} };
}
function parseRequest(req) { const contentType = String(req.headers["content-type"] || ""); return contentType.includes("multipart/form-data") ? parseMultipartFormData({ contentType, bodyBuffer: req.body }) : { fields: req.body || {}, files: {} }; }
function parsedConfig(fields = {}) { return normalizePayloadBody(fields, fields); }
async function libraryUrl(client, assetId) {
  const id = Number(assetId);
  if (!Number.isInteger(id) || id <= 0) return "";
  const { rows } = await client.query("SELECT file_url FROM theme_asset_library WHERE id=$1 LIMIT 1", [id]);
  return rows[0]?.file_url || "";
}
async function collectUploads(parsed, themeId) {
  const uploads = {};
  for (const [key, file] of Object.entries(parsed.files || {})) {
    if (!file?.buffer?.length) continue;
    if (!String(file.contentType).startsWith("image/")) { const error = new Error("Only image uploads are supported."); error.statusCode = 400; throw error; }
    uploads[key] = await uploadToS3({ buffer: file.buffer, filename: file.filename, folder: `themes/${themeId}`, publicId: `${Date.now()}-${crypto.randomUUID()}`, contentType: file.contentType });
  }
  return uploads;
}
async function saveThemeAssets(client, themeId, parsed) {
  const config = parsedConfig(parsed.fields);
  const uploads = await collectUploads(parsed, themeId);
  await client.query("DELETE FROM theme_assets WHERE theme_id=$1", [themeId]);
  await client.query("DELETE FROM theme_decorations WHERE theme_id=$1", [themeId]);

  const banners = Array.isArray(config.banners) ? config.banners : [];
  for (const [index, item] of banners.entries()) {
    const key = `banner:${index}`;
    const page = clean(parsed.fields?.[`${key}:page`] || item.page, 40);
    if (!bannerPages.has(page)) continue;
    const libraryFileUrl = await libraryUrl(client, item.asset_id);
    const fileUrl = canonicalAssetUrl(uploads[key]?.url || libraryFileUrl || clean(item.file_url, 5000));
    if (!fileUrl) continue;
    await client.query("INSERT INTO theme_assets(theme_id,asset_type,page,file_url,alt_text,asset_id) VALUES($1,'banner',$2,$3,$4,$5)", [themeId, page, fileUrl, clean(parsed.fields?.[`${key}:alt_text`] || item.alt_text), numberOrNull(item.asset_id)]);
  }

  const decorations = Array.isArray(config.decorations) ? config.decorations : [];
  for (const [index, item] of decorations.entries()) {
    const key = `decoration:${index}`;
    const upload = uploads[key];
    const rawPage = clean(parsed.fields?.[`${key}:page`] || item.page || "global", 40);
    const rawPosition = parsed.fields?.[`${key}:position`] || item.position || "floating";
    const placement = normalizePlacementSlot(item.placement_slot || rawPosition, "floating");
    const safePage = pageForPlacement(placement, rawPage);
    const position = positionForPlacement(placement, rawPosition);
    const libraryFileUrl = await libraryUrl(client, item.asset_id);
    const fileUrl = canonicalAssetUrl(upload?.url || libraryFileUrl || clean(item.image_url || item.file_url, 5000));
    if (!fileUrl) continue;
    await client.query(
      "INSERT INTO theme_decorations(theme_id,name,image_url,page,position,width,height,z_index,enabled,asset_id,placement_slot,offset_x,offset_y,desktop_visible,tablet_visible,mobile_visible,animation_type,animation_duration_ms,animation_amplitude,blend_light_background) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",
      [themeId, clean(parsed.fields?.[`${key}:name`] || item.name || upload?.filename || "Decoration", 160), fileUrl, safePage, position, Math.max(1, Math.min(2400, numberOrDefault(parsed.fields?.[`${key}:width`] || item.width, 160))), numberOrNull(parsed.fields?.[`${key}:height`] || item.height), numberOrDefault(parsed.fields?.[`${key}:z_index`] || item.z_index, 70), bool(parsed.fields?.[`${key}:enabled`] ?? item.enabled, true), numberOrNull(item.asset_id), placement, numberOrDefault(item.offset_x, 0), numberOrDefault(item.offset_y, 0), bool(item.desktop_visible, true), bool(item.tablet_visible, true), bool(item.mobile_visible, true), ["none", "pendulum"].includes(item.animation_type) ? item.animation_type : "none", Math.max(600, Math.min(12000, numberOrDefault(item.animation_duration_ms, 2800))), Math.max(1, Math.min(45, numberOrDefault(item.animation_amplitude, 10))), bool(item.blend_light_background, false)]
    );
  }
}

async function backfillThemeAssetLibrary() {
  await pool.query(`
    INSERT INTO theme_asset_library(name, asset_type, file_url, file_key, mime_type, file_size_bytes, checksum)
    SELECT DISTINCT
      COALESCE(NULLIF(name, ''), fallback_name) AS name,
      asset_type,
      file_url,
      '',
      'image/*',
      0,
      LPAD(MD5(asset_type || ':' || split_part(file_url, '?', 1)), 64, '0') AS checksum
    FROM (
      SELECT COALESCE(alt_text, '') AS name, 'banner' AS asset_type, file_url, 'Theme banner' AS fallback_name
      FROM theme_assets
      WHERE COALESCE(file_url, '') <> ''
      UNION ALL
      SELECT COALESCE(name, '') AS name, 'decoration' AS asset_type, image_url AS file_url, 'Theme decoration' AS fallback_name
      FROM theme_decorations
      WHERE COALESCE(image_url, '') <> ''
    ) source
    ON CONFLICT (checksum) DO NOTHING
  `);
  await pool.query(`
    UPDATE theme_assets ta
    SET asset_id = lib.id
    FROM theme_asset_library lib
    WHERE ta.asset_id IS NULL
      AND ta.asset_type = 'banner'
      AND ta.file_url = lib.file_url
      AND lib.asset_type = 'banner'
  `);
  await pool.query(`
    UPDATE theme_decorations td
    SET asset_id = lib.id
    FROM theme_asset_library lib
    WHERE td.asset_id IS NULL
      AND td.image_url = lib.file_url
      AND lib.asset_type = 'decoration'
  `);
}
router.get("/themes/active", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query("SELECT id FROM themes WHERE is_active=TRUE AND status='published' AND (start_date IS NULL OR start_date<=NOW()) AND (end_date IS NULL OR end_date>=NOW()) LIMIT 1");
  res.json({ theme: rows[0] ? await getTheme(rows[0].id) : null });
}));
router.get("/themes/preview/:id", requireAuth, asyncHandler(async (req, res) => { await requireAdmin(req); const theme = await getTheme(Number(req.params.id)); if (!theme) return res.status(404).json({ detail: "Theme not found." }); res.json({ theme }); }));
router.get("/themes", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      t.*,
      COUNT(DISTINCT ta.id)::INTEGER AS banner_count,
      COUNT(DISTINCT td.id)::INTEGER AS decoration_count
    FROM themes t
    LEFT JOIN theme_assets ta ON ta.theme_id = t.id AND ta.asset_type = 'banner'
    LEFT JOIN theme_decorations td ON td.theme_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `);
  res.json({ themes: rows });
}));
router.get("/themes/assets", asyncHandler(async (req, res) => {
  await backfillThemeAssetLibrary();
  const search = String(req.query.search || "").trim().toLowerCase();
  const type = String(req.query.type || "").trim().toLowerCase();
  const params = [];
  const clauses = [];
  clauses.push("NOT EXISTS (SELECT 1 FROM theme_asset_library older WHERE older.id < lib.id AND older.asset_type = lib.asset_type AND split_part(older.file_url, '?', 1) = split_part(lib.file_url, '?', 1))");
  if (search) { params.push(`%${search}%`); clauses.push(`(lib.name ILIKE $${params.length} OR lib.asset_type ILIKE $${params.length})`); }
  if (type) { params.push(type); clauses.push(`lib.asset_type = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const query = `
    SELECT
      lib.id,
      lib.name,
      lib.asset_type,
      lib.file_url,
      lib.file_key,
      lib.mime_type,
      lib.file_size_bytes,
      lib.created_at,
      (
        COUNT(DISTINCT ta.id) + COUNT(DISTINCT td.id)
      )::INTEGER AS usage_count
    FROM theme_asset_library lib
    LEFT JOIN theme_assets ta ON ta.asset_id = lib.id OR (ta.file_url = lib.file_url AND ta.asset_type = lib.asset_type)
    LEFT JOIN theme_decorations td ON td.asset_id = lib.id OR (td.image_url = lib.file_url AND lib.asset_type = 'decoration')
    ${where ? where.replace('WHERE', 'WHERE') : ''}
    GROUP BY lib.id
    ORDER BY lib.created_at DESC
    LIMIT 50
  `;
  const { rows } = await pool.query(query, params);
  res.json({ assets: rows.map((asset) => ({ ...asset, file_url: signedAssetUrl(asset.file_url) })) });
}));
router.delete("/themes/assets/:id", requireAuth, asyncHandler(async (req, res) => { await requireAdmin(req); const assetId = Number(req.params.id); if (!Number.isInteger(assetId) || assetId <= 0) return res.status(400).json({ detail: "Invalid asset id." }); const result = await pool.query("DELETE FROM theme_asset_library WHERE id=$1 RETURNING id", [assetId]); if (!result.rowCount) return res.status(404).json({ detail: "Asset not found." }); res.json({ message: "Asset deleted.", id: assetId }); }));
router.get("/themes/:id", asyncHandler(async (req, res) => { const theme = await getTheme(Number(req.params.id)); if (!theme) return res.status(404).json({ detail: "Theme not found." }); res.json({ theme }); }));

router.post("/themes", requireAuth, express.raw({ type: "multipart/form-data", limit: "25mb" }), asyncHandler(async (req, res) => {
  await requireAdmin(req); const parsed = parseRequest(req); const data = payload(parsed.fields, parsed.fields);
  const client = await pool.connect(); try { await client.query("BEGIN"); if (data.status === "published") await client.query("UPDATE themes SET is_active=FALSE WHERE is_active=TRUE"); const created = await client.query(
    "INSERT INTO themes(name,slug,description,status,start_date,end_date,category,thumbnail_url,tokens,created_by,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
    [data.name, data.slug, data.description, data.status, data.start, data.end, data.category || "Seasonal", data.thumbnail_url || "", JSON.stringify(data.tokens || {}), req.auth.userId, data.status === "published"]
  ); await client.query("INSERT INTO theme_settings(theme_id) VALUES($1)", [created.rows[0].id]); await saveThemeAssets(client, created.rows[0].id, parsed); await client.query("COMMIT"); res.status(201).json({ theme: await getTheme(created.rows[0].id) }); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}));
router.put("/themes/:id", requireAuth, express.raw({ type: "multipart/form-data", limit: "25mb" }), asyncHandler(async (req, res) => {
  await requireAdmin(req); const id = Number(req.params.id); const existing = await getTheme(id); if (!existing) return res.status(404).json({ detail: "Theme not found." }); const parsed = parseRequest(req); const data = payload({ ...existing, ...parsed.fields }, { ...existing, ...parsed.fields });
  const client = await pool.connect(); try { await client.query("BEGIN"); if (data.status === "published") await client.query("UPDATE themes SET is_active=FALSE WHERE is_active=TRUE AND id<>$1", [id]); await client.query(
    "UPDATE themes SET name=$2,slug=$3,description=$4,status=$5,start_date=$6,end_date=$7,category=$8,thumbnail_url=$9,tokens=$10,is_active=$11 WHERE id=$1",
    [id, data.name, data.slug, data.description, data.status, data.start, data.end, data.category || "Seasonal", data.thumbnail_url || "", JSON.stringify(data.tokens || {}), data.status === "published"]
  ); await saveThemeAssets(client, id, parsed); await client.query("COMMIT"); res.json({ theme: await getTheme(id) }); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}));router.delete("/themes/:id", requireAuth, asyncHandler(async (req, res) => { await requireAdmin(req); const result = await pool.query("DELETE FROM themes WHERE id=$1 RETURNING id", [Number(req.params.id)]); if (!result.rowCount) return res.status(404).json({ detail: "Theme not found." }); res.json({ message: "Theme deleted." }); }));
router.post("/themes/:id/publish", requireAuth, asyncHandler(async (req, res) => { await requireAdmin(req); const client = await pool.connect(); try { await client.query("BEGIN"); await client.query("UPDATE themes SET is_active=FALSE WHERE is_active=TRUE"); const result = await client.query("UPDATE themes SET status='published',is_active=TRUE WHERE id=$1 RETURNING id", [Number(req.params.id)]); if (!result.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ detail: "Theme not found." }); } await client.query("COMMIT"); res.json({ theme: await getTheme(result.rows[0].id) }); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }));
router.post("/themes/:id/archive", requireAuth, asyncHandler(async (req, res) => { await requireAdmin(req); const result = await pool.query("UPDATE themes SET status='archived',is_active=FALSE WHERE id=$1 RETURNING id", [Number(req.params.id)]); if (!result.rowCount) return res.status(404).json({ detail: "Theme not found." }); res.json({ theme: await getTheme(result.rows[0].id) }); }));
router.post("/themes/:id/duplicate", requireAuth, asyncHandler(async (req, res) => { await requireAdmin(req); const source = await getTheme(Number(req.params.id)); if (!source) return res.status(404).json({ detail: "Theme not found." }); const client = await pool.connect(); try { await client.query("BEGIN"); const copy = await client.query("INSERT INTO themes(name,slug,description,status,start_date,end_date,created_by) VALUES($1,$2,$3,'draft',$4,$5,$6) RETURNING id", [`${source.name} Copy`, `${source.slug}-copy-${Date.now()}`, source.description, source.start_date, source.end_date, req.auth.userId]); const id = copy.rows[0].id; await client.query("INSERT INTO theme_settings(theme_id,show_top_decoration,show_bottom_decoration,show_side_decorations,show_banner,show_popup) SELECT $1,show_top_decoration,show_bottom_decoration,show_side_decorations,show_banner,show_popup FROM theme_settings WHERE theme_id=$2", [id, source.id]); for (const asset of source.assets) await client.query("INSERT INTO theme_assets(theme_id,asset_type,page,file_url,alt_text) VALUES($1,$2,$3,$4,$5)", [id,asset.asset_type,asset.page,asset.file_url,asset.alt_text]); for (const item of source.decorations) await client.query("INSERT INTO theme_decorations(theme_id,name,image_url,page,position,width,height,z_index,enabled,asset_id,placement_slot,offset_x,offset_y,desktop_visible,tablet_visible,mobile_visible,animation_type,animation_duration_ms,animation_amplitude,blend_light_background) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)", [id,item.name,item.image_url,item.page,item.position,item.width,item.height,item.z_index,item.enabled,item.asset_id,item.placement_slot,item.offset_x,item.offset_y,item.desktop_visible,item.tablet_visible,item.mobile_visible,item.animation_type || "none",item.animation_duration_ms || 2800,item.animation_amplitude || 10,Boolean(item.blend_light_background)]); await client.query("COMMIT"); res.status(201).json({ theme: await getTheme(id) }); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }));

export default router;

















