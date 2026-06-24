// mailer.js — Zoho SMTP email sender (Text-only for SMS)
const nodemailer = require('nodemailer');

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.ZOHO_SMTP_PORT || '587'),
    secure: false, // STARTTLS
    auth: {
      user: process.env.ZOHO_FROM_EMAIL,
      pass: process.env.ZOHO_PASSWORD,
    },
    tls: { rejectUnauthorized: true },
  });
}

// ── Build Text-Only SMS format ────────────────────────────────────────────────

function buildEmailText(shiftsByDay, subject) {
  const days = Object.entries(shiftsByDay).filter(([, shifts]) => shifts.length > 0);
  
  if (days.length === 0) return null; // No shifts to send

  let text = `${subject}\n`;
  
  for (const [dayLabel, shifts] of days) {
    text += `\n${dayLabel}:\n`;
    for (const s of shifts) {
      const ot = s.overtime ? " [OT]" : "";
      // Extremely compact format for SMS
      // Example: - R42(Red): 14:00-18:00 (4h) [OT]
      text += `- R${s.run}(${s.route || '-'}): ${s.start}-${s.end} (${s.hours}h)${ot}\n`;
    }
  }

  return text.trim();
}

// ── Send email ────────────────────────────────────────────────────────────────

async function sendEmail(subject, shiftsByDay) {
  const text = buildEmailText(shiftsByDay, subject);
  
  if (!text) {
    console.log('[mailer] No matching shifts. Skipping message.');
    return null;
  }

  const transport = createTransport();

  const info = await transport.sendMail({
    from: `"CyRide Notifier" <${process.env.ZOHO_FROM_EMAIL}>`,
    to: process.env.RECIPIENT_EMAIL,
    subject: `CyRide: ${subject}`,
    text: text, // Sending as plain text for SMS gateways
  });

  console.log(`[mailer] SMS/Email sent: ${info.messageId}`);
  return info;
}

module.exports = { sendEmail, createTransport };
