import "dotenv/config";
import { emailReady, sendEmail, verifyEmailTransport } from "../src/services/emailService.js";

if (!emailReady()) {
  console.error("Gmail SMTP is not configured. Set SMTP_USER and SMTP_APP_PASSWORD in server/.env.");
  process.exitCode = 1;
} else {
  try {
    await verifyEmailTransport();
    console.log("Gmail SMTP authentication successful.");
    const recipient = String(process.argv[2] || "").trim();
    if (recipient) {
      await sendEmail({
        to: recipient,
        subject: "SMTP connection test",
        title: "Voxora email is ready",
        lead: "Gmail SMTP is configured correctly for your Voxora installation.",
        detail: "This is an email delivery test. No action is required.",
      });
      console.log("Test email accepted for delivery.");
    }
  } catch (error) {
    console.error("Gmail SMTP verification failed:", error.code || error.message);
    process.exitCode = 1;
  }
}
