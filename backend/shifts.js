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

// ── Timezone safe value extractor ──────────────────────────────────────────────
// This safely extracts the local wall-clock time from a date object for the 
// timezone specified in your .env file, ignoring server/UTC discrepancies.
const tzFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
});

function getLocalValues(dateObj) {
  const parts = tzFormatter.formatToParts(dateObj);
  const val = (type) => parts.find(p => p.type === type).value;
  return {
    y: val('year'), mo: val('month'), d: val('day'),
    h: val('hour').padStart(2, '0'), m: val('minute').padStart(2, '0')
  };
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
    
    // Look back 1 day and forward 14 days
    const rangeStart = new Date(now.getTime() - 24 * 3600 * 1000);
    const rangeEnd = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

    for (const k in data) {
      const ev = data[k];
      if (ev.type !== 'VEVENT') continue;
      
      // Skip events explicitly marked as "Free" in Google Calendar
      if (ev.transparency === 'TRANSPARENT') continue;

      const summary = ev.summary || 'Busy';

      if (ev.rrule) {
        // Find the exact local wall-clock hour and minute the original event was created for
        const origLocal = getLocalValues(ev.start);
        const duration = (ev.end ? ev.end.getTime() : ev.start.getTime()) - ev.start.getTime();
        const dates = ev.rrule.between(rangeStart, rangeEnd);
        
        for (const date of dates) {
          // FIX: rrule ignores timezones and generates occurrences where the UTC day 
          // matches the BYDAY rule. Because evening local times cross the UTC midnight 
          // boundary, converting the generated date normally shifts it backwards by a day.
          // Solution: Extract the UTC components directly—they represent the intended local day!
          const y = date.getUTCFullYear();
          const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
          const d = String(date.getUTCDate()).padStart(2, '0');
          
          // Re-assemble it using the intended local day + original local time
          const localIso = `${y}-${mo}-${d}T${origLocal.h}:${origLocal.m}:00`;
          const correctedStart = fromZonedTime(localIso, TZ);
          
          events.push({
            start: correctedStart,
            end: new Date(correctedStart.getTime() + duration),
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
    return []; 
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
  let isNextDay = h < 6; 

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
  if (shift.priority >= 3) return false; 
  if (!shift.start || !shift.end || !shift.date) return false;

  if (icsEvents && icsEvents.length > 0) {
    const shiftStart = buildShiftDate(shift.date, shift.start);
    const shiftEnd = buildShiftDate(shift.date, shift.end);
    
    if (!shiftStart || !shiftEnd) return false;

    const hasConflict = icsEvents.some(ev => {
      // Conflict formula: Shift starts BEFORE Event ends, AND Shift ends AFTER Event starts
      return shiftStart < ev.end && shiftEnd > ev.start;
    });

    if (hasConflict) return false; 
  }

  return true; 
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