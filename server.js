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

app.get('/api/stations', (req, res) => res.json(STATIONS));

// Main endpoint: trip planning between FROM and TO
app.get('/api/trip', async (req, res) => {
  try {
    const fromId = req.query.from;
    const toId = req.query.to;
    if (!fromId || !toId) return res.status(400).json({ error: 'from and to required' });

    const url = 'https://api.resrobot.se/v2.1/trip' +
      '?originId=' + fromId +
      '&destId=' + toId +
      '&format=json' +
      '&numF=6' +
      '&accessId=' + RESROBOT;

    const r = await fetch(url);
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kept for diagnostics: raw departures from a single station
app.get('/api/departures', async (req, res) => {
  try {
    const stopId = req.query.id;
    if (!stopId) return res.status(400).json({ error: 'station id required' });
    const url = 'https://api.resrobot.se/v2.1/departureBoard?id=' + stopId + '&maxJourneys=12&format=json&accessId=' + RESROBOT;
    const rr = await fetch(url);
    res.json(await rr.json());
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

  .trip-list { display: flex; flex-direction: column; gap: 10px; }
  .trip-card { background: #1a1a1d; border-radius: 14px; padding: 14px 16px; border: 0.5px solid rgba(255,255,255,0.08); }
  .trip-card.cancelled { border-color: rgba(255,77,77,0.4); background: rgba(255,77,77,0.04); }
  .trip-card.delayed { border-color: rgba(255,179,68,0.3); }

  .trip-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 4px; }
  .trip-times { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .trip-times .arrow { color: #555; margin: 0 6px; }
  .trip-times.cancelled { color: #ff4d4d; text-decoration: line-through; }
  .trip-times.delayed { color: #ffb344; }
  .trip-times .orig { font-size: 12px; color: #666; text-decoration: line-through; margin-right: 4px; font-weight: 400; }
  .trip-duration { font-size: 12px; color: #888; font-variant-numeric: tabular-nums; }

  .trip-meta { font-size: 12px; color: #aaa; margin-bottom: 8px; }
  .trip-meta .lines { color: #f0f0f0; font-weight: 500; }

  .trip-status { font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
  .trip-status .sdot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .trip-status.on-time { color: #1fd67a; }
  .trip-status.delayed { color: #ffb344; }
  .trip-status.cancelled { color: #ff4d4d; }

  .trip-legs { margin-top: 10px; padding-top: 10px; border-top: 0.5px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 6px; }
  .leg-row { font-size: 11px; color: #888; display: flex; gap: 6px; align-items: baseline; }
  .leg-row .leg-time { color: #ccc; font-variant-numeric: tabular-nums; min-width: 38px; }
  .leg-row .leg-dot { color: #1fd67a; }
  .leg-row.cancelled .leg-time { color: #ff4d4d; text-decoration: line-through; }
  .leg-row.cancelled .leg-dot { color: #ff4d4d; }

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
    Danish station routing is limited until the Rejseplanen API is connected.
  </div>

  <div class="section-label">
    <span>Next journeys <span id="route-summary">Hyllie → København H</span></span>
    <span class="badge">TRAFIKLAB</span>
  </div>

  <div id="trip-container" class="trip-list">
    <div class="loading">Loading next journeys…</div>
  </div>

  <button class="refresh" onclick="loadTrips()">Refresh</button>

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
    document.getElementById('route-summary').textContent = state.from.name + ' → ' + state.to.name;
    var hasDanish = state.from.country === 'DK' || state.to.country === 'DK';
    document.getElementById('info-note').style.display = hasDanish ? 'block' : 'none';
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
    loadTrips();
  }

  function swapStations() {
    var tmp = state.from;
    state.from = state.to;
    state.to = tmp;
    saveRoute();
    renderRoute();
    loadTrips();
  }

  function fmtTime(t) { return t ? t.substring(0, 5) : '--:--'; }

  function parseToMin(t) {
    if (!t) return 0;
    var p = t.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function delayMin(scheduled, actual) {
    var s = parseToMin(scheduled);
    var a = parseToMin(actual);
    var diff = a - s;
    if (diff < -720) diff += 24 * 60;
    return diff;
  }

  function parseDurationISO(iso) {
    // PT1H22M or PT22M
    if (!iso) return '';
    var m = iso.match(/PT(?:(\\d+)H)?(?:(\\d+)M)?/);
    if (!m) return '';
    var h = parseInt(m[1] || '0', 10);
    var min = parseInt(m[2] || '0', 10);
    if (h === 0) return min + ' min';
    return h + ' h ' + min + ' min';
  }

  function setStatus(ok, text) {
    var pill = document.getElementById('status-pill');
    pill.className = 'status-pill ' + (ok ? 'ok' : 'err');
    document.getElementById('status-text').textContent = text;
  }

  async function loadTrips() {
    var container = document.getElementById('trip-container');
    container.innerHTML = '<div class="loading">Loading next journeys…</div>';
    try {
      var url = '/api/trip?from=' + encodeURIComponent(state.from.id) + '&to=' + encodeURIComponent(state.to.id);
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      if (data.error) throw new Error(data.error);
      if (data.errorCode) throw new Error(data.errorText || data.errorCode);

      var trips = data.Trip || [];
      if (trips.length === 0) {
        container.innerHTML = '<div class="empty">No journeys found between these stations right now.</div>';
        setStatus(true, 'No data');
        return;
      }

      var html = '';
      var cancelledCount = 0, delayedCount = 0;

      for (var i = 0; i < trips.length; i++) {
        var trip = trips[i];
        var legs = (trip.LegList && trip.LegList.Leg) || [];
        if (!Array.isArray(legs)) legs = [legs];

        var transportLegs = legs.filter(function(l) { return l.type !== 'WALK'; });
        if (transportLegs.length === 0) continue;

        var firstLeg = transportLegs[0];
        var lastLeg = transportLegs[transportLegs.length - 1];

        var origin = firstLeg.Origin || {};
        var dest = lastLeg.Destination || {};

        var depTime = fmtTime(origin.time);
        var depRt = origin.rtTime ? fmtTime(origin.rtTime) : null;
        var arrTime = fmtTime(dest.time);
        var arrRt = dest.rtTime ? fmtTime(dest.rtTime) : null;

        var tripCancelled = legs.some(function(l) { return l.cancelled === true; });
        var depDelay = (depRt && depRt !== depTime) ? delayMin(depTime, depRt) : 0;
        var arrDelay = (arrRt && arrRt !== arrTime) ? delayMin(arrTime, arrRt) : 0;
        var maxDelay = Math.max(depDelay, arrDelay);
        var isDelayed = !tripCancelled && maxDelay > 0;

        if (tripCancelled) cancelledCount++;
        else if (isDelayed) delayedCount++;

        // Lines (train names)
        var lineNames = transportLegs.map(function(l) {
          return (l.Product && (l.Product.displayNumber || l.Product.name)) || l.name || '';
        }).filter(Boolean);
        var linesText = lineNames.join(' → ');

        var changes = transportLegs.length - 1;
        var changesText = changes === 0 ? 'Direct' : (changes + ' change' + (changes > 1 ? 's' : ''));
        var duration = parseDurationISO(trip.duration);

        // Status badge
        var statusClass, statusText;
        if (tripCancelled) {
          statusClass = 'cancelled';
          statusText = 'Cancelled';
        } else if (isDelayed) {
          statusClass = 'delayed';
          statusText = 'Delayed by ' + maxDelay + ' min';
        } else {
          statusClass = 'on-time';
          statusText = 'On time';
        }

        // Times display
        var depDisplay, arrDisplay;
        if (tripCancelled) {
          depDisplay = depTime;
          arrDisplay = arrTime;
        } else {
          depDisplay = (depRt && depRt !== depTime) ? '<span class="orig">' + depTime + '</span>' + depRt : depTime;
          arrDisplay = (arrRt && arrRt !== arrTime) ? '<span class="orig">' + arrTime + '</span>' + arrRt : arrTime;
        }

        var cardClass = tripCancelled ? ' cancelled' : (isDelayed ? ' delayed' : '');
        var timesClass = tripCancelled ? ' cancelled' : (isDelayed ? ' delayed' : '');

        // Build legs detail if there are changes
        var legsHtml = '';
        if (changes > 0) {
          legsHtml = '<div class="trip-legs">';
          for (var j = 0; j < transportLegs.length; j++) {
            var l = transportLegs[j];
            var lOrig = l.Origin || {};
            var lDest = l.Destination || {};
            var lDep = (lOrig.rtTime ? fmtTime(lOrig.rtTime) : fmtTime(lOrig.time));
            var lArr = (lDest.rtTime ? fmtTime(lDest.rtTime) : fmtTime(lDest.time));
            var lName = (l.Product && (l.Product.displayNumber || l.Product.name)) || l.name || '';
            var lCancelClass = l.cancelled ? ' cancelled' : '';
            legsHtml += '<div class="leg-row' + lCancelClass + '">' +
                          '<span class="leg-dot">●</span>' +
                          '<span class="leg-time">' + lDep + '</span>' +
                          '<span>' + escapeHtml(lOrig.name || '') + ' → ' + escapeHtml(lDest.name || '') + ' (' + escapeHtml(lName) + ')</span>' +
                        '</div>';
          }
          legsHtml += '</div>';
        }

        html += '<div class="trip-card' + cardClass + '">' +
                  '<div class="trip-top">' +
                    '<div class="trip-times' + timesClass + '">' + depDisplay + '<span class="arrow">→</span>' + arrDisplay + '</div>' +
                    '<div class="trip-duration">' + duration + '</div>' +
                  '</div>' +
                  '<div class="trip-meta"><span class="lines">' + escapeHtml(linesText) + '</span> · ' + changesText + '</div>' +
                  '<div class="trip-status ' + statusClass + '"><span class="sdot"></span>' + statusText + '</div>' +
                  legsHtml +
                '</div>';
      }

      container.innerHTML = html || '<div class="empty">No journeys found.</div>';

      // Overall status pill
      if (cancelledCount === trips.length) setStatus(false, 'All cancelled');
      else if (cancelledCount > 0) setStatus(false, cancelledCount + ' cancelled');
      else if (delayedCount > 0) setStatus(true, delayedCount + ' delayed');
      else setStatus(true, 'Live');
    } catch (err) {
      container.innerHTML = '<div class="err-box">Could not load journeys.<br>' + escapeHtml(err.message) + '</div>';
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
  loadStations().then(loadTrips);
  setInterval(loadTrips, 30000);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('BroAlert server running on port ' + PORT));
