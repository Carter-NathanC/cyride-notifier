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

// ── Format a single shift for mobile viewing ──────────────────────────────────

function shiftBlock(s) {
  const overtimeBadge = s.overtime
    ? `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 8px;">OVERTIME</span>`
    : '';
    
  return `
    <div style="background: #ffffff; border-left: 4px solid #c8102e; border-radius: 6px; padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size: 16px; font-weight: bold; color: #1a1a1a; margin-bottom: 6px;">
        Run ${s.run} <span style="font-weight: normal; color: #666;">(${s.route || '—'})</span>
        ${overtimeBadge}
      </div>
      <div style="color: #444; font-size: 14px; display: flex; align-items: center;">
        <span style="font-family: monospace; font-size: 15px;">${s.start} - ${s.end}</span> 
        <span style="color: #888; margin-left: 6px;">(${s.hours}h)</span>
      </div>
    </div>`;
}

// ── Build full HTML email (Text/Mobile focused) ───────────────────────────────

function buildEmailHtml(shiftsByDay, subject) {
  const dayBlocks = Object.entries(shiftsByDay)
    .filter(([, shifts]) => shifts.length > 0)
    .map(([dayLabel, shifts]) => {
      const blocks = shifts.map(s => shiftBlock(s)).join('');
      return `
        <div style="margin-top: 24px; margin-bottom: 8px;">
          <h2 style="margin: 0; padding-bottom: 6px; font-size: 18px; color: #c8102e; border-bottom: 2px solid #f0f0f0;">
            ${dayLabel}
          </h2>
        </div>
        ${blocks}
      `;
    }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background:#f4f4f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        
        <div style="margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 22px; color: #c8102e;">🚌 CyRide Open Shifts</h1>
          <p style="margin: 4px 0 0 0; color: #555; font-size: 14px;">${subject}</p>
        </div>

        ${dayBlocks || '<p style="color: #888; font-size: 15px; padding: 20px; text-align: center; background: #fff; border-radius: 6px;">No matching open shifts found.</p>'}
        
        <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #aaa;">
          Sent by CyRide Notifier<br>
          <a href="http://localhost:${process.env.WEB_PORT || 3000}" style="color: #c8102e; text-decoration: none; margin-top: 6px; display: inline-block;">Update Availability</a>
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