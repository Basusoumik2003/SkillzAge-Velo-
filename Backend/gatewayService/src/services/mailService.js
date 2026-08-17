import { config } from "../config.js";

function isAzureConfigured() {
  return (
    Boolean(config.azureMail.tenantId) &&
    Boolean(config.azureMail.clientId) &&
    Boolean(config.azureMail.clientSecret) &&
    Boolean(config.azureMail.mailbox)
  );
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
    const body = await response.text();
    throw new Error(`Microsoft token request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

function buildOtpEmailHtml(otpCode) {
  const code = String(otpCode || "").trim();
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>InternzBee - Verification Email</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Segoe UI,Arial,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f4;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
          <tr>
            <td style="background:#fa9531;padding:30px 36px 42px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="width:38px;height:38px;border-radius:10px;background:#ffb261;text-align:center;color:#ffffff;font-size:20px;font-weight:800;line-height:38px;">iB</td>
                        <td style="padding-left:12px;color:#ffffff;font-size:23px;font-weight:800;letter-spacing:-0.3px;">InternzBee</td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle" style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Verification</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 40px 26px;">
              <h1 style="margin:0 0 18px;color:#fa9531;font-size:28px;line-height:1.2;font-weight:800;">Welcome to InternzBee</h1>
              <p style="margin:0 0 10px;color:#333;font-size:16px;line-height:1.55;">Thank you for joining <strong>InternzBee</strong>.</p>
              <p style="margin:0 0 18px;color:#333;font-size:16px;line-height:1.55;">Your verification code is:</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="border:2px dashed #fa9531;border-radius:14px;background:#fff5eb;padding:22px 10px;">
                    <span style="display:inline-block;color:#fa9531;font-size:44px;line-height:1;font-weight:800;letter-spacing:10px;font-family:'Courier New',monospace;">${code}</span>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff5eb;border-radius:10px;margin:0 0 12px;">
                <tr>
                  <td style="width:58px;padding:14px 0 14px 18px;" valign="middle">
                    <span style="display:inline-block;width:30px;height:30px;border:2px solid #fa9531;border-radius:50%;color:#fa9531;text-align:center;line-height:30px;font-size:18px;">&#9711;</span>
                  </td>
                  <td style="padding:14px 18px 14px 0;color:#444;font-size:15px;line-height:1.45;">This code will expire in <strong>${config.otpExpiryMinutes} minutes</strong>.</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff0f0;border-radius:10px;margin:0 0 26px;">
                <tr>
                  <td style="width:58px;padding:14px 0 14px 18px;" valign="middle">
                    <span style="display:inline-block;width:30px;height:30px;border:2px solid #e53935;border-radius:50%;color:#e53935;text-align:center;line-height:30px;font-size:18px;font-weight:800;">!</span>
                  </td>
                  <td style="padding:14px 18px 14px 0;color:#e53935;font-size:15px;line-height:1.45;font-weight:600;">Please do not share this code with anyone for security reasons.</td>
                </tr>
              </table>
              <div style="height:1px;background:#eeeeee;margin:0 0 20px;"></div>
              <p style="margin:0;color:#333;font-size:15px;font-weight:700;">- InternzBee Team</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background:#faf9f7;padding:20px 40px 24px;">
              <p style="margin:0 0 4px;color:#666;font-size:13px;"><strong style="color:#333;">&copy; 2025 InternzBee.</strong> All rights reserved.</p>
              <p style="margin:0;color:#999;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>InternzBee - Verification Email</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f0f0f0; font-family: 'Segoe UI', Arial, sans-serif; padding: 30px 10px; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10); }
  .header { background: #fa9531; padding: 32px 40px 70px; position: relative; overflow: hidden; min-height: 150px; }
  .logo { display: flex; align-items: center; gap: 10px; position: relative; z-index: 2; }
  .logo-icon { background: rgba(255,255,255,0.25); border-radius: 10px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; }
  .logo-text { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
  .header-art { position: absolute; right: 30px; top: 10px; z-index: 2; width: 130px; height: 115px; }
  .envelope-body { position: absolute; bottom: 0; left: 10px; width: 105px; height: 70px; background: #fde0b0; border-radius: 8px; box-shadow: 0 14px 28px rgba(115,60,8,0.14); }
  .envelope-flap { position: absolute; bottom: 38px; left: 10px; width: 0; height: 0; border-left: 52px solid transparent; border-right: 52px solid transparent; border-top: 36px solid #fcd18a; }
  .envelope-card { position: absolute; bottom: 28px; left: 28px; width: 78px; height: 65px; background: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; transform: rotate(-3deg); }
  .shield { width: 28px; height: 28px; background: #fa9531; border-radius: 50% 50% 45% 45%; display: flex; align-items: center; justify-content: center; }
  .wave { position: absolute; bottom: -1px; left: 0; width: 100%; z-index: 1; }
  .body { padding: 32px 40px 24px; }
  h1 { color: #fa9531; font-size: 28px; font-weight: 800; margin: 0 0 18px; letter-spacing: -0.5px; }
  .body p { color: #333; font-size: 16px; margin: 0 0 10px; }
  .code-box { border: 2px dashed #fa9531; border-radius: 14px; background: #fff5eb; padding: 22px 10px; text-align: center; margin: 20px 0 24px; }
  .code-box span { color: #fa9531; font-size: 46px; font-weight: 800; letter-spacing: 12px; font-family: 'Courier New', monospace; white-space: nowrap; }
  .notice { background: #fff5eb; border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .warning { background: #FFF0F0; border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  .icon-circle-orange { width: 34px; height: 34px; border: 2px solid #fa9531; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .icon-circle-red { width: 34px; height: 34px; border: 2px solid #e53935; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .notice span { color: #444; font-size: 15px; }
  .warning span { color: #e53935; font-size: 15px; font-weight: 500; }
  .divider { border: none; border-top: 1px solid #eee; margin: 0 0 20px; }
  .sign-off { color: #333; font-size: 15px; font-weight: 700; margin: 0 0 28px; }
  .footer { background: #FAF9F7; padding: 20px 40px 24px; text-align: center; }
  .socials { display: flex; justify-content: center; gap: 14px; margin-bottom: 14px; }
  .social-icon { width: 36px; height: 36px; border: 1.5px solid #fa9531; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .footer-copy { color: #666; font-size: 13px; margin: 0 0 4px; }
  .footer-ignore { color: #999; font-size: 12px; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5C8.5 5 6 8 6 12c0 3.5 2.5 7 6 7s6-3.5 6-7c0-4-2.5-7-6-7z" fill="#fff" opacity="0.9"/>
          <path d="M9 11h6M9 14h6" stroke="#fa9531" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="9.5" cy="8.5" r="1" fill="#fff"/>
          <circle cx="14.5" cy="8.5" r="1" fill="#fff"/>
          <path d="M10 6.5C10 5.5 11 4 12 4c1 0 2 1.5 2 2.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="logo-text">InternzBee</span>
    </div>
    <div class="header-art">
      <div class="envelope-body"></div>
      <div class="envelope-flap"></div>
      <div class="envelope-card">
        <div class="shield">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 8l3.5 3.5L13 5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <svg style="position:absolute;top:0;left:8px;opacity:0.9" width="44" height="34" viewBox="0 0 28 22" fill="none">
        <path d="M2 12L26 2L18 20L14 13L2 12Z" fill="#fde0b0" stroke="#fa9531" stroke-width="0.8"/>
        <path d="M14 13L18 20" stroke="#fa9531" stroke-width="1"/>
      </svg>
    </div>
    <svg class="wave" viewBox="0 0 600 50" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 30 Q150 0 300 25 Q450 50 600 20 L600 50 L0 50Z" fill="#fff"/>
    </svg>
  </div>
  <div class="body">
    <h1>Welcome to InternzBee</h1>
    <p>Thank you for joining <strong>InternzBee</strong>.</p>
    <p>Your verification code is:</p>
    <div class="code-box">
      <span>${code}</span>
    </div>
    <div class="notice">
      <div class="icon-circle-orange">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#fa9531" stroke-width="2"/>
          <path d="M12 7v5l3 3" stroke="#fa9531" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span>This code will expire in <strong>${config.otpExpiryMinutes} minutes</strong>.</span>
    </div>
    <div class="warning">
      <div class="icon-circle-red">
        <svg width="16" height="18" viewBox="0 0 20 22" fill="none">
          <path d="M10 2L3 5v6c0 5 3.5 9.5 7 10.5C13.5 20.5 17 16 17 11V5L10 2z" stroke="#e53935" stroke-width="2" stroke-linejoin="round"/>
          <path d="M10 8v4M10 14.5v.5" stroke="#e53935" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <span>Please do not share this code with anyone for security reasons.</span>
    </div>
    <hr class="divider"/>
    <p class="sign-off">- InternzBee Team</p>
  </div>
  <div class="footer">
    <div class="socials">
      <div class="social-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#fa9531" stroke-width="1.8"/>
          <path d="M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9" stroke="#fa9531" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9" stroke="#fa9531" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M3 12h18" stroke="#fa9531" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="social-icon">
        <svg width="10" height="18" viewBox="0 0 10 18" fill="none">
          <path d="M7 3H9V0H7C5.3 0 4 1.3 4 3v2H2v3h2v10h3V8h2l.5-3H7V3z" fill="#fa9531"/>
        </svg>
      </div>
      <div class="social-icon">
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
          <path d="M15 1L9.5 7.5 15.5 14h-2l-4.5-5.5L4 14H1l5.8-6.8L1.5 1H4l4 4.8L11.5 1H15z" fill="#fa9531"/>
        </svg>
      </div>
      <div class="social-icon">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1" y="5" width="3" height="10" fill="#fa9531"/>
          <circle cx="2.5" cy="2.5" r="1.5" fill="#fa9531"/>
          <path d="M6 5h2.5v1.5S9 5 11 5c2 0 3 1.2 3 3.5V15h-3V9c0-1-.4-1.5-1.2-1.5S8.5 8 8.5 9v6H6V5z" fill="#fa9531"/>
        </svg>
      </div>
    </div>
    <p class="footer-copy"><strong style="color:#333;">&copy; 2025 InternzBee.</strong> All rights reserved.</p>
    <p class="footer-ignore">If you didn't request this, you can safely ignore this email.</p>
  </div>
</div>
</body>
</html>
  `;
}

export async function sendOtpEmail({ email, otpCode }) {
  if (!isAzureConfigured()) {
    if (config.nodeEnv !== "production") {
      console.log(`[OTP DEV] ${email} -> ${otpCode}`);
      return;
    }
    throw new Error("Microsoft Graph mail is not configured.");
  }

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
        subject: "Welcome to InternzBee - Your Verification Code",
        body: {
          contentType: "HTML",
          content: buildOtpEmailHtml(otpCode)
        },
        toRecipients: [
          {
            emailAddress: {
              address: email
            }
          }
        ]
      },
      saveToSentItems: false
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Graph sendMail failed: ${response.status} ${body}`);
  }
}
