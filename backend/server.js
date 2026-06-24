// server.js — CyRide Notifier backend
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const path    = require('path');

const db     = require('./db');
const mailer = require('./mailer');
const shifts = require('./shifts');

const app  = express();
const PORT = process.env.WEB_PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ─────────────────────────────────────────────────────────────────────────────
//  API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/calendar — return parsed Google Calendar events for UI
app.get('/api/calendar', async (req, res) => {
  try {
    const calendarData = await shifts.getGroupedCalendar();
    res.json(calendarData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shifts — live preview of matching non-conflicting shifts
app.get('/api/shifts', async (req, res) => {
  try {
    const data = await shifts.fetchShifts();
    const filtered = await shifts.getFilteredShifts(data);
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/test-email — send a test digest immediately
app.post('/api/test-email', async (req, res) => {
  try {
    const data = await shifts.fetchShifts();
    const filtered = await shifts.getFilteredShifts(data);
    const count = Object.values(filtered).reduce((n, arr) => n + arr.length, 0);

    if (count === 0) {
      // If no shifts are available, force a basic text message to verify credentials work
      const transport = mailer.createTransport();
      await transport.sendMail({
        from: `"CyRide Notifier" <${process.env.ZOHO_FROM_EMAIL}>`,
        to: process.env.RECIPIENT_EMAIL,
        subject: `CyRide: Test Setup`,
        text: "Your SMS text configuration is working! There are currently 0 open shifts that match your schedule.",
      });
    } else {
      await sendDailyDigest();
    }
    
    res.json({ ok: true, message: 'Test message sent!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Catch-all → serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
//  CORE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function sendDailyDigest() {
  console.log('[cron] Running daily digest...');
  const data = await shifts.fetchShifts();
  const filtered = await shifts.getFilteredShifts(data);
  const count = Object.values(filtered).reduce((n, arr) => n + arr.length, 0);

  if (count > 0) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'numeric', day: 'numeric',
      timeZone: process.env.TZ || 'America/Chicago'
    });

    await mailer.sendEmail(`Daily Digest ${dateStr}`, filtered);
  } else {
    console.log('[cron] No shifts for daily digest. Skipping message.');
  }

  // After digest, mark everything as seen so new-shift checks start fresh
  shifts.markAllSeen(data, db);
}

async function checkNewShifts() {
  console.log('[cron] Checking for new shifts...');
  try {
    const data = await shifts.fetchShifts();

    const newOnes = await shifts.getNewShifts(data, db);
    const count = Object.values(newOnes).reduce((n, arr) => n + arr.length, 0);

    if (count > 0) {
      console.log(`[cron] Found ${count} new shift(s), sending text...`);
      await mailer.sendEmail(`${count} New Shift${count > 1 ? 's' : ''}!`, newOnes);

      // Mark new ones as notified+seen
      for (const [, shiftList] of Object.entries(newOnes)) {
        for (const s of shiftList) {
          const id = `${s.date}|${s.run}`;
          db.markSeen(id);
          db.markNotified(id);
        }
      }
    } else {
      // Still mark everything seen so we don't re-alert
      shifts.markAllSeen(data, db);
      console.log('[cron] No new shifts found.');
    }
  } catch (e) {
    console.error('[cron] Error checking shifts:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEDULING
// ─────────────────────────────────────────────────────────────────────────────

// Daily digest at 20:30 (configurable via DAILY_DIGEST_TIME)
const [digestHour, digestMin] = (process.env.DAILY_DIGEST_TIME || '20:30').split(':');
const digestCron = `${digestMin} ${digestHour} * * *`;
console.log(`[cron] Daily digest scheduled: ${digestCron} (${process.env.TZ})`);
cron.schedule(digestCron, sendDailyDigest, { timezone: process.env.TZ || 'America/Chicago' });

// New-shift check every X seconds
const intervalSec = parseInt(process.env.CHECK_INTERVAL_SECONDS || '45', 10);
console.log(`[cron] New-shift check scheduled every ${intervalSec} seconds`);
setInterval(checkNewShifts, intervalSec * 1000);

// ─────────────────────────────────────────────────────────────────────────────
//  STARTUP
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚌 CyRide Notifier running on http://localhost:${PORT}`);
  console.log(`   Recipient:     ${process.env.RECIPIENT_EMAIL}`);
  console.log(`   Sending from:  ${process.env.ZOHO_FROM_EMAIL}`);
  console.log(`   ICS Calendar:  ${process.env.ICS_URL ? 'Configured' : 'MISSING!'}`);
  console.log(`   Digest at:     ${process.env.DAILY_DIGEST_TIME} ${process.env.TZ}`);
  console.log(`   Check every:   ${intervalSec} seconds\n`);

  // Initial check on startup (no email, just populate seen-shifts cache)
  shifts.fetchShifts()
    .then(data => shifts.markAllSeen(data, db))
    .catch(e => console.error('[startup] Could not pre-load shifts:', e.message));
});
