// mailer.js — Zoho SMTP email sender
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

// ── Format a single shift as an HTML table row ────────────────────────────────

function shiftRow(s, bgColor) {
  const overtime = s.overtime
    ? '<span style="color:#e55;font-weight:bold;">YES</span>'
    : '<span style="color:#888;">No</span>';
  return `
    <tr style="background:${bgColor};">
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">${s.run}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">${s.route || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">${s.start || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">${s.end || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">${s.hours}h</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">${overtime}</td>
    </tr>`;
}

// ── Build full HTML email ─────────────────────────────────────────────────────

function buildEmailHtml(shiftsByDay, subject) {
  const dayBlocks = Object.entries(shiftsByDay)
    .filter(([, shifts]) => shifts.length > 0)
    .map(([dayLabel, shifts]) => {
      const rows = shifts.map((s, i) => shiftRow(s, i % 2 === 0 ? '#ffffff' : '#f9f9f9')).join('');
      return `
        <h2 style="margin:32px 0 8px;color:#c8102e;font-family:Georgia,serif;border-bottom:2px solid #c8102e;padding-bottom:6px;">
          ${dayLabel}
        </h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
          <thead>
            <tr style="background:#c8102e;color:#fff;">
              <th style="padding:8px 12px;text-align:left;">Run</th>
              <th style="padding:8px 12px;text-align:left;">Route</th>
              <th style="padding:8px 12px;text-align:left;">Start</th>
              <th style="padding:8px 12px;text-align:left;">End</th>
              <th style="padding:8px 12px;text-align:left;">Hours</th>
              <th style="padding:8px 12px;text-align:left;">Overtime</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f4f4f4;">
      <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.12);">
        <div style="background:#c8102e;padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-family:Georgia,serif;font-size:22px;">🚌 CyRide Open Shifts</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px;">${subject}</p>
        </div>
        <div style="padding:24px 32px;">
          ${dayBlocks || '<p style="color:#888;">No matching open shifts found.</p>'}
        </div>
        <div style="background:#f4f4f4;padding:16px 32px;text-align:center;font-size:12px;color:#aaa;">
          Sent by CyRide Notifier · <a href="http://localhost:${process.env.WEB_PORT || 3000}" style="color:#c8102e;">Manage Preferences</a>
        </div>
      </div>
    </body>
    </html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────

async function sendEmail(subject, shiftsByDay) {
  const html = buildEmailHtml(shiftsByDay, subject);
  const transport = createTransport();

  const info = await transport.sendMail({
    from: `"CyRide Notifier" <${process.env.ZOHO_FROM_EMAIL}>`,
    to: process.env.RECIPIENT_EMAIL,
    subject: `CyRide: ${subject}`,
    html,
  });

  console.log(`[mailer] Email sent: ${info.messageId}`);
  return info;
}

module.exports = { sendEmail };
