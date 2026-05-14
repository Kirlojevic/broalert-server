const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const RESROBOT = '6c964869-c6ab-4d2c-863e-5f9a8463cde0';
const STOPS = {
  hyllie: '740001586',
  triangeln: '740001587',
  malmoC: '740000003',
  lund: '740000120',
  kastrup: '740000670'
};

async function fetchDepartures(stopId) {
  const url = 'https://api.resrobot.se/v2.1/departureBoard?id=' + stopId + '&maxJourneys=12&format=json&accessId=' + RESROBOT;
  const r = await fetch(url);
  return await r.json();
}

// Main departures endpoint - what the frontend calls
app.get('/api/departures', async (req, res) => {
  try {
    const stop = req.query.stop || 'hyllie';
    const stopId = STOPS[stop] || STOPS.hyllie;
    res.json(await fetchDepartures(stopId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Alias for backwards compatibility
app.get('/api/hyllie', async (req, res) => {
  try {
    res.json(await fetchDepartures(STOPS.hyllie));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/route-status', async (req, res) => {
  let hasDisruption = false, disruptions = [], results = {};
  for (const [name, id] of [['hyllie', STOPS.hyllie], ['triangeln', STOPS.triangeln], ['malmoC', STOPS.malmoC]]) {
    try {
      const data = await fetchDepartures(id);
      const deps = data.Departure || [];
      const cancelled = deps.filter(d => d.cancelled === true || d.Cancelled === 'true');
      results[name] = { departures: deps.length, cancelled: cancelled.length };
      if (cancelled.length > 0) {
        hasDisruption = true;
        cancelled.forEach(d => disruptions.push({
          type: 'cancelled',
          stop: name,
          train: d.name || 'Train',
          direction: d.direction || '',
          scheduledTime: d.time
        }));
      }
    } catch (e) {
      results[name] = { error: e.message };
    }
  }
  res.json({ hasDisruption, disruptions, stops: results, timestamp: new Date().toISOString() });
});

app.get('/api/stops', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'query required' });
  try {
    const url = 'https://api.resrobot.se/v2.1/location.name?input=' + encodeURIComponent(q) + '&maxNo=10&format=json&accessId=' + RESROBOT;
    const r = await fetch(url);
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve the BroAlert frontend inline - no separate index.html needed
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BroAlert</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0b;
    color: #f0f0f0;
    min-height: 100vh;
    max-width: 440px;
    margin: 0 auto;
    padding: 20px 16px 80px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .logo {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .logo span { color: #1fd67a; }
  .status-pill {
    font-size: 12px;
    font-weight: 500;
    padding: 6px 14px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .status-pill.ok { background: rgba(31,214,122,0.12); color: #1fd67a; border: 0.5px solid rgba(31,214,122,0.3); }
  .status-pill.err { background: rgba(255,77,77,0.12); color: #ff4d4d; border: 0.5px solid rgba(255,77,77,0.3); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .route-box {
    background: #1a1a1d;
    border-radius: 14px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    border: 0.5px solid rgba(255,255,255,0.08);
  }
  .route-from, .route-to { flex: 1; }
  .route-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .route-name { font-size: 16px; font-weight: 500; }
  .route-arrow { color: #555; font-size: 18px; margin: 0 16px; }
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 18px;
    background: #1a1a1d;
    padding: 4px;
    border-radius: 12px;
  }
  .tab {
    flex: 1;
    text-align: center;
    padding: 10px 0;
    font-size: 13px;
    color: #888;
    border-radius: 9px;
    cursor: pointer;
    font-weight: 500;
  }
  .tab.on { background: #2a2a2d; color: #f0f0f0; }
  .section-label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 6px 0 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .badge {
    font-size: 9px;
    background: rgba(31,214,122,0.15);
    color: #1fd67a;
    padding: 3px 8px;
    border-radius: 20px;
    letter-spacing: 0.5px;
    border: 0.5px solid rgba(31,214,122,0.25);
  }
  .dep-list { background: #1a1a1d; border-radius: 12px; overflow: hidden; border: 0.5px solid rgba(255,255,255,0.08); }
  .dep-row { padding: 14px 16px; border-bottom: 0.5px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; }
  .dep-row:last-child { border-bottom: none; }
  .dep-line { font-weight: 600; font-size: 15px; }
  .dep-dest { font-size: 12px; color: #888; margin-top: 2px; }
  .dep-time { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .dep-time.delayed { color: #ffb344; }
  .dep-time.cancelled { color: #ff4d4d; text-decoration: line-through; }
  .empty, .loading { padding: 28px 16px; text-align: center; color: #666; font-size: 13px; }
  .err-box {
    background: rgba(255,77,77,0.08);
    border: 0.5px solid rgba(255,77,77,0.3);
    border-radius: 12px;
    padding: 16px;
    color: #ff8080;
    font-size: 13px;
    line-height: 1.5;
  }
  .refresh {
    width: 100%;
    background: #1a1a1d;
    color: #f0f0f0;
    border: 0.5px solid rgba(255,255,255,0.1);
    padding: 12px;
    border-radius: 12px;
    margin-top: 14px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  .refresh:hover { background: #2a2a2d; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">Bro<span>Alert</span></div>
    <div id="status-pill" class="status-pill ok"><span class="dot"></span><span id="status-text">Live</span></div>
  </div>

  <div class="route-box">
    <div class="route-from">
      <div class="route-label">From</div>
      <div class="route-name">Hyllie</div>
    </div>
    <div class="route-arrow">→</div>
    <div class="route-to">
      <div class="route-label">To</div>
      <div class="route-name">København H</div>
    </div>
  </div>

  <div class="tabs">
    <div class="tab on">Status</div>
    <div class="tab">Options</div>
    <div class="tab">Community</div>
    <div class="tab">My log</div>
  </div>

  <div class="section-label">
    <span>Live departures from Hyllie</span>
    <span class="badge">TRAFIKLAB</span>
  </div>

  <div id="dep-container" class="dep-list">
    <div class="loading">Loading live departures…</div>
  </div>

  <button class="refresh" onclick="loadDepartures()">Refresh</button>

<script>
  function fmtTime(t) {
    if (!t) return '--:--';
    return t.substring(0, 5);
  }

  function setStatus(ok, text) {
    var pill = document.getElementById('status-pill');
    var txt = document.getElementById('status-text');
    pill.className = 'status-pill ' + (ok ? 'ok' : 'err');
    txt.textContent = text;
  }

  async function loadDepartures() {
    var container = document.getElementById('dep-container');
    container.innerHTML = '<div class="loading">Loading live departures…</div>';
    try {
      var res = await fetch('/api/departures?stop=hyllie');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      if (data.error) throw new Error(data.error);
      if (data.errorCode) throw new Error(data.errorText || data.errorCode);

      var deps = data.Departure || [];
      if (deps.length === 0) {
        container.innerHTML = '<div class="empty">No upcoming departures.</div>';
        setStatus(true, 'No data');
        return;
      }

      var html = '';
      for (var i = 0; i < deps.length; i++) {
        var d = deps[i];
        var cancelled = d.cancelled === true || d.Cancelled === 'true';
        var line = (d.ProductAtStop && d.ProductAtStop.displayNumber) || d.transportNumber || d.name || '';
        var dest = d.direction || d.directionFlag || '';
        var time = fmtTime(d.time);
        var rtTime = d.rtTime ? fmtTime(d.rtTime) : null;
        var delayed = rtTime && rtTime !== time;

        var timeClass = cancelled ? 'cancelled' : (delayed ? 'delayed' : '');
        var timeDisplay = cancelled ? time : (rtTime || time);

        html += '<div class="dep-row">' +
                  '<div>' +
                    '<div class="dep-line">' + escapeHtml(line) + '</div>' +
                    '<div class="dep-dest">' + escapeHtml(dest) + '</div>' +
                  '</div>' +
                  '<div class="dep-time ' + timeClass + '">' + timeDisplay + '</div>' +
                '</div>';
      }
      container.innerHTML = html;
      setStatus(true, 'Live');
    } catch (err) {
      container.innerHTML = '<div class="err-box">Could not load departures.<br>' + escapeHtml(err.message) + '</div>';
      setStatus(false, 'Error');
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function(c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  loadDepartures();
  setInterval(loadDepartures, 30000);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('BroAlert server running on port ' + PORT));
