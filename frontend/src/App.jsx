import { useState, useEffect, useCallback } from 'react';

// ── Day meta ──────────────────────────────────────────────────────────────────
const DAYS = [
  { key: 'monday',    label: 'Monday' },
  { key: 'tuesday',   label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday' },
  { key: 'friday',    label: 'Friday' },
  { key: 'saturday',  label: 'Saturday' },
  { key: 'sunday',    label: 'Sunday' },
];

// Generate time options: 06:00 through 05:45 (next morning), in 15-min steps
function generateTimes() {
  const times = [];
  for (let wrap = 0; wrap < 2; wrap++) {
    const startH = wrap === 0 ? 6 : 0;
    const endH   = wrap === 0 ? 24 : 6;
    for (let h = startH; h < endH; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        times.push(`${hh}:${mm}`);
      }
    }
  }
  return times;
}
const TIME_OPTIONS = generateTimes();

function fmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${period}`;
}

const ROUTE_COLORS = {
  Red: '#ef4444', Blue: '#3b82f6', Green: '#22c55e', Gold: '#f5a623',
  Orange: '#f97316', Brown: '#92400e', Plum: '#7c3aed', Cardinal: '#9f1239',
  Cherry: '#be185d', Lilac: '#8b5cf6', Peach: '#fb923c', Extra: '#6b7280',
  GrShut: '#059669', Finals: '#0ea5e9', EASE: '#14b8a6',
};
function routeColor(route) {
  if (!route) return '#6b7280';
  for (const [k, v] of Object.entries(ROUTE_COLORS)) {
    if (route.startsWith(k)) return v;
  }
  return '#6b7280';
}

// ── Defaults ──────────────────────────────────────────────────────────────────
function defaultDay() {
  return { enabled: false, windows: [{ start: '08:00', end: '17:00' }] };
}
function defaultSchedule() {
  return Object.fromEntries(DAYS.map(d => [d.key, defaultDay()]));
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [schedule, setSchedule]     = useState(defaultSchedule());
  const [icsUrl, setIcsUrl]         = useState('');
  const [preview, setPreview]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState(null);
  const [tab, setTab]               = useState('schedule');

  // Load saved schedule
  useEffect(() => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        if (data.icsUrl) setIcsUrl(data.icsUrl);
        const sched = { ...data };
        delete sched.icsUrl; // Separate URL from days
        if (Object.keys(sched).length > 0) {
          setSchedule(s => ({ ...defaultSchedule(), ...sched }));
        }
      })
      .catch(() => {});
  }, []);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const saveSchedule = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...schedule, icsUrl }),
      });
      showToast('Schedule saved!');
    } catch { showToast('Failed to save', 'error'); }
    setSaving(false);
  }, [schedule, icsUrl]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setTab('preview');
    try {
      const r = await fetch('/api/shifts');
      const data = await r.json();
      setPreview(data);
    } catch { showToast('Could not load shifts', 'error'); }
    setLoading(false);
  }, []);

  const sendTestEmail = useCallback(async () => {
    try {
      const r = await fetch('/api/test-email', { method: 'POST' });
      const data = await r.json();
      if (data.ok) showToast('Test email sent! Check your inbox.');
      else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Could not send email', 'error'); }
  }, []);

  // ── Day toggle / window editing ─────────────────────────────────────────────
  function toggleDay(dayKey) {
    setSchedule(s => ({
      ...s,
      [dayKey]: { ...s[dayKey], enabled: !s[dayKey].enabled }
    }));
  }
  function addWindow(dayKey) {
    setSchedule(s => ({
      ...s,
      [dayKey]: {
        ...s[dayKey],
        windows: [...(s[dayKey].windows || []), { start: '08:00', end: '17:00' }]
      }
    }));
  }
  function removeWindow(dayKey, idx) {
    setSchedule(s => ({
      ...s,
      [dayKey]: {
        ...s[dayKey],
        windows: s[dayKey].windows.filter((_, i) => i !== idx)
      }
    }));
  }
  function updateWindow(dayKey, idx, field, value) {
    setSchedule(s => {
      const windows = s[dayKey].windows.map((w, i) =>
        i === idx ? { ...w, [field]: value } : w
      );
      return { ...s, [dayKey]: { ...s[dayKey], windows } };
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>🚌</span>
            <div>
              <div style={styles.logoTitle}>CyRide Notifier</div>
              <div style={styles.logoSub}>Open Shift Alerts</div>
            </div>
          </div>
          <div style={styles.headerActions}>
            <button style={styles.btnOutline} onClick={loadPreview}>
              Preview Shifts
            </button>
            <button style={styles.btnOutline} onClick={sendTestEmail}>
              Send Test Email
            </button>
            <button style={styles.btnPrimary} onClick={saveSchedule} disabled={saving}>
              {saving ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'schedule' ? styles.tabActive : {}) }}
            onClick={() => setTab('schedule')}
          >Availability Schedule</button>
          <button
            style={{ ...styles.tab, ...(tab === 'preview' ? styles.tabActive : {}) }}
            onClick={loadPreview}
          >Live Shift Preview</button>
        </div>
      </header>

      <main style={styles.main}>
        {tab === 'schedule' && (
          <div>
            <div style={styles.infoBox}>
              <strong>How it works:</strong> Set your overall working availability using the toggles below. 
              By pasting your <strong>Google Calendar ICS Link</strong>, the system will automatically hide shifts that conflict with any of your classes or events.
            </div>

            {/* Calendar Link Section */}
            <div style={{ ...styles.dayCard, marginBottom: 24, padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <h3 style={{ margin: 0, fontSize: 16 }}>Google Calendar Sync</h3>
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
                To get your secret iCal link in Google Calendar: Settings &gt; Your Calendar &gt; "Secret address in iCal format".
              </p>
              <input 
                type="text" 
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                style={styles.textInput}
              />
            </div>

            <h3 style={{ fontSize: 18, marginBottom: 16, color: 'var(--text)' }}>Base Availability</h3>
            <div style={styles.dayGrid}>
              {DAYS.map(({ key, label }) => {
                const day = schedule[key] || defaultDay();
                return (
                  <div key={key} style={{ ...styles.dayCard, ...(day.enabled ? styles.dayCardActive : {}) }}>
                    <div style={styles.dayHeader}>
                      <div style={styles.dayLabel}>
                        <div style={{
                          ...styles.dayDot,
                          background: day.enabled ? 'var(--red)' : 'var(--border)'
                        }} />
                        {label}
                      </div>
                      <label style={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={day.enabled}
                          onChange={() => toggleDay(key)}
                          style={{ display: 'none' }}
                        />
                        <div style={{
                          ...styles.toggleTrack,
                          background: day.enabled ? 'var(--red)' : 'var(--border)'
                        }}>
                          <div style={{
                            ...styles.toggleThumb,
                            transform: day.enabled ? 'translateX(20px)' : 'translateX(2px)'
                          }} />
                        </div>
                      </label>
                    </div>

                    {day.enabled && (
                      <div style={styles.windows}>
                        {(day.windows || []).map((w, idx) => (
                          <div key={idx} style={styles.windowRow}>
                            <div style={styles.windowLabel}>Window {idx + 1}</div>
                            <div style={styles.windowSelects}>
                              <select
                                value={w.start}
                                onChange={e => updateWindow(key, idx, 'start', e.target.value)}
                                style={styles.timeSelect}
                              >
                                {TIME_OPTIONS.map(t => (
                                  <option key={t} value={t}>{fmt12(t)}</option>
                                ))}
                              </select>
                              <span style={styles.toLabel}>to</span>
                              <select
                                value={w.end}
                                onChange={e => updateWindow(key, idx, 'end', e.target.value)}
                                style={styles.timeSelect}
                              >
                                {TIME_OPTIONS.map(t => (
                                  <option key={t} value={t}>{fmt12(t)}</option>
                                ))}
                              </select>
                              {day.windows.length > 1 && (
                                <button
                                  style={styles.removeBtn}
                                  onClick={() => removeWindow(key, idx)}
                                >✕</button>
                              )}
                            </div>
                          </div>
                        ))}
                        <button style={styles.addBtn} onClick={() => addWindow(key)}>
                          + Add Time Window
                        </button>
                      </div>
                    )}

                    {!day.enabled && (
                      <div style={styles.disabledMsg}>Not available — no notifications for this day</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <button style={{ ...styles.btnPrimary, padding: '14px 48px', fontSize: 16 }}
                onClick={saveSchedule} disabled={saving}>
                {saving ? 'Saving…' : '💾 Save Schedule'}
              </button>
            </div>
          </div>
        )}

        {tab === 'preview' && (
          <div>
            {loading && (
              <div style={styles.loading}>
                <div style={styles.spinner} />
                Loading current open shifts…
              </div>
            )}
            {!loading && preview !== null && (
              Object.keys(preview).length === 0
                ? <div style={styles.empty}>
                    No open shifts match your current schedule.<br />
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Check your availability windows or make sure the schedule is saved.
                    </span>
                  </div>
                : Object.entries(preview).map(([dayLabel, shiftList]) => (
                    <div key={dayLabel} style={styles.previewDay}>
                      <h2 style={styles.previewDayTitle}>{dayLabel}</h2>
                      <div style={styles.shiftGrid}>
                        {shiftList.map((s, i) => (
                          <div key={i} style={styles.shiftCard}>
                            <div style={styles.shiftTop}>
                              <div style={styles.runBadge}>{s.run}</div>
                              <div style={{
                                ...styles.routePill,
                                background: routeColor(s.route) + '33',
                                color: routeColor(s.route),
                                borderColor: routeColor(s.route) + '66',
                              }}>{s.route || '—'}</div>
                              {s.overtime && (
                                <div style={styles.otBadge}>OT</div>
                              )}
                            </div>
                            <div style={styles.shiftTime}>
                              {s.start} → {s.end}
                            </div>
                            <div style={styles.shiftHours}>{s.hours}h</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
            )}
            {!loading && preview === null && (
              <div style={styles.empty}>Click "Preview Shifts" to load current open shifts matching your schedule.</div>
            )}
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.type === 'error' ? '#7f1d1d' : '#14532d',
          borderColor: toast.type === 'error' ? '#ef4444' : '#22c55e',
        }}>
          {toast.type === 'error' ? '⚠️' : '✓'} {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  app: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },

  header: {
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 100,
  },
  headerInner: {
    maxWidth: 1100, margin: '0 auto', padding: '16px 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoIcon: { fontSize: 28 },
  logoTitle: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' },
  logoSub: { fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)' },
  headerActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },

  btnPrimary: {
    background: 'var(--red)', color: '#fff', border: 'none',
    padding: '9px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
    transition: 'background .15s',
  },
  btnOutline: {
    background: 'transparent', color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '9px 20px', borderRadius: 8, fontWeight: 500, fontSize: 14,
  },

  tabs: {
    maxWidth: 1100, margin: '0 auto', padding: '0 24px',
    display: 'flex', gap: 0, borderTop: '1px solid var(--border)',
  },
  tab: {
    background: 'none', border: 'none', color: 'var(--muted)',
    padding: '12px 20px', fontSize: 14, fontWeight: 500,
    borderBottom: '2px solid transparent', cursor: 'pointer',
  },
  tabActive: { color: 'var(--red)', borderBottom: '2px solid var(--red)' },

  main: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px', width: '100%' },

  infoBox: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '14px 20px', marginBottom: 28,
    fontSize: 14, lineHeight: 1.7, color: 'var(--muted)',
  },

  textInput: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontFamily: 'var(--mono)',
    fontSize: '14px'
  },

  dayGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16,
  },
  dayCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '20px', transition: 'border-color .2s',
  },
  dayCardActive: { borderColor: 'var(--red)' },

  dayHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dayLabel: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 16 },
  dayDot: { width: 10, height: 10, borderRadius: '50%', transition: 'background .2s' },

  toggle: { cursor: 'pointer' },
  toggleTrack: {
    width: 44, height: 24, borderRadius: 12, position: 'relative',
    transition: 'background .2s',
  },
  toggleThumb: {
    position: 'absolute', top: 2, width: 20, height: 20,
    background: '#fff', borderRadius: '50%', transition: 'transform .2s',
  },

  windows: { display: 'flex', flexDirection: 'column', gap: 12 },
  windowRow: {},
  windowLabel: { fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 4 },
  windowSelects: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  timeSelect: {
    background: 'var(--surface2)', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px',
    fontSize: 13, fontFamily: 'var(--mono)',
  },
  toLabel: { color: 'var(--muted)', fontSize: 12 },
  removeBtn: {
    background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
    borderRadius: 6, padding: '4px 10px', fontSize: 12,
  },
  addBtn: {
    background: 'none', border: '1px dashed var(--border)', color: 'var(--muted)',
    borderRadius: 6, padding: '8px', fontSize: 12, width: '100%', marginTop: 4,
  },
  disabledMsg: { fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' },

  // Preview
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 12, color: 'var(--muted)', padding: 64, fontSize: 15,
  },
  spinner: {
    width: 20, height: 20, border: '2px solid var(--border)',
    borderTopColor: 'var(--red)', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  empty: {
    textAlign: 'center', color: 'var(--muted)', padding: '64px 32px',
    fontSize: 15, lineHeight: 2,
  },

  previewDay: { marginBottom: 40 },
  previewDayTitle: {
    fontSize: 18, fontWeight: 700, color: 'var(--red)',
    borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 16,
    fontFamily: 'var(--mono)',
  },
  shiftGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 12,
  },
  shiftCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '14px 16px',
  },
  shiftTop: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' },
  runBadge: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '3px 8px', fontSize: 12,
    fontFamily: 'var(--mono)', fontWeight: 600,
  },
  routePill: {
    border: '1px solid', borderRadius: 999, padding: '2px 8px',
    fontSize: 11, fontWeight: 600,
  },
  otBadge: {
    background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444',
    borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700,
  },
  shiftTime: { fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text)', marginBottom: 4 },
  shiftHours: { fontSize: 12, color: 'var(--muted)' },

  toast: {
    position: 'fixed', bottom: 24, right: 24,
    border: '1px solid', borderRadius: 10,
    padding: '12px 20px', fontSize: 14, fontWeight: 500,
    zIndex: 9999, backdropFilter: 'blur(8px)',
    animation: 'slideUp 0.3s ease',
    maxWidth: 340,
  },
};

// Inject keyframes
const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
`;
document.head.appendChild(styleEl);