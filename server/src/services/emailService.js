import nodemailer from "nodemailer";
const BRAND = "Voxora";
const smtpUser = () => String(process.env.SMTP_USER || "").trim();
const appPassword = () => String(process.env.SMTP_APP_PASSWORD || "").replace(/\s/g, "");
const fromAddress = () => ({ name: String(process.env.SMTP_FROM_NAME || BRAND).trim(), address: smtpUser() });
let mailTransport;
function getTransport() {
  if (!mailTransport) {
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || (port === 465 ? "true" : "false")).toLowerCase() === "true";
    mailTransport = nodemailer.createTransport({
      host: String(process.env.SMTP_HOST || "smtp.gmail.com").trim(),
      port,
      secure,
      requireTLS: !secure,
      auth: { user: smtpUser(), pass: appPassword() },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 20000,
    });
  }
  return mailTransport;
}
const BASE_URL = () => String(process.env.AUTH_PUBLIC_URL || "http://localhost:5173").replace(/\/$/, "");
const escapeHtml = (text) => String(text || "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
export function emailReady() { return Boolean(smtpUser() && appPassword()); }
export async function verifyEmailTransport() { if (!emailReady()) throw new Error("SMTP credentials are not configured."); return getTransport().verify(); }
export function templateEmail({ title, lead, detail, link, action, code }) {
  const detailHtml = escapeHtml(detail).replace(/\n/g, "<br/>");
  const codeBlock = code ? `<p style="margin:26px 0;text-align:center"><span style="display:inline-block;background:#0a0a0b;border:1px solid #303034;border-radius:12px;padding:16px 26px;font-family:'Courier New',monospace;font-size:34px;letter-spacing:10px;font-weight:700;color:#f1efe9">${escapeHtml(code)}</span></p>` : "";
  const button = link ? `<p style="margin:30px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#f1efe9;color:#151519;text-decoration:none;padding:13px 24px;border-radius:9px;font-weight:700">${escapeHtml(action || "Open Voxora")}</a></p>` : "";
  const html = `<!doctype html><html><body style="background:#0a0a0b;margin:0;padding:36px 16px;color:#f1efe9;font-family:Arial,sans-serif"><main style="max-width:560px;margin:auto;background:#161519;border:1px solid #303034;border-radius:18px;padding:34px"><p style="letter-spacing:4px;font-size:14px;font-weight:800">V / VOXORA</p><h1 style="font-size:30px;margin-top:32px">${escapeHtml(title)}</h1><p style="color:#d8d6d0;line-height:1.7">${escapeHtml(lead)}</p>${codeBlock}${button}<p style="color:#a2a1a8;line-height:1.6;font-size:13px">${detailHtml}</p><hr style="border:0;border-top:1px solid #303034;margin:30px 0"/><p style="font-size:12px;color:#77767d">Voxora · Research, direct and create. If you did not request this message, you can ignore it.</p></main></body></html>`;
  return { html, text: [title, lead, code ? `Your code: ${code}` : "", link || "", detail].filter(Boolean).join("\n\n") };
}
export async function sendEmail({ to, subject, title, lead, detail = "", link, action, code }) {
  if (!emailReady()) {
    if (process.env.NODE_ENV === "production") throw new Error("Gmail SMTP is not configured.");
    console.warn("[mail] SMTP is not configured; email was not delivered.");
    return false;
  }
  const body = templateEmail({ title, lead, detail, link, action, code });
  await getTransport().sendMail({
    from: fromAddress(),
    to,
    subject: `${BRAND} · ${subject}`,
    html: body.html,
    text: body.text,
  });
  return true;
}
export function publicUrl(path) { return `${BASE_URL()}${path}`; }
export function sendVerificationEmail(user, token, code) {
  return sendEmail({ to:user.email, subject:code ? `${code} is your verification code` : "Verify your email", title:"Verify your email address", lead:code ? "Enter this 6-digit code in Voxora to verify your email and start creating." : "Confirm your email to start creating with Voxora.", detail:code ? "The code expires in 15 minutes. You can also use the button below instead; that link works for 24 hours." : "This verification link expires in 24 hours.", link:publicUrl(`/verify-email?token=${encodeURIComponent(token)}`), action:"Verify email", code });
}
export function sendResetEmail(user, token) {
  return sendEmail({ to:user.email, subject:"Reset your password", title:"Reset your password", lead:"We received a request to reset the password for your Voxora account.", detail:"This link expires in 2 hours. If you did not request this, your password has not been changed.", link:publicUrl(`/reset-password?token=${encodeURIComponent(token)}`), action:"Reset password" });
}
export function sendSecurityEmail(user, kind) {
  const copy = {
    password: ["Your password was updated", "Password changed", "Your Voxora password was changed. If this was not you, request a reset immediately."],
    verified: ["Your email is verified", "Email verified", "Your Voxora email address has been verified successfully."],
    sessions: ["Signed out of other devices", "Other devices signed out", "All other devices were signed out of your Voxora account. If this was not you, change your password immediately."],
    deleted: ["Your Voxora account was deleted", "Account deleted", "Your Voxora account and its projects were permanently deleted. If this was not you, contact support right away."],
  }[kind] || ["Account update", "Account update", "Your Voxora account was updated."];
  return sendEmail({ to:user.email, subject:copy[0], title:copy[1], lead:copy[2], detail:"You can manage your account securely in your Voxora workspace." });
}
