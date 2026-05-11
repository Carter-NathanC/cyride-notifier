import { useState, useEffect, useCallback } from 'react';

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

function formatAmPm(timeStr) {
  if (!timeStr) return '';
  let [h, m] = timeStr.split(':').map(Number);
  if (h >= 24) h -= 24; // Handle CyRide overnight formats like 25:30
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function App() {
  const [calendar, setCalendar] = useState(null);
  const [shifts, setShifts]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState(null);
  const [tab, setTab]           = useState('calendar'); // 'calendar' | 'shifts'

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [calRes, shiftRes] = await Promise.all([
        fetch('/api/calendar').then(r => r.json()),
        fetch('/api/shifts').then(r => r.json())
      ]);
      setCalendar(calRes);
      setShifts(shiftRes);
    } catch {
      showToast('Error loading data from server', 'error');
    }
    setLoading(false);
  }, []);

  // Load initially
  useEffect(() => { loadData(); }, [loadData]);

  const sendTestEmail = async () => {
    try {
      const r = await fetch('/api/test-email', { method: 'POST' });
      const data = await r.json();
      if (data.ok) showToast('Test email sent! Check your inbox.');
      else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Could not send email', 'error'); }
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>🚌</span>
            <div>
              <div style={styles.logoTitle}>CyRide Notifier</div>
              <div style={styles.logoSub}>Google Calendar Sync</div>
            </div>
          </div>
          <div style={styles.headerActions}>
            <button style={styles.btnOutline} onClick={loadData}>
              ↻ Refresh
            </button>
            <button style={styles.btnPrimary} onClick={sendTestEmail}>
              Send Test Email
            </button>
          </div>
        </div>
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'calendar' ? styles.tabActive : {}) }}
            onClick={() => setTab('calendar')}
          >Calendar Events (Busy)</button>
          <button
            style={{ ...styles.tab, ...(tab === 'shifts' ? styles.tabActive : {}) }}
            onClick={() => setTab('shifts')}
          >Available Shifts</button>
        </div>
      </header>

      <main style={styles.main}>
        {loading && (
          <div style={styles.loading}>
            <div style={styles.spinner} />
            Syncing data...
          </div>
        )}

        {!loading && tab === 'calendar' && calendar && (
          <div>
            <div style={styles.infoBox}>
              <strong>Calendar Synced:</strong> Your availability is calculated from Google Calendar.
              Shifts are hidden if they conflict with these events, exceed 10.5 total hours, exceed a 16-hour spread, run 6 hours without a 30m break, or violate a 9-hour overnight rest.
            </div>

            <div style={styles.dayGrid}>
              {Object.entries(calendar).map(([dateLabel, events]) => (
                <div key={dateLabel} style={styles.dayCard}>
                  <div style={styles.dayLabel}>{dateLabel}</div>
                  
                  {events.length === 0 ? (
                    <div style={styles.disabledMsg}>No events — Fully open!</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {events.map((ev, i) => (
                        <div key={i} style={styles.eventBlock}>
                          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                            {ev.summary}
                          </div>
                          <div style={{ color: 'var(--muted)', fontSize: '13px', fontFamily: 'var(--mono)' }}>
                            {ev.startStr} - {ev.endStr}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && tab === 'shifts' && shifts && (
          <div>
            {Object.keys(shifts).length === 0 ? (
              <div style={styles.empty}>
                No open shifts fit your current schedule.<br />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  All open shifts overlap with calendar events or violate shift scheduling rules.
                </span>
              </div>
            ) : (
              Object.entries(shifts).map(([dayLabel, shiftList]) => (
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
                          {formatAmPm(s.start)} → {formatAmPm(s.end)}
                        </div>
                        <div style={styles.shiftHours}>{s.hours}h</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

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
    transition: 'background .15s', cursor: 'pointer'
  },
  btnOutline: {
    background: 'transparent', color: 'var(--text)',
    border: '1px solid var(--border)', cursor: 'pointer',
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

  dayGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },
  dayCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '20px', 
  },
  dayLabel: { 
    fontWeight: 600, fontSize: 16, color: 'var(--text)', 
    marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10
  },
  
  eventBlock: {
    background: 'var(--surface2)',
    borderLeft: '3px solid var(--gold)',
    padding: '10px 14px',
    borderRadius: '6px',
    fontSize: '14px'
  },

  disabledMsg: { fontSize: 14, color: 'var(--muted)', fontStyle: 'italic', padding: '10px 0' },

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

const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
`;
document.head.appendChild(styleEl);