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
    
    // Look back 2 days and forward 14 days
    const rangeStart = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
    const rangeEnd = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

    for (const k in data) {
      const ev = data[k];
      if (ev.type !== 'VEVENT') continue;
      
      // Skip events explicitly marked as "Free"
      if (ev.transparency === 'TRANSPARENT') continue;

      const summary = ev.summary || 'Busy';

      if (ev.rrule) {
        const origLocal = getLocalValues(ev.start);
        const duration = (ev.end ? ev.end.getTime() : ev.start.getTime()) - ev.start.getTime();
        const dates = ev.rrule.between(rangeStart, rangeEnd);
        
        // Google calendar logs deleted recurring instances in exdate
        const exdateKeys = Object.keys(ev.exdate || {});
        
        for (const date of dates) {
          const y = date.getUTCFullYear();
          const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
          const d = String(date.getUTCDate()).padStart(2, '0');
          
          // Check if this specific instance was deleted/cancelled in google calendar
          const isExcluded = exdateKeys.some(k => k.startsWith(`${y}-${mo}-${d}`));
          if (isExcluded) continue;

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

  // Pre-populate the next 7 days
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
  let isNextDay = false;

  // Handle CyRide overnight shift formats (e.g. 25:30 or 01:30)
  if (h >= 24) {
    h -= 24;
    isNextDay = true;
  } else if (h < 6) {
    isNextDay = true;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const localIso = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(m)}:00`;
  
  let dateObj = fromZonedTime(localIso, TZ);
  if (isNextDay) {
    dateObj = new Date(dateObj.getTime() + 24 * 60 * 60 * 1000);
  }
  return dateObj;
}

// ── Filter shifts by Rules and Google Calendar ───────────────────────────────

function shiftFitsSchedule(shift, icsEvents) {
  if (!shift.driver || shift.driver !== '**OPEN**') return false;
  if (shift.priority >= 3) return false; 
  if (!shift.start || !shift.end || !shift.date) return false;

  const shiftStart = buildShiftDate(shift.date, shift.start);
  const shiftEnd = buildShiftDate(shift.date, shift.end);
  if (!shiftStart || !shiftEnd) return false;

  // 1. Direct Overlap Check
  const hasConflict = icsEvents.some(ev => shiftStart < ev.end && shiftEnd > ev.start);
  if (hasConflict) return false;

  // CyRide Transit Day Window (6AM today -> 6AM tomorrow)
  const busDayStart = fromZonedTime(`${shift.date}T06:00:00`, TZ);
  const busDayEnd = new Date(busDayStart.getTime() + 24 * 3600 * 1000);

  // Grab all events occurring during this specific transit day
  const dayEvents = icsEvents.filter(ev => ev.start < busDayEnd && ev.end > busDayStart);
  
  // Combine existing calendar events + the candidate shift, sort by time
  const allActivities = [...dayEvents, { start: shiftStart, end: shiftEnd }].sort((a, b) => a.start - b.start);

  // 2. Rule: Max 10.5 hours of total time in one day
  const totalMs = allActivities.reduce((sum, ev) => sum + (ev.end - ev.start), 0);
  if (totalMs > 10.5 * 3600 * 1000) return false;

  // 3. Rule: Max 16 hours spread (Start of first to end of last)
  const spreadMs = Math.max(...allActivities.map(e => e.end)) - Math.min(...allActivities.map(e => e.start));
  if (spreadMs > 16 * 3600 * 1000) return false;

  // 4. Rule: Max 6 hours without at least a 30-minute break
  let currentBlock = { start: allActivities[0].start, end: allActivities[0].end };
  for (let i = 1; i < allActivities.length; i++) {
    const ev = allActivities[i];
    const gap = ev.start - currentBlock.end;
    
    if (gap < 30 * 60 * 1000) { // Gap is less than 30 mins, merge the continuous block
      currentBlock.end = new Date(Math.max(currentBlock.end, ev.end));
    } else {
      // Gap is 30+ mins (valid break). First, check if the preceding block violated the 6 hr limit
      if (currentBlock.end - currentBlock.start > 6 * 3600 * 1000) return false;
      // Start tracking the new block
      currentBlock = { start: ev.start, end: ev.end };
    }
  }
  // Check the final block
  if (currentBlock.end - currentBlock.start > 6 * 3600 * 1000) return false;

  // 5. Rule: Minimum 9 hours overnight between shifts
  const dayStartMs = allActivities[0].start.getTime();
  const dayEndMs = allActivities[allActivities.length - 1].end.getTime();

  // Find the most recent event prior to this day's start
  const prevEvents = icsEvents.filter(ev => ev.end <= allActivities[0].start);
  if (prevEvents.length > 0) {
    const lastPrevEndMs = Math.max(...prevEvents.map(e => e.end.getTime()));
    if (dayStartMs - lastPrevEndMs < 9 * 3600 * 1000) return false;
  }

  // Find the first event immediately following this day's end
  const nextEvents = icsEvents.filter(ev => ev.start >= allActivities[allActivities.length - 1].end);
  if (nextEvents.length > 0) {
    const firstNextStartMs = Math.min(...nextEvents.map(e => e.start.getTime()));
    if (firstNextStartMs - dayEndMs < 9 * 3600 * 1000) return false;
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