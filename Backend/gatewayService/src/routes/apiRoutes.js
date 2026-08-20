import express from "express";
import { createProxyHandler } from "../proxy/proxyRequest.js";
import { config } from "../config.js";

const router = express.Router();

const authProxy = createProxyHandler({ targetBaseUrl: config.services.auth });
const profileProxy = createProxyHandler({ targetBaseUrl: config.services.profile });
const adminProxy = createProxyHandler({ targetBaseUrl: config.services.admin });
const userProxy = createProxyHandler({ targetBaseUrl: config.services.user });
const contactProxy = createProxyHandler({ targetBaseUrl: config.services.contact });
const paymentProxy = createProxyHandler({ targetBaseUrl: config.services.payment });
const invoiceProxy = createProxyHandler({ targetBaseUrl: config.services.invoice });
const pythonProxy = createProxyHandler({
  targetBaseUrl: config.services.python,
  rewritePath: (originalUrl) => originalUrl.replace(/^\/api(?=\/|$)/, "")
});

router.use("/auth", authProxy);
router.use("/profile", profileProxy);
router.use("/chat", pythonProxy);
router.use("/project", pythonProxy);
router.use("/github", pythonProxy);
router.use("/deliverables", pythonProxy);
router.use("/contact", contactProxy);
router.use("/admin", adminProxy);
router.use("/startup", adminProxy);
router.use("/themes", adminProxy);
router.use("/payment", paymentProxy);
router.use("/invoices", invoiceProxy);
router.use("/dashboard/payments", paymentProxy);
router.use("/dashboard", userProxy);
router.use("/create-order", paymentProxy);
router.use("/verify-payment", paymentProxy);

export default router;


