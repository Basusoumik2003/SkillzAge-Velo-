import express from "express";
import { createProxyHandler } from "../proxy/proxyRequest.js";
import { config } from "../config.js";

const router = express.Router();

function rewritePythonPath(originalUrl) {
  const path = originalUrl.replace(/^\/api(?=\/|$)/, "");
  // FastAPI defines the chat POST handler at /chat/. Avoid a 307 redirect
  // for POST /api/chat, which some clients/proxies do not replay safely.
  return path === "/chat" ? "/chat/" : path;
}

const authProxy = createProxyHandler({ targetBaseUrl: config.services.auth });
const profileProxy = createProxyHandler({ targetBaseUrl: config.services.profile });
const adminProxy = createProxyHandler({ targetBaseUrl: config.services.admin });
const searchProxy = createProxyHandler({
  targetBaseUrl: config.services.search,
  rewritePath: (originalUrl) => originalUrl.replace(/^\/api(?=\/|$)/, "")
});
const contactProxy = createProxyHandler({ targetBaseUrl: config.services.contact });
const paymentProxy = createProxyHandler({ targetBaseUrl: config.services.payment });
const invoiceProxy = createProxyHandler({ targetBaseUrl: config.services.invoice });
const pythonProxy = createProxyHandler({
  targetBaseUrl: config.services.python,
  rewritePath: rewritePythonPath
});

router.use("/auth", authProxy);
router.use("/profile", profileProxy);
router.use("/chat", pythonProxy);
router.use("/project", pythonProxy);

router.use("/deliverables", pythonProxy);
router.use("/contact", contactProxy);
router.use("/admin", adminProxy);
router.use("/search", searchProxy);
router.use("/startup", adminProxy);

router.use("/payment", paymentProxy);

router.use("/dashboard/payments", paymentProxy);
// Dashboard endpoints are implemented by adminService (dashboardRoutes.js),
// not by the search/user service running on port 8008.
router.use("/dashboard", adminProxy);
router.use("/create-order", paymentProxy);
router.use("/verify-payment", paymentProxy);

export default router;


