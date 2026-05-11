// db.js — SQLite database setup
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'cyride.db'));

db.pragma('journal_mode = WAL');

// ── Tables ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS seen_shifts (
    id          TEXT PRIMARY KEY,   -- date|run composite key
    first_seen  TEXT NOT NULL,
    notified    INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS schedule (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    config      TEXT NOT NULL DEFAULT '{}'
  );

  INSERT OR IGNORE INTO schedule (id, config) VALUES (1, '{}');
`);

// ── Schedule helpers ─────────────────────────────────────────────────────────

function getSchedule() {
  const row = db.prepare('SELECT config FROM schedule WHERE id = 1').get();
  try { return JSON.parse(row.config); } catch { return {}; }
}

function saveSchedule(config) {
  db.prepare('UPDATE schedule SET config = ? WHERE id = 1')
    .run(JSON.stringify(config));
}

// ── Seen-shift helpers ───────────────────────────────────────────────────────

function markSeen(shiftId) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO seen_shifts (id, first_seen, notified)
    VALUES (?, ?, 0)
  `).run(shiftId, now);
}

function isNotified(shiftId) {
  const row = db.prepare('SELECT notified FROM seen_shifts WHERE id = ?').get(shiftId);
  return row ? row.notified === 1 : false;
}

function markNotified(shiftId) {
  db.prepare('UPDATE seen_shifts SET notified = 1 WHERE id = ?').run(shiftId);
}

function isSeen(shiftId) {
  return !!db.prepare('SELECT id FROM seen_shifts WHERE id = ?').get(shiftId);
}

module.exports = { getSchedule, saveSchedule, markSeen, markNotified, isNotified, isSeen };
