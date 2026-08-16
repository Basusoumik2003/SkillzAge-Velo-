export const THEME_LAYERS = {
  background: 10,
  pageBackground: 20,
  banner: 60,
  decoration: 70,
  content: 100,
  navbar: 200,
  dropdown: 300,
  drawer: 400,
  modal: 500,
  toast: 600,
};

export const ROUTE_PAGES = {
  "/": "home",
  "/dashboard": "dashboard",
  "/login": "login",
  "/signup": "signup",
  "/register": "signup",
  "/about": "about",
  "/contact": "contact",
  "/projects": "projects",
  "/tracks": "tracks",
  "/workspace": "workspace",
  "/profile": "profile",
  "/payment": "payment",
  "/certificate-request": "certificate_request",
  "/self-intro": "self_intro",
  "/sitemap": "sitemap",
};

const NAVBAR_SLOTS = [
  ["navbar_left", "Navbar Left"],
  ["navbar_center", "Navbar Center"],
  ["navbar_right", "Navbar Right"],
];
const FOOTER_SLOT = [["footer_top", "Footer"]];
const FLOATING_SLOTS = [["floating", "Floating"]];
const BACKGROUND_SLOTS = [["page_background", "Background"]];

export const PAGE_OPTIONS = [
  ["global", "Global"],
  ["home", "Home / Landing"],
  ["login", "Login"],
  ["signup", "Register"],
  ["dashboard", "Dashboard"],
  ["profile", "Profile"],
  ["projects", "Projects"],
  ["tracks", "Tracks"],
  ["workspace", "Workspace"],
  ["about", "About"],
  ["contact", "Contact"],
  ["payment", "Payment"],
  ["certificate_request", "Certificate Request"],
  ["self_intro", "Self Intro"],
  ["sitemap", "Sitemap"],
];

