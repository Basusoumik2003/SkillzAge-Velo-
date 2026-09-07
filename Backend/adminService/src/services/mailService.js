import { config } from "../config/config.js";

function isAzureConfigured() {
  return Boolean(config.azureMail.tenantId && config.azureMail.clientId && config.azureMail.clientSecret && config.azureMail.mailbox);
}

async function getMicrosoftToken() {
  const tokenUrl = `https://login.microsoftonline.com/${config.azureMail.tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append("client_id", config.azureMail.clientId);
  params.append("client_secret", config.azureMail.clientSecret);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  if (!response.ok) {
    throw new Error(`Microsoft token request failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()).access_token;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function textToHtml(value) {
  return escapeHtml(value)
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>");
}

export async function sendNewsletterEmail({ to, subject, title = "", bodyText = "", imageUrl = "" }) {
  const email = String(to || "").trim();
  if (!email) return { skipped: true, reason: "missing_recipient" };
  if (!isAzureConfigured()) {
    if (config.nodeEnv !== "production") return { skipped: true, reason: "microsoft_graph_mail_not_configured" };
    throw new Error("Microsoft Graph mail is not configured.");
  }

  const safeSubject = String(subject || "InternzBee Newsletter").trim().slice(0, 180) || "InternzBee Newsletter";
  const safeTitle = escapeHtml(title || safeSubject);
  const safeBody = textToHtml(bodyText || "");
  const safeImageUrl = escapeHtml(imageUrl || "");
  const accessToken = await getMicrosoftToken();
  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.azureMail.mailbox)}/sendMail`;
  const response = await fetch(sendMailUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        subject: safeSubject,
        body: {
          contentType: "HTML",
          content: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#1f2937;max-width:680px;">
            ${safeImageUrl ? `<img src="${safeImageUrl}" alt="" style="display:block;width:100%;max-width:680px;border-radius:14px;margin:0 0 22px 0;"/>` : ""}
            <h1 style="font-size:24px;line-height:1.25;margin:0 0 14px 0;color:#111827;">${safeTitle}</h1>
            <div style="margin:0 0 24px 0;"><p>${safeBody}</p></div>
            <p style="margin-top:24px;">Regards,<br/><strong>InternzBee</strong></p>
          </div>`
        },
        toRecipients: [{ emailAddress: { address: email } }]
      },
      saveToSentItems: false
    })
  });
  if (!response.ok) {
    throw new Error(`Graph sendMail failed: ${response.status} ${await response.text()}`);
  }
  return { sent: true };
}

export async function sendCertificateIssuedEmail({ to, recipientName, projectName, certificateUrl = "", attachment = null }) {
  const email = String(to || "").trim();
  if (!email) return { skipped: true, reason: "missing_recipient" };
  if (!isAzureConfigured()) {
    if (config.nodeEnv !== "production") return { skipped: true, reason: "microsoft_graph_mail_not_configured" };
    throw new Error("Microsoft Graph mail is not configured.");
  }

  const safeName = escapeHtml(recipientName || "Intern");
  const safeProject = escapeHtml(projectName || "Project");
  const safeCertificateUrl = escapeHtml(certificateUrl);
  const attachmentPayload = attachment?.contentBytes
    ? [{
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: attachment.name || "certificate.pdf",
        contentType: attachment.contentType || "application/pdf",
        contentBytes: attachment.contentBytes
      }]
    : undefined;
  const accessToken = await getMicrosoftToken();
  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.azureMail.mailbox)}/sendMail`;
  const response = await fetch(sendMailUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        subject: `Your certificate is ready - ${projectName}`,
        body: {
          contentType: "HTML",
          content: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">
            <p>Hi ${safeName},</p>
            <p>Thanks for submitting your feedback for <strong>${safeProject}</strong>.</p>
            <p>Your certificate request has been processed successfully. Your certificate is ${attachmentPayload ? "attached to this email" : "ready in your dashboard"}.</p>
            ${safeCertificateUrl ? `<p>You can also open it from your dashboard or use this secure link: <a href="${safeCertificateUrl}">View certificate</a></p>` : ""}
            <p>Regards,<br/><strong>InternzBee</strong></p>
          </div>`
        },
        toRecipients: [{ emailAddress: { address: email } }],
        ...(attachmentPayload ? { attachments: attachmentPayload } : {})
      },
      saveToSentItems: false
    })
  });
  if (!response.ok) {
    throw new Error(`Graph sendMail failed: ${response.status} ${await response.text()}`);
  }
  return { sent: true };
}