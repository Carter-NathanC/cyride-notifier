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

// GET /api/schedule — return current schedule config
app.get('/api/schedule', (req, res) => {
  res.json(db.getSchedule());
});

// POST /api/schedule — save schedule config
app.post('/api/schedule', (req, res) => {
  try {
    db.saveSchedule(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shifts — live preview of matching shifts
app.get('/api/shifts', async (req, res) => {
  try {
    const data     = await shifts.fetchShifts();
    const schedule = db.getSchedule();
    const filtered = shifts.getFilteredShifts(data, schedule);
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/test-email — send a test digest immediately
app.post('/api/test-email', async (req, res) => {
  try {
    await sendDailyDigest();
    res.json({ ok: true, message: 'Test email sent!' });
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
  const data     = await shifts.fetchShifts();
  const schedule = db.getSchedule();
  const filtered = shifts.getFilteredShifts(data, schedule);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: process.env.TZ || 'America/Chicago'
  });

  await mailer.sendEmail(`Daily Digest — ${dateStr}`, filtered);

  // After digest, mark everything as seen so new-shift checks start fresh
  shifts.markAllSeen(data, db);
  console.log('[cron] Daily digest sent.');
}

async function checkNewShifts() {
  console.log('[cron] Checking for new shifts...');
  try {
    const data     = await shifts.fetchShifts();
    const schedule = db.getSchedule();

    const newOnes = shifts.getNewShifts(data, schedule, db);
    const count   = Object.values(newOnes).reduce((n, arr) => n + arr.length, 0);

    if (count > 0) {
      console.log(`[cron] Found ${count} new shift(s), sending email...`);
      await mailer.sendEmail(`🆕 ${count} New Open Shift${count > 1 ? 's' : ''} Available!`, newOnes);

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
//  CRON SCHEDULES
// ─────────────────────────────────────────────────────────────────────────────

// Daily digest at 20:30 (configurable via DAILY_DIGEST_TIME)
const [digestHour, digestMin] = (process.env.DAILY_DIGEST_TIME || '20:30').split(':');
const digestCron = `${digestMin} ${digestHour} * * *`;
console.log(`[cron] Daily digest scheduled: ${digestCron} (${process.env.TZ})`);
cron.schedule(digestCron, sendDailyDigest, { timezone: process.env.TZ || 'America/Chicago' });

// New-shift check every N minutes
const intervalMin = parseInt(process.env.CHECK_INTERVAL_MINUTES || '10');
const checkCron = `*/${intervalMin} * * * *`;
console.log(`[cron] New-shift check scheduled every ${intervalMin} minutes`);
cron.schedule(checkCron, checkNewShifts);

// ─────────────────────────────────────────────────────────────────────────────
//  STARTUP
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚌 CyRide Notifier running on http://localhost:${PORT}`);
  console.log(`   Recipient:     ${process.env.RECIPIENT_EMAIL}`);
  console.log(`   Sending from:  ${process.env.ZOHO_FROM_EMAIL}`);
  console.log(`   Digest at:     ${process.env.DAILY_DIGEST_TIME} ${process.env.TZ}`);
  console.log(`   Check every:   ${intervalMin} minutes\n`);

  // Initial check on startup (no email, just populate seen-shifts cache)
  shifts.fetchShifts()
    .then(data => shifts.markAllSeen(data, db))
    .catch(e => console.error('[startup] Could not pre-load shifts:', e.message));
});
