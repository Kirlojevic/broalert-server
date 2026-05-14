const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const RESROBOT = '6c964869-c6ab-4d2c-863e-5f9a8463cde0';

const STATIONS = [
  { id: '740001586', name: 'Hyllie',           country: 'SE' },
  { id: '740001587', name: 'Triangeln',        country: 'SE' },
  { id: '740000003', name: 'Malmö C',          country: 'SE' },
  { id: '740000120', name: 'Lund C',           country: 'SE' },
  { id: '740098001', name: 'Helsingborg C',    country: 'SE' },
  { id: '740000670', name: 'Kastrup Lufthavn', country: 'DK' },
  { id: '740000787', name: 'København H',      country: 'DK' },
  { id: '740000792', name: 'Nørreport',        country: 'DK' },
  { id: '740000788', name: 'Ørestad',          country: 'DK' },
  { id: '740000789', name: 'Tårnby',           country: 'DK' }
];

async function fetchDepartures(stopId) {
  const url = 'https://api.resrobot.se/v2.1/departureBoard?id=' + stopId + '&maxJourneys=15&format=json&accessId=' + RESROBOT;
  const r = await fetch(url);
  return await r.json();
}

app.get('/api/stations', (req, res) => res.json(STATIONS));

app.get('/api/departures', async (req, res) => {
  try {
    const stopId = req.query.id;
    if (!stopId) return res.status(400).json({ error: 'station id required' });
    res.json(await fetchDepartures(stopId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BroAlert</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0b; color: #f0f0f0; min-height: 100vh; max-width: 440px; margin: 0 auto; padding: 20px 16px 80px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .logo { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
  .logo span { color: #1fd67a; }
  .status-pill { font-size: 12px; font-weight: 500; padding: 6px 14px; border-radius: 20px; display: flex; align-items: center; gap: 6px; }
  .status-pill.ok { background: rgba(31,214,122,0.12); color: #1fd67a; border: 0.5px solid rgba(31,214,122,0.3); }
  .status-pill.err { background: rgba(255,77,77,0.12); color: #ff4d4d; border: 0.5px solid rgba(255,77,77,0.3); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

  .route-box { background: #1a1a1d; border-radius: 14px; padding: 14px; display: flex; align-items: center; gap: 8px; margin-bottom: 18px; border: 0.5px solid rgba(255,255,255,0.08); }
  .route-side { flex: 1; cursor: pointer; padding: 4px 6px; border-radius: 8px; }
  .route-side:hover, .route-side:active { background: rgba(255,255,255,0.04); }
  .route-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .route-name { font-size: 16px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
  .flag { font-size: 11px; opacity: 0.6; }
  .swap-btn { width: 36px; height: 36px; border-radius: 50%; background: #2a2a2d; border: 0.5px solid rgba(255,255,255,0.1); color: #1fd67a; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.2s; }
  .swap-btn:hover { transform: rotate(180deg); }
  .swap-btn:active { background: #1fd67a; color: #0a0a0b; }

  .tabs { display: flex; gap: 4px; margin-bottom: 18px; background: #1a1a1d; padding: 4px; border-radius: 12px; }
  .tab { flex: 1; text-align: center; padding: 10px 0; font-size: 13px; color: #888; border-radius: 9px; cursor: pointer; font-weight: 500; }
  .tab.on { background: #2a2a2d; color: #f0f0f0; }

  .section-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 6px 0 8px; display: flex; justify-content: space-between; align-items: center; }
  .badge { font-size: 9px; background: rgba(31,214,122,0.15); color: #1fd67a; padding: 3px 8px; border-radius: 20px; letter-spacing: 0.5px; border: 0.5px solid rgba(31,214,122,0.25); }

  .dep-list { background: #1a1a1d; border-radius: 12px; overflow: hidden; border: 0.5px solid rgba(255,255,255,0.08); }
  .dep-row { padding: 14px 16px; border-bottom: 0.5px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .dep-row:last-child { border-bottom: none; }
  .dep-info { min-width: 0; flex: 1; }
  .dep-line { font-weight: 600; font-size: 15px; }
  .dep-dest { font-size: 12px; color: #888; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dep-status { font-size: 11px; font-weight: 500; margin-top: 6px; display: flex; align-items: center; gap: 5px; }
  .dep-status .sdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .dep-status.on-time { color: #1fd67a; }
  .dep-status.delayed { color: #ffb344; }
  .dep-status.cancelled { color: #ff4d4d; }
  .dep-time { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; text-align: right; }
  .dep-time.delayed { color: #ffb344; }
  .dep-time.cancelled { color: #ff4d4d; text-decoration: line-through; }
  .dep-time .orig { font-size: 11px; font-weight: 400; color: #666; text-decoration: line-through; margin-right: 5px; }
  .empty, .loading { padding: 28px 16px; text-align: center; color: #666; font-size: 13px; }
  .err-box { background: rgba(255,77,77,0.08); border: 0.5px solid rgba(255,77,77,0.3); border-radius: 12px; padding: 16px; color: #ff8080; font-size: 13px; line-height: 1.5; }
  .info-note { background: rgba(255,179,68,0.08); border: 0.5px solid rgba(255,179,68,0.3); border-radius: 12px; padding: 12px 14px; color: #ffb344; font-size: 12px; line-height: 1.4; margin-bottom: 14px; }
  .refresh { width: 100%; background: #1a1a1d; color: #f0f0f0; border: 0.5px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; margin-top: 14px; cursor: pointer; font-size: 13px; font-weight: 500; }
  .refresh:hover { background: #2a2a2d; }

  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); display: none; align-items: flex-end; justify-content: center; z-index: 100; }
  .modal-bg.on { display: flex; }
  .modal { background: #1a1a1d; width: 100%; max-width: 440px; border-radius: 18px 18px 0 0; padding: 20px 16px 24px; max-height: 80vh; overflow-y: auto; border-top: 0.5px solid rgba(255,255,255,0.1); }
  .modal-title { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
  .modal-sub { font-size: 12px; color: #888; margin-bottom: 16px; }
  .station-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: 10px; cursor: pointer; border: 0.5px solid transparent; margin-bottom: 4px; }
  .station-item:hover { background: #2a2a2d; }
  .station-item.selected { background: rgba(31,214,122,0.1); border-color: rgba(31,214,122,0.3); }
  .station-name { font-size: 15px; font-weight: 500; }
  .station-country { font-size: 11px; padding: 3px 8px; border-radius: 20px; background: rgba(255,255,255,0.05); }
  .station-country.SE { color: #4d9eff; }
  .station-country.DK { color: #ff8a4d; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">Bro<span>Alert</span></div>
    <div id="status-pill" class="status-pill ok"><span class="dot"></span><span id="status-text">Live</span></div>
  </div>

  <div class="route-box">
    <div class="route-side" onclick="openPicker('from')">
      <div class="route-label">From</div>
      <div class="route-name"><span id="from-name">Hyllie</span> <span class="flag" id="from-flag">SE</span></div>
    </div>
    <button class="swap-btn" onclick="swapStations()" title="Swap direction">⇄</button>
    <div class="route-side" onclick="openPicker('to')">
      <div class="route-label">To</div>
      <div class="route-name"><span id="to-name">København H</span> <span class="flag" id="to-flag">DK</span></div>
    </div>
  </div>

  <div class="tabs">
    <div class="tab on">Status</div>
    <div class="tab">Options</div>
    <div class="tab">Community</div>
    <div class="tab">My log</div>
  </div>

  <div id="info-note" class="info-note" style="display:none">
    Danish station departures are limited until the Rejseplanen API is connected. Swedish stations show full live data.
  </div>

  <div class="section-label">
    <span>Live departures from <span id="dep-source">Hyllie</span></span>
    <span class="badge">TRAFIKLAB</span>
  </div>

  <div id="dep-container" class="dep-list">
    <div class="loading">Loading live departures…</div>
  </div>

  <button class="refresh" onclick="loadDepartures()">Refresh</button>

  <div id="picker-bg" class="modal-bg" onclick="closePickerIfBg(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-title" id="picker-title">Pick a station</div>
      <div class="modal-sub" id="picker-sub">Tap to select</div>
      <div id="station-list"></div>
    </div>
  </div>

<script>
  var STATIONS = [];
  var state = {
    from: { id: '740001586', name: 'Hyllie', country: 'SE' },
    to:   { id: '740000787', name: 'København H', country: 'DK' }
  };
  var pickerTarget = null;

  try {
    var saved = localStorage.getItem('broalert-route');
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed.from && parsed.to) state = parsed;
    }
  } catch (e) {}

  function saveRoute() {
    try { localStorage.setItem('broalert-route', JSON.stringify(state)); } catch (e) {}
  }

  function renderRoute() {
    document.getElementById('from-name').textContent = state.from.name;
    document.getElementById('to-name').textContent = state.to.name;
    document.getElementById('from-flag').textContent = state.from.country;
    document.getElementById('to-flag').textContent = state.to.country;
    document.getElementById('dep-source').textContent = state.from.name;
    document.getElementById('info-note').style.display = (state.from.country === 'DK') ? 'block' : 'none';
  }

  async function loadStations() {
    try {
      var res = await fetch('/api/stations');
      STATIONS = await res.json();
    } catch (e) {}
  }

  function openPicker(target) {
    pickerTarget = target;
    document.getElementById('picker-title').textContent = target === 'from' ? 'Travelling from' : 'Travelling to';
    document.getElementById('picker-sub').textContent = target === 'from' ? 'Pick the station you are leaving from' : 'Pick the station you want to reach';

    var list = document.getElementById('station-list');
    var currentId = state[target].id;
    var otherId = state[target === 'from' ? 'to' : 'from'].id;

    var html = '';
    for (var i = 0; i < STATIONS.length; i++) {
      var s = STATIONS[i];
      if (s.id === otherId) continue;
      var sel = (s.id === currentId) ? ' selected' : '';
      html += '<div class="station-item' + sel + '" onclick="pickStation(\\'' + s.id + '\\')">' +
                '<div class="station-name">' + escapeHtml(s.name) + '</div>' +
                '<div class="station-country ' + s.country + '">' + s.country + '</div>' +
              '</div>';
    }
    list.innerHTML = html;
    document.getElementById('picker-bg').classList.add('on');
  }

  function closePickerIfBg(e) { if (e.target.id === 'picker-bg') closePicker(); }
  function closePicker() { document.getElementById('picker-bg').classList.remove('on'); }

  function pickStation(id) {
    var station = STATIONS.find(function(s) { return s.id === id; });
    if (!station) return;
    state[pickerTarget] = station;
    saveRoute();
    renderRoute();
    closePicker();
    if (pickerTarget === 'from') loadDepartures();
  }

  function swapStations() {
    var tmp = state.from;
    state.from = state.to;
    state.to = tmp;
    saveRoute();
    renderRoute();
    loadDepartures();
  }

  function fmtTime(t) {
    if (!t) return '--:--';
    return t.substring(0, 5);
  }

  function parseToMin(t) {
    if (!t) return 0;
    var p = t.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function delayMin(scheduled, actual) {
    var s = parseToMin(scheduled);
    var a = parseToMin(actual);
    var diff = a - s;
    if (diff < -720) diff += 24 * 60; // midnight rollover
    return diff;
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
      var res = await fetch('/api/departures?id=' + state.from.id);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      if (data.error) throw new Error(data.error);
      if (data.errorCode) throw new Error(data.errorText || data.errorCode);

      var deps = data.Departure || [];
      if (deps.length === 0) {
        var msg = state.from.country === 'DK'
          ? 'No departures returned. Danish stations need the Rejseplanen API (coming soon).'
          : 'No upcoming departures.';
        container.innerHTML = '<div class="empty">' + msg + '</div>';
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
        var delay = (rtTime && rtTime !== time) ? delayMin(time, rtTime) : 0;
        var isDelayed = !cancelled && delay > 0;

        // Status label + class
        var statusClass, statusText;
        if (cancelled) {
          statusClass = 'cancelled';
          statusText = 'Cancelled';
        } else if (isDelayed) {
          statusClass = 'delayed';
          statusText = 'Delayed by ' + delay + ' min';
        } else {
          statusClass = 'on-time';
          statusText = 'On time';
        }

        // Time column
        var timeClass = cancelled ? 'cancelled' : (isDelayed ? 'delayed' : '');
        var timeHtml;
        if (cancelled) {
          timeHtml = time;
        } else if (isDelayed) {
          timeHtml = '<span class="orig">' + time + '</span>' + rtTime;
        } else {
          timeHtml = time;
        }

        html += '<div class="dep-row">' +
                  '<div class="dep-info">' +
                    '<div class="dep-line">' + escapeHtml(line) + '</div>' +
                    '<div class="dep-dest">' + escapeHtml(dest) + '</div>' +
                    '<div class="dep-status ' + statusClass + '"><span class="sdot"></span>' + statusText + '</div>' +
                  '</div>' +
                  '<div class="dep-time ' + timeClass + '">' + timeHtml + '</div>' +
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

  renderRoute();
  loadStations().then(loadDepartures);
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
