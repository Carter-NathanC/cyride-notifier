// shifts.js — fetch, filter, and compare CyRide open shifts against Google Calendar
const axios = require('axios');
const ical = require('node-ical');
const { fromZonedTime } = require('date-fns-tz');

const CYRIDE_URL = process.env.CYRIDE_JSON_URL || 'https://cyride.net/sync/open.json';
const TZ = process.env.TZ || 'America/Chicago';

// ── Fetch raw JSON from CyRide ────────────────────────────────────────────────

async function fetchShifts() {
  const { data } = await axios.get(CYRIDE_URL, { timeout: 15000 });
  return data;
}

// ── ICS Calendar Handling ─────────────────────────────────────────────────────

async function fetchIcsEvents() {
  const icsUrl = process.env.ICS_URL;
  if (!icsUrl) {
    console.warn("[shifts] Warning: ICS_URL not set in .env! Assuming open availability.");
    return [];
  }

  try {
    const data = await ical.async.fromURL(icsUrl);
    const events = [];
    const now = new Date();
    
    // Look back 1 day and forward 14 days to handle timezone/overnight edge cases safely
    const rangeStart = new Date(now.getTime() - 24 * 3600 * 1000);
    const rangeEnd = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

    for (const k in data) {
      const ev = data[k];
      if (ev.type !== 'VEVENT') continue;
      
      // Skip events explicitly marked as "Free" in Google Calendar
      if (ev.transparency === 'TRANSPARENT') continue;

      const summary = ev.summary || 'Busy';

      if (ev.rrule) {
        // Expand recurring events
        const dates = ev.rrule.between(rangeStart, rangeEnd);
        const duration = ev.end.getTime() - ev.start.getTime();
        for (const date of dates) {
          events.push({
            start: date,
            end: new Date(date.getTime() + duration),
            summary
          });
        }
      } else {
        // Standard one-off event
        if (ev.end > rangeStart && ev.start < rangeEnd) {
          events.push({ start: ev.start, end: ev.end, summary });
        }
      }
    }
    
    // Sort events chronologically
    events.sort((a, b) => a.start - b.start);
    return events;
  } catch (e) {
    console.error("[shifts] Failed to fetch/parse ICS:", e.message);
    return []; // Fail open: if calendar is temporarily broken, don't crash
  }
}

// Format the calendar events nicely for the frontend view
async function getGroupedCalendar() {
  const events = await fetchIcsEvents();
  const grouped = {};
  
  function formatDateNative(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ
    });
  }
  function formatTimeNative(date) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: TZ
    });
  }

  // Pre-populate the next 7 days so empty days still show up in the UI
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 24 * 3600 * 1000);
    grouped[formatDateNative(d)] = [];
  }

  for (const ev of events) {
    const dateStr = formatDateNative(ev.start);
    // Only add to group if it falls within the next 7 days we prepared
    if (grouped[dateStr]) {
      grouped[dateStr].push({
        startStr: formatTimeNative(ev.start),
        endStr: formatTimeNative(ev.end),
        summary: ev.summary
      });
    }
  }
  return grouped;
}

// ── Time & Date Helpers ──────────────────────────────────────────────────────

function buildShiftDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  let [h, m] = timeStr.split(':').map(Number);
  let isNextDay = h < 6; // Times before 6AM roll over to the next day's morning

  const pad = (n) => String(n).padStart(2, '0');
  const localIso = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(m)}:00`;
  
  let dateObj = fromZonedTime(localIso, TZ);
  if (isNextDay) {
    dateObj = new Date(dateObj.getTime() + 24 * 60 * 60 * 1000);
  }
  return dateObj;
}

// ── Filter shifts by Google Calendar ─────────────────────────────────────────

function shiftFitsSchedule(shift, icsEvents) {
  if (!shift.driver || shift.driver !== '**OPEN**') return false;
  if (shift.priority >= 3) return false; // Ignore internal placeholders
  if (!shift.start || !shift.end || !shift.date) return false;

  // If ICS events exist, ensure there are no overlapping busy blocks
  if (icsEvents && icsEvents.length > 0) {
    const shiftStart = buildShiftDate(shift.date, shift.start);
    const shiftEnd = buildShiftDate(shift.date, shift.end);
    
    if (!shiftStart || !shiftEnd) return false;

    const hasConflict = icsEvents.some(ev => {
      // Conflict formula: Shift starts BEFORE Event ends, AND Shift ends AFTER Event starts
      return shiftStart < ev.end && shiftEnd > ev.start;
    });

    if (hasConflict) return false; // Calendar says busy!
  }

  return true; // No calendar conflicts found
}

// ── Get next 7 days of open shifts filtered by calendar ──────────────────────

async function getFilteredShifts(data) {
  const days = data.days || {};
  const result = {}; 
  const icsEvents = await fetchIcsEvents();

  for (const [, dayData] of Object.entries(days)) {
    const label = `${dayData.name} — ${dayData.date}`;
    const filtered = (dayData.signups || []).filter(s =>
      shiftFitsSchedule(s, icsEvents)
    );
    if (filtered.length > 0) {
      result[label] = filtered;
    }
  }

  return result;
}

// ── Detect new shifts (not previously seen) ───────────────────────────────────

async function getNewShifts(data, { isSeen }) {
  const days = data.days || {};
  const result = {}; 
  const icsEvents = await fetchIcsEvents();

  for (const [, dayData] of Object.entries(days)) {
    const label = `${dayData.name} — ${dayData.date}`;
    const newOnes = (dayData.signups || []).filter(s => {
      if (!shiftFitsSchedule(s, icsEvents)) return false;
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

module.exports = { 
  fetchShifts, 
  getFilteredShifts, 
  getNewShifts, 
  markAllSeen, 
  getGroupedCalendar 
};