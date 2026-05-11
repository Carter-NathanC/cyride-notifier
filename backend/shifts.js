// shifts.js — fetch, filter, and compare CyRide open shifts
const axios = require('axios');
const ical = require('node-ical');
const { fromZonedTime } = require('date-fns-tz');

const CYRIDE_URL = process.env.CYRIDE_JSON_URL || 'https://cyride.net/sync/open.json';

// ── Fetch raw JSON from CyRide ────────────────────────────────────────────────

async function fetchShifts() {
  const { data } = await axios.get(CYRIDE_URL, { timeout: 15000 });
  return data;
}

// ── ICS Calendar Handling ─────────────────────────────────────────────────────

async function fetchIcsEvents(icsUrl) {
  if (!icsUrl) return [];
  try {
    const data = await ical.async.fromURL(icsUrl);
    const events = [];
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days out

    for (const k in data) {
      const ev = data[k];
      if (ev.type !== 'VEVENT') continue;
      // Skip events explicitly marked as "Free" (Transparent)
      if (ev.transparency === 'TRANSPARENT') continue;

      if (ev.rrule) {
        // Expand recurring events
        const dates = ev.rrule.between(now, nextWeek);
        const duration = ev.end.getTime() - ev.start.getTime();
        for (const date of dates) {
          events.push({
            start: date,
            end: new Date(date.getTime() + duration)
          });
        }
      } else {
        events.push({ start: ev.start, end: ev.end });
      }
    }
    return events;
  } catch (e) {
    console.error("[shifts] Failed to fetch/parse ICS:", e.message);
    return []; // Fail open: if calendar is broken, rely on base availability
  }
}

// ── Time & Date Helpers ──────────────────────────────────────────────────────

function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  let mins = h * 60 + m;
  if (mins < 6 * 60) mins += 24 * 60; // pre-6am belongs to next "bus day"
  return mins - 6 * 60; 
}

function buildShiftDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const tz = process.env.TZ || 'America/Chicago';
  const [y, mo, d] = dateStr.split('-').map(Number);
  let [h, m] = timeStr.split(':').map(Number);
  let isNextDay = h < 6;

  const pad = (n) => String(n).padStart(2, '0');
  const localIso = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(m)}:00`;
  
  let dateObj = fromZonedTime(localIso, tz);
  if (isNextDay) {
    dateObj = new Date(dateObj.getTime() + 24 * 60 * 60 * 1000);
  }
  return dateObj;
}

// ── Filter shifts by user schedule ───────────────────────────────────────────

function shiftFitsSchedule(shift, daySchedule, icsEvents) {
  if (!shift.driver || shift.driver !== '**OPEN**') return false;
  if (shift.priority >= 3) return false;
  if (!shift.start || !shift.end || !shift.date) return false;
  if (!daySchedule || !daySchedule.enabled) return false;

  const windows = daySchedule.windows || [];
  if (windows.length === 0) return false;

  const shiftStartMins = timeToMinutes(shift.start);
  const shiftEndMins   = timeToMinutes(shift.end);

  // 1. Check if it fits the manual availability window
  const fitsWindow = windows.some(w => {
    const wStart = timeToMinutes(w.start);
    const wEnd   = timeToMinutes(w.end);
    return shiftStartMins >= wStart && shiftEndMins <= wEnd;
  });

  if (!fitsWindow) return false;

  // 2. If ICS events exist, ensure there are no overlapping busy blocks
  if (icsEvents && icsEvents.length > 0) {
    const shiftStart = buildShiftDate(shift.date, shift.start);
    const shiftEnd = buildShiftDate(shift.date, shift.end);
    
    if (!shiftStart || !shiftEnd) return false;

    const hasConflict = icsEvents.some(ev => {
      // standard overlap formula: (StartA < EndB) and (EndA > StartB)
      return shiftStart < ev.end && shiftEnd > ev.start;
    });

    if (hasConflict) return false; // Calendar says busy!
  }

  return true;
}

// ── Get next 7 days of open shifts filtered by user schedule ─────────────────

async function getFilteredShifts(data, schedule) {
  const days = data.days || {};
  const result = {}; 
  
  // Fetch calendar if provided
  const icsEvents = await fetchIcsEvents(schedule.icsUrl);

  for (const [dayKey, dayData] of Object.entries(days)) {
    const daySchedule = schedule[dayKey.toLowerCase()] || schedule[dayKey];
    const label = `${dayData.name} — ${dayData.date}`;
    const filtered = (dayData.signups || []).filter(s =>
      shiftFitsSchedule(s, daySchedule, icsEvents)
    );
    if (filtered.length > 0) {
      result[label] = filtered;
    }
  }

  return result;
}

// ── Detect new shifts (not previously seen) ───────────────────────────────────

async function getNewShifts(data, schedule, { isSeen }) {
  const days = data.days || {};
  const result = {}; 

  const icsEvents = await fetchIcsEvents(schedule.icsUrl);

  for (const [dayKey, dayData] of Object.entries(days)) {
    const daySchedule = schedule[dayKey.toLowerCase()] || schedule[dayKey];
    const label = `${dayData.name} — ${dayData.date}`;
    const newOnes = (dayData.signups || []).filter(s => {
      if (!shiftFitsSchedule(s, daySchedule, icsEvents)) return false;
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