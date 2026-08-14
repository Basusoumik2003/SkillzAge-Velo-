import { adminApi } from "@/lib/api";

// Not part of the exported InternzBee source; added only so the (out of
// scope) adminDashboard page resolves at build time. Mirrors the existing
// adminApi call pattern used throughout src/lib/admin.js.

export async function listInvoices(params) {
  const { data } = await adminApi.get("/invoices", { params });
  return data;
}

export async function createInvoice(payload) {
  const { data } = await adminApi.post("/invoices", payload);
  return data;
}

export async function previewInvoice(payload) {
  const { data } = await adminApi.post("/invoices/preview", payload);
  return data;
}

export async function emailInvoice(invoiceId, payload) {
  const { data } = await adminApi.post(`/invoices/${invoiceId}/email`, payload);
  return data;
}
