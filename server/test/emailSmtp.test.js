import test from "node:test";
import assert from "node:assert/strict";
import { emailReady, templateEmail } from "../src/services/emailService.js";

test("Gmail SMTP readiness requires sender and app password", () => {
  const oldUser = process.env.SMTP_USER;
  const oldPassword = process.env.SMTP_APP_PASSWORD;
  try {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_APP_PASSWORD;
    assert.equal(emailReady(), false);
    process.env.SMTP_USER = "test@example.com";
    assert.equal(emailReady(), false);
    process.env.SMTP_APP_PASSWORD = "abcd efgh ijkl mnop";
    assert.equal(emailReady(), true);
  } finally {
    if (oldUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = oldUser;
    if (oldPassword === undefined) delete process.env.SMTP_APP_PASSWORD;
    else process.env.SMTP_APP_PASSWORD = oldPassword;
  }
});

test("Transactional email markup escapes unsafe content", () => {
  const email = templateEmail({
    title: "Welcome <script>",
    lead: "Hello & welcome",
    detail: "Payment confirmed\nInvoice: INV-001",
  });
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("Hello &amp; welcome"));
  assert.ok(email.html.includes("Payment confirmed<br/>Invoice: INV-001"));
  assert.ok(email.text.includes("Payment confirmed\nInvoice: INV-001"));
});