export const PAGE_PLACEMENT_OPTIONS = {
  global: [...NAVBAR_SLOTS, ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  home: [...NAVBAR_SLOTS, ["hero_top", "Hero Top"], ["hero_center", "Hero Center"], ["hero_left", "Hero Left"], ["hero_right", "Hero Right"], ["hero_background", "Hero Background"], ["features", "Features"], ["cta", "CTA"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  login: [...NAVBAR_SLOTS, ["login_header", "Login Header"], ["login_form", "Login Form"], ["login_left", "Login Left"], ["login_right", "Login Right"], ["login_background", "Login Background"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  signup: [...NAVBAR_SLOTS, ["register_header", "Register Header"], ["register_form", "Register Form"], ["register_background", "Register Background"], ...FOOTER_SLOT, ...FLOATING_SLOTS],
  dashboard: [...NAVBAR_SLOTS, ["dashboard_header", "Dashboard Header"], ["sidebar_left", "Sidebar Left"], ["sidebar_right", "Sidebar Right"], ["main_content", "Main Content"], ["right_panel", "Right Panel"], ...FOOTER_SLOT, ...FLOATING_SLOTS],
  profile: [...NAVBAR_SLOTS, ["profile_header", "Profile Header"], ["profile_cover", "Profile Cover"], ["profile_stats", "Profile Stats"], ...FOOTER_SLOT, ...FLOATING_SLOTS],
  projects: [...NAVBAR_SLOTS, ["project_header", "Project Header"], ["project_grid", "Project Grid"], ...FOOTER_SLOT, ...FLOATING_SLOTS],
  tracks: [...NAVBAR_SLOTS, ["tracks_header", "Tracks Header"], ["tracks_grid", "Tracks Grid"], ["track_detail", "Track Detail"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  workspace: [...NAVBAR_SLOTS, ["workspace_header", "Workspace Header"], ["workspace_sidebar", "Workspace Sidebar"], ["workspace_canvas", "Workspace Canvas"], ["workspace_panel", "Workspace Panel"], ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  about: [...NAVBAR_SLOTS, ["about_header", "About Header"], ["about_story", "About Story"], ["about_team", "About Team"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  contact: [...NAVBAR_SLOTS, ["contact_header", "Contact Header"], ["contact_form", "Contact Form"], ["contact_info", "Contact Info"], ["contact_map", "Contact Map"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  payment: [...NAVBAR_SLOTS, ["payment_header", "Payment Header"], ["payment_summary", "Payment Summary"], ["payment_form", "Payment Form"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  certificate_request: [...NAVBAR_SLOTS, ["certificate_header", "Certificate Header"], ["certificate_form", "Certificate Form"], ["certificate_preview", "Certificate Preview"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  self_intro: [...NAVBAR_SLOTS, ["self_intro_header", "Self Intro Header"], ["self_intro_recorder", "Recorder"], ["self_intro_report", "Report"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
  sitemap: [...NAVBAR_SLOTS, ["sitemap_header", "Sitemap Header"], ["sitemap_links", "Sitemap Links"], ...FOOTER_SLOT, ...FLOATING_SLOTS, ...BACKGROUND_SLOTS],
};

export const PLACEMENT_OPTIONS = Object.values(PAGE_PLACEMENT_OPTIONS).flat().filter(([value], index, all) => all.findIndex(([candidate]) => candidate === value) === index);

export const DECORATION_ANIMATIONS = [
  ["none", "No animation"],
  ["pendulum", "Pendulum swing"],
];

export const FALLBACK_POSITIONS = [
  ["top", "Top"],
  ["bottom", "Bottom"],
  ["top_left", "Top left"],
  ["top_right", "Top right"],
  ["bottom_left", "Bottom left"],
  ["bottom_right", "Bottom right"],
  ["left_edge", "Left edge"],
  ["right_edge", "Right edge"],
  ["center_left", "Center left"],
  ["center_right", "Center right"],
  ["floating", "Floating"],
];

const PAGE_ALIASES = {
  register: "signup",
  landing: "home",
  certificate: "certificate_request",
  certificate_request: "certificate_request",
  "certificate-request": "certificate_request",
  self_intro: "self_intro",
  "self-intro": "self_intro",
};

const PAGE_DEFAULT_SLOT = {
  global: "floating",
  home: "hero_center",
  login: "login_form",
  signup: "register_form",
  dashboard: "main_content",
  profile: "profile_header",
  projects: "project_grid",
  tracks: "tracks_grid",
  workspace: "workspace_canvas",
  about: "about_header",
  contact: "contact_form",
  payment: "payment_summary",
  certificate_request: "certificate_form",
  self_intro: "self_intro_recorder",
  sitemap: "sitemap_links",
};

const PAGE_HEADER_SLOT = {
  home: "hero_top",
  login: "login_header",
  signup: "register_header",
  dashboard: "dashboard_header",
  profile: "profile_header",
  projects: "project_header",
  tracks: "tracks_header",
  workspace: "workspace_header",
  about: "about_header",
  contact: "contact_header",
  payment: "payment_header",
  certificate_request: "certificate_header",
  self_intro: "self_intro_header",
  sitemap: "sitemap_header",
};

const BASE_STYLE = {
  top: { top: 0, left: "50%", transform: "translateX(-50%)" },
  bottom: { bottom: 0, left: "50%", transform: "translateX(-50%)" },
  top_left: { top: 12, left: 12 },
  top_right: { top: 12, right: 12 },
  bottom_left: { bottom: 12, left: 12 },
  bottom_right: { bottom: 12, right: 12 },
  left_edge: { top: "50%", left: 0, transform: "translateY(-50%)" },
  right_edge: { top: "50%", right: 0, transform: "translateY(-50%)" },
  center_left: { top: "50%", left: 24, transform: "translateY(-50%)" },
  center_right: { top: "50%", right: 24, transform: "translateY(-50%)" },
  floating: { top: "34%", right: 24 },
  navbar: { top: 0, left: "50%", transform: "translateX(-50%)" },
  navbar_bottom: { top: 78, left: "50%", transform: "translateX(-50%)" },
  navbar_under: { top: 86, left: 0, right: 0 },
  navbar_left: { top: 34, left: 20 },
  navbar_center: { top: 34, left: "50%", transform: "translateX(-50%)" },
  navbar_right: { top: 34, right: 20 },
  hero_top: { top: "20%", left: "50%", transform: "translateX(-50%)" },
  hero_center: { top: "36%", left: "50%", transform: "translateX(-50%)" },
  hero_bottom: { top: "56%", left: "50%", transform: "translateX(-50%)" },
  hero_left: { top: "36%", left: 24 },
  hero_right: { top: "36%", right: 24 },
  hero_background: { inset: 0 },
  page_top: { top: 96, left: "50%", transform: "translateX(-50%)" },
  page_bottom: { bottom: 24, left: "50%", transform: "translateX(-50%)" },
  page_left: { top: "50%", left: 12, transform: "translateY(-50%)" },
  page_right: { top: "50%", right: 12, transform: "translateY(-50%)" },
  page_background: { inset: 0 },
  footer_top: { bottom: 120, left: "50%", transform: "translateX(-50%)" },
  footer_bottom: { bottom: 18, left: "50%", transform: "translateX(-50%)" },
  footer_left: { bottom: 72, left: 20 },
  footer_right: { bottom: 72, right: 20 },
  features: { top: "58%", left: "50%", transform: "translateX(-50%)" },
  cta: { bottom: 180, left: "50%", transform: "translateX(-50%)" },
  login_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  login_form: { top: "48%", left: "50%", transform: "translate(-50%, -50%)" },
  login_left: { top: "48%", left: 24, transform: "translateY(-50%)" },
  login_right: { top: "48%", right: 24, transform: "translateY(-50%)" },
  login_background: { inset: 0 },
  register_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  register_form: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
  register_background: { inset: 0 },
  dashboard_header: { top: 108, left: "50%", transform: "translateX(-50%)" },
  sidebar_left: { top: "50%", left: 16, transform: "translateY(-50%)" },
  sidebar_right: { top: "50%", right: 16, transform: "translateY(-50%)" },
  main_content: { top: "48%", left: "50%", transform: "translate(-50%, -50%)" },
  right_panel: { top: "48%", right: 24, transform: "translateY(-50%)" },
  profile_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  profile_cover: { top: 96, left: "50%", transform: "translateX(-50%)" },
  profile_stats: { top: "52%", left: "50%", transform: "translateX(-50%)" },
  project_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  project_grid: { top: "56%", left: "50%", transform: "translateX(-50%)" },
  tracks_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  tracks_grid: { top: "56%", left: "50%", transform: "translateX(-50%)" },
  track_detail: { top: "50%", right: 24, transform: "translateY(-50%)" },
  workspace_header: { top: 96, left: "50%", transform: "translateX(-50%)" },
  workspace_sidebar: { top: "50%", left: 16, transform: "translateY(-50%)" },
  workspace_canvas: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
  workspace_panel: { top: "50%", right: 16, transform: "translateY(-50%)" },
  about_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  about_story: { top: "46%", left: 24 },
  about_team: { top: "58%", right: 24 },
  contact_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  contact_form: { top: "50%", left: "35%", transform: "translate(-50%, -50%)" },
  contact_info: { top: "50%", right: 24, transform: "translateY(-50%)" },
  contact_map: { bottom: 120, left: "50%", transform: "translateX(-50%)" },
  payment_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  payment_summary: { top: "48%", left: "35%", transform: "translate(-50%, -50%)" },
  payment_form: { top: "48%", right: 24, transform: "translateY(-50%)" },
  certificate_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  certificate_form: { top: "48%", left: "36%", transform: "translate(-50%, -50%)" },
  certificate_preview: { top: "48%", right: 24, transform: "translateY(-50%)" },
  self_intro_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  self_intro_recorder: { top: "48%", left: "50%", transform: "translate(-50%, -50%)" },
  self_intro_report: { bottom: 120, left: "50%", transform: "translateX(-50%)" },
  sitemap_header: { top: 120, left: "50%", transform: "translateX(-50%)" },
  sitemap_links: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
};

export function normalizeThemePage(page = "global") {
  const key = String(page || "global").trim().toLowerCase().replace(/-/g, "_");
  return PAGE_ALIASES[key] || (PAGE_PLACEMENT_OPTIONS[key] ? key : "global");
}

export function getPlacementOptionsForPage(page = "global") {
  return PAGE_PLACEMENT_OPTIONS[normalizeThemePage(page)] || PAGE_PLACEMENT_OPTIONS.global;
}

export function isValidPlacementForPage(placement, page = "global") {
  return getPlacementOptionsForPage(page).some(([value]) => value === placement);
}

export function resolvePlacementSlot(placement, page = "global", position = "") {
  const normalizedPage = normalizeThemePage(page);
  const slot = String(placement || position || "floating");
  if (isValidPlacementForPage(slot, normalizedPage)) return slot;
  if (slot === "page_background" || slot.endsWith("_background")) return isValidPlacementForPage("page_background", normalizedPage) ? "page_background" : PAGE_DEFAULT_SLOT[normalizedPage] || "floating";
  if (slot.startsWith("navbar")) {
    if (slot.includes("left") && isValidPlacementForPage("navbar_left", normalizedPage)) return "navbar_left";
    if (slot.includes("right") && isValidPlacementForPage("navbar_right", normalizedPage)) return "navbar_right";
    return isValidPlacementForPage("navbar_center", normalizedPage) ? "navbar_center" : PAGE_DEFAULT_SLOT[normalizedPage] || "floating";
  }
  if (slot.startsWith("footer") || slot === "bottom" || slot === "page_bottom") return isValidPlacementForPage("footer_top", normalizedPage) ? "footer_top" : PAGE_DEFAULT_SLOT[normalizedPage] || "floating";
  if (slot.startsWith("hero")) {
    if (slot.includes("left") && isValidPlacementForPage("hero_left", normalizedPage)) return "hero_left";
    if (slot.includes("right") && isValidPlacementForPage("hero_right", normalizedPage)) return "hero_right";
    if (slot.includes("background") && isValidPlacementForPage("hero_background", normalizedPage)) return "hero_background";
    return isValidPlacementForPage("hero_center", normalizedPage) ? "hero_center" : PAGE_HEADER_SLOT[normalizedPage] || PAGE_DEFAULT_SLOT[normalizedPage] || "floating";
  }
  if (slot === "page_top" || slot === "top") return PAGE_HEADER_SLOT[normalizedPage] || PAGE_DEFAULT_SLOT[normalizedPage] || "floating";
  if (["page_left", "left_edge", "center_left", "top_left", "bottom_left"].includes(slot)) {
    if (isValidPlacementForPage("login_left", normalizedPage)) return "login_left";
    if (isValidPlacementForPage("sidebar_left", normalizedPage)) return "sidebar_left";
    if (isValidPlacementForPage("workspace_sidebar", normalizedPage)) return "workspace_sidebar";
    return isValidPlacementForPage("navbar_left", normalizedPage) ? "navbar_left" : PAGE_DEFAULT_SLOT[normalizedPage] || "floating";
  }
  if (["page_right", "right_edge", "center_right", "top_right", "bottom_right"].includes(slot)) {
    if (isValidPlacementForPage("login_right", normalizedPage)) return "login_right";
    if (isValidPlacementForPage("sidebar_right", normalizedPage)) return "sidebar_right";
    if (isValidPlacementForPage("right_panel", normalizedPage)) return "right_panel";
    if (isValidPlacementForPage("workspace_panel", normalizedPage)) return "workspace_panel";
    return isValidPlacementForPage("navbar_right", normalizedPage) ? "navbar_right" : PAGE_DEFAULT_SLOT[normalizedPage] || "floating";
  }
  return isValidPlacementForPage("floating", normalizedPage) ? "floating" : PAGE_DEFAULT_SLOT[normalizedPage] || "floating";
}

export function normalizeDecorationForPage(item = {}, page = item.page || "global") {
  const normalizedPage = normalizeThemePage(page);
  return { ...item, page: normalizedPage, placement_slot: resolvePlacementSlot(item.placement_slot, normalizedPage, item.position) };
}

export function placementFallbackPosition(placement = "") {
  const slot = String(placement || "");
  if (slot === "page_background" || slot.endsWith("_background")) return "top";
  if (slot.startsWith("navbar") || slot.endsWith("_header") || slot === "hero_top") return "top";
  if (slot.startsWith("footer")) return "bottom";
  if (slot.includes("_left") || slot === "sidebar_left" || slot === "workspace_sidebar") return "center_left";
  if (slot.includes("_right") || slot === "sidebar_right" || slot === "right_panel" || slot === "workspace_panel") return "center_right";
  return "floating";
}

export function resolveRoutePage(pathname = "/") {
  if (ROUTE_PAGES[pathname]) return ROUTE_PAGES[pathname];
  if (pathname.startsWith("/tracks/")) return "tracks";
  if (pathname.startsWith("/adminDashboard")) return "global";
  return "global";
}

export function getPlacementStyle(item = {}) {
  const slot = resolvePlacementSlot(item.placement_slot, item.page, item.position);
  return BASE_STYLE[slot] || BASE_STYLE[item.position] || BASE_STYLE.floating;
}

export function normalizeDecoration(item = {}) {
  const slot = resolvePlacementSlot(item.placement_slot, item.page, item.position);
  return { ...item, placement_slot: slot, position: item.position || "floating", width: Math.max(1, Number(item.width) || 160), height: item.height ? Math.max(1, Number(item.height)) : null, offset_x: Number(item.offset_x) || 0, offset_y: Number(item.offset_y) || 0, z_index: Number(item.z_index) || THEME_LAYERS.decoration, opacity: item.opacity == null ? 1 : Math.max(0, Math.min(1, Number(item.opacity))), rotation: Number(item.rotation) || 0, isBackground: slot === "page_background" || slot.endsWith("_background"), isStrip: ["navbar_strip", "navbar_under"].includes(slot) };
}

export function getDecorationRenderStyle(item = {}, { scale = 1 } = {}) {
  const normalized = normalizeDecoration(item);
  const placement = getPlacementStyle(normalized);
  const transform = [placement.transform, normalized.rotation ? `rotate(${normalized.rotation}deg)` : ""].filter(Boolean).join(" ");
  return { ...placement, marginLeft: normalized.offset_x, marginTop: normalized.offset_y, width: normalized.isBackground ? "100%" : normalized.isStrip ? "100%" : `${normalized.width * scale}px`, height: normalized.isBackground ? "100%" : normalized.height ? `${normalized.height * scale}px` : "auto", zIndex: normalized.z_index, opacity: normalized.hidden || normalized.enabled === false ? 0.35 : normalized.opacity, transform: transform || undefined, ...getDecorationAnimationStyle(normalized), ...getDecorationBlendStyle(normalized) };
}

export function getVisibilityClass(item = {}) {
  return [
    item.desktop_visible === false ? "lg:hidden" : "",
    item.tablet_visible === false ? "md:hidden lg:block" : "",
    item.mobile_visible === false ? "hidden md:block" : "",
  ].filter(Boolean).join(" ");
}

export function getDecorationAnimationStyle(item = {}) {
  if (item.animation_type !== "pendulum") return {};
  const duration = Math.max(600, Math.min(12000, Number(item.animation_duration_ms) || 2800));
  const amplitude = Math.max(1, Math.min(45, Number(item.animation_amplitude) || 10));
  return {
    "--theme-pendulum-amplitude": `${amplitude}deg`,
    animation: `themeDecorationPendulum ${duration}ms ease-in-out infinite`,
    transformOrigin: "50% 0%",
  };
}

export function getDecorationBlendStyle(item = {}) {
  return item.blend_light_background ? { mixBlendMode: "darken" } : {};
}

function isNavbarSlot(slot) {
  return String(slot || "").startsWith("navbar");
}

function isFooterSlot(slot) {
  return String(slot || "").startsWith("footer");
}

function shouldRenderBySettings(item, settings) {
  if (item.position === "top") return settings.show_top_decoration !== false;
  if (item.position === "bottom") return settings.show_bottom_decoration !== false;
  return settings.show_side_decorations !== false;
}

export function resolveThemeAssets(theme, page) {
  const settings = theme?.settings || {};
  const currentPage = normalizeThemePage(page);
  const decorations = (theme?.decorations || [])
    .map((item, __themeIndex) => ({ ...item, __themeIndex }))
    .filter((item) => item.enabled !== false)
    .filter((item) => {
      const itemPage = normalizeThemePage(item.page);
      return itemPage === "global" || itemPage === currentPage || item.page === "navbar" || item.page === "footer";
    })
    .map((item) => normalizeDecorationForPage(item, item.page === "global" || item.page === "navbar" || item.page === "footer" ? currentPage : item.page))
    .filter((item) => !isNavbarSlot(item.placement_slot) && !isFooterSlot(item.placement_slot))
    .filter((item) => shouldRenderBySettings(item, settings))
    .sort((a, b) => Number(a.z_index || 0) - Number(b.z_index || 0));
  const banner = settings.show_banner === false ? null : (theme?.assets || []).find((item) => item.asset_type === "banner" && normalizeThemePage(item.page) === currentPage) || (theme?.assets || []).find((item) => item.asset_type === "banner" && item.page === "global");
  return { banner, decorations };
}

export function resolveSlotDecorations(theme, slotArea, routePage = slotArea) {
  const settings = theme?.settings || {};
  const currentPage = normalizeThemePage(routePage);
  return (theme?.decorations || [])
    .map((item, __themeIndex) => ({ ...item, __themeIndex }))
    .filter((item) => item.enabled !== false)
    .filter((item) => {
      const itemPage = normalizeThemePage(item.page);
      return itemPage === "global" || itemPage === currentPage || item.page === slotArea;
    })
    .map((item) => normalizeDecorationForPage(item, item.page === "global" || item.page === "navbar" || item.page === "footer" ? currentPage : item.page))
    .filter((item) => slotArea === "navbar" ? isNavbarSlot(item.placement_slot) : slotArea === "footer" ? isFooterSlot(item.placement_slot) : item.page === slotArea)
    .filter((item) => shouldRenderBySettings(item, settings))
    .sort((a, b) => Number(a.z_index || 0) - Number(b.z_index || 0));
}
