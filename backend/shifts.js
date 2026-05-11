// shifts.js — fetch, filter, and compare CyRide open shifts
const axios = require('axios');

const CYRIDE_URL = process.env.CYRIDE_JSON_URL || 'https://cyride.net/sync/open.json';

// ── Fetch raw JSON from CyRide ────────────────────────────────────────────────

async function fetchShifts() {
  const { data } = await axios.get(CYRIDE_URL, { timeout: 15000 });
  return data;
}

// ── Parse HH:MM string into total minutes since midnight ─────────────────────
// Shifts can span past midnight, so we handle the "overnight" day boundary.
// The schedule uses 06:00 as the start-of-day boundary.
// We store times as minutes-since-06:00 so overnight shifts (e.g. 01:30)
// land at minute 1170 (19.5h into the bus day).

function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  // Convert to minutes-since-06:00; times before 06:00 wrap to next day
  let mins = h * 60 + m;
  if (mins < 6 * 60) mins += 24 * 60; // pre-6am belongs to the next "bus day"
  return mins - 6 * 60; // 0 = 06:00, 1140 = 05:59 next morning
}

// ── Filter shifts by user schedule ───────────────────────────────────────────
//
// schedule shape (per weekday key "monday".."sunday"):
//   { enabled: bool, windows: [{ start: "HH:MM", end: "HH:MM" }] }
//
// A shift "fits" if ALL of: driver is **OPEN**, priority < 3 (priority 3/4
// are likely internal placeholders), AND the shift falls within at least one
// of the user's available windows.

function shiftFitsSchedule(shift, daySchedule) {
  // Must be open
  if (!shift.driver || shift.driver !== '**OPEN**') return false;
  // Ignore internal/placeholder priorities
  if (shift.priority >= 3) return false;
  // Must have start/end times
  if (!shift.start || !shift.end) return false;

  if (!daySchedule || !daySchedule.enabled) return false;

  const windows = daySchedule.windows || [];
  if (windows.length === 0) return false;

  const shiftStart = timeToMinutes(shift.start);
  const shiftEnd   = timeToMinutes(shift.end);

  // Shift fits if it starts AND ends within any single availability window
  return windows.some(w => {
    const wStart = timeToMinutes(w.start);
    const wEnd   = timeToMinutes(w.end);
    return shiftStart >= wStart && shiftEnd <= wEnd;
  });
}

// ── Get next 7 days of open shifts filtered by user schedule ─────────────────

function getFilteredShifts(data, schedule) {
  const days = data.days || {};
  const result = {}; // { "Monday May 11" : [shift, ...] }

  for (const [dayKey, dayData] of Object.entries(days)) {
    const daySchedule = schedule[dayKey.toLowerCase()] || schedule[dayKey];
    const label = `${dayData.name} — ${dayData.date}`;
    const filtered = (dayData.signups || []).filter(s =>
      shiftFitsSchedule(s, daySchedule)
    );
    if (filtered.length > 0) {
      result[label] = filtered;
    }
  }

  return result;
}

// ── Detect new shifts (not previously seen) ───────────────────────────────────

function getNewShifts(data, schedule, { isSeen }) {
  const days = data.days || {};
  const result = {}; // same shape as getFilteredShifts

  for (const [dayKey, dayData] of Object.entries(days)) {
    const daySchedule = schedule[dayKey.toLowerCase()] || schedule[dayKey];
    const label = `${dayData.name} — ${dayData.date}`;
    const newOnes = (dayData.signups || []).filter(s => {
      if (!shiftFitsSchedule(s, daySchedule)) return false;
      const id = `${s.date}|${s.run}`;
      return !isSeen(id);
    });
    if (newOnes.length > 0) {
      result[label] = newOnes;
    }
  }

  return result;
}

// ── Mark all shifts in current data as seen ───────────────────────────────────

function markAllSeen(data, { markSeen }) {
  const days = data.days || {};
  for (const dayData of Object.values(days)) {
    for (const shift of dayData.signups || []) {
      if (shift.driver === '**OPEN**' && shift.priority < 3 && shift.start) {
        markSeen(`${shift.date}|${shift.run}`);
      }
    }
  }
}

module.exports = { fetchShifts, getFilteredShifts, getNewShifts, markAllSeen };
