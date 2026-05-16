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

const CORRIDOR_ORDER = [
  'København H', 'Nørreport', 'Ørestad', 'Tårnby', 'Kastrup Lufthavn',
  'Hyllie', 'Triangeln', 'Malmö C', 'Lund C', 'Helsingborg C'
];

const FAR_NORTH = ['Helsingborg', 'Göteborg', 'Halmstad', 'Karlskrona', 'Kalmar', 'Hässleholm',
                   'Kristianstad', 'Ängelholm', 'Landskrona', 'Stockholm', 'Hallsberg',
                   'Eslöv', 'Höör', 'Sösdala', 'Markaryd', 'Kävlinge'];
const FAR_SOUTH = ['København', 'Köpenhamn', 'Köpenhavn', 'Helsingør', 'Roskilde',
                   'Kalundborg', 'Holbæk', 'Nykøbing', 'Lufthavnen', 'Lufthavn',
                   'Airport', 'Trelleborg', 'Næstved', 'Ringsted'];

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

async function fetchDeparturesCached(stopId) {
  const key = 'dep:' + stopId;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && (now - cached.time) < CACHE_TTL_MS) return cached.data;

  const url = 'https://api.resrobot.se/v2.1/departureBoard?id=' + stopId +
              '&maxJourneys=25&passlist=1&format=json&accessId=' + RESROBOT;
  const r = await fetch(url);
  const data = await r.json();
  cache.set(key, { data, time: now });
  return data;
}

function getMode(dep) {
  var product = dep.ProductAtStop || (dep.Product && dep.Product[0]) || dep.Product || {};
  var cat = ((product.catOut || product.catOutS || product.catOutL || '') + '').toLowerCase();
  var icon = ((product.icon && product.icon.res) || '').toLowerCase();
  var name = ((product.name || '') + '').toLowerCase();

  if (cat.indexOf('buss') >= 0 || cat.indexOf('bus') >= 0 || icon.indexOf('bus') >= 0 || name.indexOf('buss ') >= 0) return 'bus';
  if (cat.indexOf('tåg') >= 0 || cat.indexOf('train') >= 0 || cat.indexOf('pågatåg') >= 0 || cat.indexOf('öresund') >= 0 || icon.indexOf('ic') >= 0 || icon.indexOf('train') >= 0) return 'train';
  var catCode = product.catCode;
  if (catCode !== undefined) {
    catCode = parseInt(catCode, 10);
    if (catCode <= 2) return 'train';
    if (catCode === 5 || catCode === 7) return 'bus';
  }
  return 'other';
}

function isReplacementBus(dep) {
  var product = dep.ProductAtStop || (dep.Product && dep.Product[0]) || dep.Product || {};
  var blob = ((product.name || '') + ' ' + (product.catOut || '') + ' ' + (product.catOutL || '') + ' ' + (dep.name || '') + ' ' + (dep.direction || '')).toLowerCase();
  var notes = '';
  if (dep.Notes && dep.Notes.Note) {
    var ns = Array.isArray(dep.Notes.Note) ? dep.Notes.Note : [dep.Notes.Note];
    notes = ns.map(function(n) { return (n.value || n.txtN || '') + ''; }).join(' ').toLowerCase();
  }
  return /ersätt|replac|skenersättning|spårersättning|train replacement|rail replacement/.test(blob + ' ' + notes);
}

function normName(n) {
  return (n || '').toLowerCase().replace(/[\s\.\,;:]/g, '');
}

// Primary check: does this train pass through any of the "useful" stations after the current one?
// usefulIds + usefulNames represent all stations remaining on the route after currentStation.
function trainAdvancesTowardRoute(dep, currentId, currentName, usefulIds, usefulNames) {
  if (!dep.Stops) return null;
  var stops = dep.Stops.Stop;
  if (!stops) return null;
  if (!Array.isArray(stops)) stops = [stops];
  if (stops.length === 0) return null;

  // Find current station position in train's passlist
  var currentIdx = -1;
  var currentN = normName(currentName);
  for (var i = 0; i < stops.length; i++) {
    var s = stops[i];
    var matchId = currentId && (s.extId === currentId || s.id === currentId);
    var matchName = false;
    if (!matchId && currentN) {
      var sn = normName(s.name);
      matchName = (sn === currentN) || (sn.endsWith(currentN));
    }
    if (matchId || matchName) { currentIdx = i; break; }
  }

  // Build normalized useful name set once
  var usefulN = [];
  if (usefulNames) for (var k = 0; k < usefulNames.length; k++) usefulN.push(normName(usefulNames[k]));

  // Look at stops AFTER current (or from start if not found)
  var startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
  for (var j = startIdx; j < stops.length; j++) {
    var stop = stops[j];
    if (usefulIds) {
      for (var u = 0; u < usefulIds.length; u++) {
        if (stop.extId === usefulIds[u] || stop.id === usefulIds[u]) return true;
      }
    }
    if (usefulN.length > 0 && stop.name) {
      var sn2 = normName(stop.name);
      for (var n = 0; n < usefulN.length; n++) {
        if (usefulN[n] && (sn2 === usefulN[n] || sn2.endsWith(usefulN[n]))) return true;
      }
    }
  }
  return false;
}

// Heuristic fallback (no passlist): train direction must be in the correct corridor direction
function headingInRightDirection(direction, currentStation, destStation) {
  if (!direction) return false;
  var dir = direction.trim();
  if (dir === destStation) return true;
  var destN = normName(destStation);
  if (destN && normName(dir).endsWith(destN)) return true;

  var currPos = CORRIDOR_ORDER.indexOf(currentStation);
  var destPos = CORRIDOR_ORDER.indexOf(destStation);
  if (currPos === -1 || destPos === -1) return true;

  var goingNorth = destPos > currPos;
  var dirPos = CORRIDOR_ORDER.indexOf(dir);
  if (dirPos !== -1) {
    if (goingNorth) return dirPos > currPos; // any station past current in right direction
    return dirPos < currPos;
  }
  var farList = goingNorth ? FAR_NORTH : FAR_SOUTH;
  for (var i = 0; i < farList.length; i++) {
    if (dir.toLowerCase().indexOf(farList[i].toLowerCase()) >= 0) return true;
  }
  return false;
}

function simplifyDeparture(dep) {
  var product = dep.ProductAtStop || (dep.Product && dep.Product[0]) || dep.Product || {};
  return {
    line: product.displayNumber || product.line || dep.transportNumber || dep.name || '',
    productName: product.name || '',
    direction: dep.direction || '',
    time: dep.time || '',
    rtTime: dep.rtTime || null,
    cancelled: dep.cancelled === true || dep.Cancelled === 'true',
    mode: getMode(dep),
    isReplacement: isReplacementBus(dep),
    _raw: dep
  };
}

app.get('/api/stations', (req, res) => res.json(STATIONS));

app.get('/api/line-scan', async (req, res) => {
  try {
    const fromId = req.query.from;
    const toId = req.query.to;
    if (!fromId || !toId) return res.status(400).json({ error: 'from and to required' });

    const fromStation = STATIONS.find(s => s.id === fromId);
    const toStation = STATIONS.find(s => s.id === toId);
    if (!fromStation || !toStation) return res.status(400).json({ error: 'unknown stations' });

    const fromPos = CORRIDOR_ORDER.indexOf(fromStation.name);
    const toPos = CORRIDOR_ORDER.indexOf(toStation.name);
    if (fromPos === -1 || toPos === -1) {
      return res.json({ from: fromStation, to: toStation, supported: false, stations: [] });
    }

    // Build the ordered list of stations along the route from FROM to TO
    let names = [];
    if (fromPos < toPos) for (let i = fromPos; i <= toPos; i++) names.push(CORRIDOR_ORDER[i]);
    else for (let i = fromPos; i >= toPos; i--) names.push(CORRIDOR_ORDER[i]);
    const routeStops = names.map(name => STATIONS.find(s => s.name === name)).filter(Boolean);

    const results = [];
    for (let i = 0; i < routeStops.length; i++) {
      const stop = routeStops[i];
      const isDestination = stop.name === toStation.name;
      const isOrigin = stop.name === fromStation.name;

      if (isDestination) {
        results.push({ name: stop.name, country: stop.country, isDestination: true, trains: [] });
        continue;
      }

      // Useful stops = all stations remaining on the route AFTER this one
      const remaining = routeStops.slice(i + 1);
      const remainingIds = remaining.map(s => s.id);
      const remainingNames = remaining.map(s => s.name);

      try {
        const data = await fetchDeparturesCached(stop.id);
        const allDeps = (data.Departure || []).map(simplifyDeparture);

        const trains = allDeps
          .filter(d => d.mode === 'train')
          .filter(d => {
            const advances = trainAdvancesTowardRoute(d._raw, stop.id, stop.name, remainingIds, remainingNames);
            if (advances === true) return true;
            if (advances === false) return false;
            // Fallback when passlist missing
            return headingInRightDirection(d.direction, stop.name, toStation.name);
          })
          .slice(0, 4)
          .map(d => ({
            line: d.line, productName: d.productName, direction: d.direction,
            time: d.time, rtTime: d.rtTime, cancelled: d.cancelled
          }));

        results.push({ name: stop.name, country: stop.country, isOrigin, trains });
      } catch (e) {
        results.push({ name: stop.name, country: stop.country, isOrigin, error: e.message, trains: [] });
      }
    }

    res.json({ from: fromStation, to: toStation, supported: true, stations: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/buses', async (req, res) => {
  try {
    const stopId = req.query.id;
    const destName = req.query.dest;
    const destId = req.query.destId;
    if (!stopId) return res.status(400).json({ error: 'station id required' });

    const data = await fetchDeparturesCached(stopId);
    const all = (data.Departure || []).map(simplifyDeparture);
    const stop = STATIONS.find(s => s.id === stopId);

    let buses = all.filter(d => d.mode === 'bus').map(d => {
      let towardDest = false;
      if ((destId || destName) && stop) {
        const passes = trainAdvancesTowardRoute(d._raw, stopId, stop.name, destId ? [destId] : null, destName ? [destName] : null);
        if (passes === true) towardDest = true;
        else if (passes === null) towardDest = headingInRightDirection(d.direction, stop.name, destName);
      }
      return {
        line: d.line, productName: d.productName, direction: d.direction,
        time: d.time, rtTime: d.rtTime, cancelled: d.cancelled,
        isReplacement: d.isReplacement, likelyTowardDest: towardDest
      };
    });

    buses.sort((a, b) => {
      if (a.isReplacement !== b.isReplacement) return a.isReplacement ? -1 : 1;
      if (a.likelyTowardDest !== b.likelyTowardDest) return a.likelyTowardDest ? -1 : 1;
      return (a.time || '').localeCompare(b.time || '');
    });

    res.json({ buses: buses.slice(0, 8) });
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
  .status-pill.warn { background: rgba(255,179,68,0.12); color: #ffb344; border: 0.5px solid rgba(255,179,68,0.3); }
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

  .section-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 8px; display: flex; justify-content: space-between; align-items: center; }
  .section-label:first-of-type { margin-top: 6px; }
  .badge { font-size: 9px; padding: 3px 8px; border-radius: 20px; letter-spacing: 0.5px; }
  .badge-trafiklab { background: rgba(31,214,122,0.15); color: #1fd67a; border: 0.5px solid rgba(31,214,122,0.25); }
  .badge-bus { background: rgba(77,158,255,0.15); color: #4d9eff; border: 0.5px solid rgba(77,158,255,0.25); }

  .line-scan { position: relative; padding-left: 24px; }
  .line-scan::before { content: ''; position: absolute; left: 9px; top: 12px; bottom: 12px; width: 2px; background: rgba(255,255,255,0.1); }
  .scan-station { position: relative; padding: 4px 0 18px; }
  .scan-station::before { content: ''; position: absolute; left: -19px; top: 12px; width: 12px; height: 12px; border-radius: 50%; background: #1a1a1d; border: 2px solid #1fd67a; }
  .scan-station.origin::before { background: #1fd67a; }
  .scan-station.destination::before { background: #1fd67a; }
  .scan-station.has-issue::before { border-color: #ffb344; }
  .scan-station.all-cancelled::before { border-color: #ff4d4d; background: rgba(255,77,77,0.2); }
  .scan-station-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .scan-station-name { font-size: 15px; font-weight: 600; }
  .scan-station-name .flag-mini { font-size: 10px; color: #666; margin-left: 6px; font-weight: 400; }
  .scan-station-tag { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .scan-trains { display: flex; flex-direction: column; gap: 6px; }
  .scan-train { background: #1a1a1d; border: 0.5px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .scan-train.cancelled { border-color: rgba(255,77,77,0.4); background: rgba(255,77,77,0.06); }
  .scan-train.delayed { border-color: rgba(255,179,68,0.3); }
  .train-info { min-width: 0; flex: 1; }
  .train-line { font-size: 13px; font-weight: 600; }
  .train-direction { font-size: 11px; color: #888; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .train-status { font-size: 10px; margin-top: 4px; display: flex; align-items: center; gap: 4px; font-weight: 500; }
  .train-status .sdot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .train-status.on-time { color: #1fd67a; }
  .train-status.delayed { color: #ffb344; }
  .train-status.cancelled { color: #ff4d4d; }
  .train-time { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .train-time.delayed { color: #ffb344; }
  .train-time.cancelled { color: #ff4d4d; text-decoration: line-through; }
  .train-time .orig { display: block; font-size: 10px; color: #666; text-decoration: line-through; font-weight: 400; text-align: right; }
  .scan-empty { font-size: 12px; color: #666; padding: 8px 12px; font-style: italic; }
  .scan-destination { color: #1fd67a; font-size: 13px; padding: 4px 0; }

  .bus-section { background: #1a1a1d; border-radius: 12px; padding: 12px 14px; border: 0.5px solid rgba(255,255,255,0.08); margin-bottom: 10px; }
  .bus-section-head { font-size: 12px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
  .bus-flag-mini { font-size: 10px; color: #888; font-weight: 400; }
  .bus-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 0.5px solid rgba(255,255,255,0.05); gap: 10px; }
  .bus-row:first-of-type { border-top: none; }
  .bus-info { min-width: 0; flex: 1; }
  .bus-line { font-size: 13px; font-weight: 500; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .bus-tag { font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 600; letter-spacing: 0.3px; }
  .bus-tag.replacement { background: #ffb344; color: #1a1a1d; }
  .bus-tag.toward { background: rgba(31,214,122,0.15); color: #1fd67a; }
  .bus-direction { font-size: 11px; color: #888; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bus-time { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .bus-time.cancelled { color: #ff4d4d; text-decoration: line-through; }
  .bus-empty { font-size: 12px; color: #666; padding: 6px 0; font-style: italic; }

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

  <div id="info-note" class="info-note" style="display:none"></div>

  <div class="section-label">
    <span>Trains along your route</span>
    <span class="badge badge-trafiklab">TRAFIKLAB</span>
  </div>

  <div id="scan-container">
    <div class="loading">Scanning the line…</div>
  </div>

  <div class="section-label">
    <span>Buses &amp; replacements at your endpoints</span>
    <span class="badge badge-bus">BUSES</span>
  </div>

  <div id="bus-container">
    <div class="loading">Checking buses…</div>
  </div>

  <button class="refresh" onclick="loadEverything()">Refresh</button>

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
    loadEverything();
  }

  function swapStations() {
    var tmp = state.from;
    state.from = state.to;
    state.to = tmp;
    saveRoute();
    renderRoute();
    loadEverything();
  }

  function fmtTime(t) { return t ? t.substring(0, 5) : '--:--'; }
  function parseToMin(t) { if (!t) return 0; var p = t.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function delayMin(s, a) { var d = parseToMin(a) - parseToMin(s); if (d < -720) d += 24 * 60; return d; }

  function setStatus(level, text) {
    var pill = document.getElementById('status-pill');
    pill.className = 'status-pill ' + level;
    document.getElementById('status-text').textContent = text;
  }

  function renderTrainRow(train) {
    var time = fmtTime(train.time);
    var rt = train.rtTime ? fmtTime(train.rtTime) : null;
    var delay = (rt && rt !== time) ? delayMin(time, rt) : 0;
    var cancelled = train.cancelled;
    var isDelayed = !cancelled && delay > 0;

    var statusClass, statusText;
    if (cancelled) { statusClass = 'cancelled'; statusText = 'Cancelled'; }
    else if (isDelayed) { statusClass = 'delayed'; statusText = 'Delayed ' + delay + ' min'; }
    else { statusClass = 'on-time'; statusText = 'On time'; }

    var timeClass = cancelled ? 'cancelled' : (isDelayed ? 'delayed' : '');
    var timeHtml = cancelled ? time : (isDelayed ? '<span class="orig">' + time + '</span>' + rt : time);
    var cardClass = cancelled ? ' cancelled' : (isDelayed ? ' delayed' : '');

    return '<div class="scan-train' + cardClass + '">' +
             '<div class="train-info">' +
               '<div class="train-line">' + escapeHtml(train.line || train.productName || 'Train') + '</div>' +
               '<div class="train-direction">→ ' + escapeHtml(train.direction || '') + '</div>' +
               '<div class="train-status ' + statusClass + '"><span class="sdot"></span>' + statusText + '</div>' +
             '</div>' +
             '<div class="train-time ' + timeClass + '">' + timeHtml + '</div>' +
           '</div>';
  }

  function renderLineScan(data) {
    var container = document.getElementById('scan-container');

    if (!data.supported) {
      container.innerHTML = '<div class="err-box">Route between these stations is outside the supported Øresund corridor for now.</div>';
      return { allOriginCancelled: false, anyIssue: false, totalTrains: 0 };
    }

    var stations = data.stations || [];
    if (stations.length === 0) {
      container.innerHTML = '<div class="empty">No stations to scan.</div>';
      return { allOriginCancelled: false, anyIssue: false, totalTrains: 0 };
    }

    var html = '<div class="line-scan">';
    var anyIssue = false, totalTrains = 0, allOriginCancelled = false;

    for (var i = 0; i < stations.length; i++) {
      var st = stations[i];
      var trains = st.trains || [];

      if (st.isDestination) {
        html += '<div class="scan-station destination">' +
                  '<div class="scan-station-head">' +
                    '<div class="scan-station-name">' + escapeHtml(st.name) + ' <span class="flag-mini">' + st.country + '</span></div>' +
                    '<div class="scan-station-tag">Destination</div>' +
                  '</div>' +
                  '<div class="scan-destination">Arrival station — buses below if needed</div>' +
                '</div>';
        continue;
      }

      var cancelledHere = trains.filter(function(t) { return t.cancelled; }).length;
      var delayedHere = trains.filter(function(t) { return !t.cancelled && t.rtTime && t.rtTime !== t.time; }).length;
      var stationClass = '';
      if (trains.length > 0 && cancelledHere === trains.length) { stationClass = ' all-cancelled'; anyIssue = true; if (st.isOrigin) allOriginCancelled = true; }
      else if (cancelledHere > 0 || delayedHere > 0) { stationClass = ' has-issue'; anyIssue = true; }
      if (st.isOrigin) stationClass += ' origin';
      totalTrains += trains.length;

      var trainsHtml = '';
      if (trains.length === 0) {
        trainsHtml = '<div class="scan-empty">No trains advancing toward ' + escapeHtml(state.to.name) + ' in the next window.</div>';
      } else {
        for (var j = 0; j < trains.length; j++) trainsHtml += renderTrainRow(trains[j]);
      }

      var tag = st.isOrigin ? 'Origin' : 'Stop';
      html += '<div class="scan-station' + stationClass + '">' +
                '<div class="scan-station-head">' +
                  '<div class="scan-station-name">' + escapeHtml(st.name) + ' <span class="flag-mini">' + st.country + '</span></div>' +
                  '<div class="scan-station-tag">' + tag + '</div>' +
                '</div>' +
                '<div class="scan-trains">' + trainsHtml + '</div>' +
              '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
    return { allOriginCancelled: allOriginCancelled, anyIssue: anyIssue, totalTrains: totalTrains };
  }

  function renderBusSection(label, country, buses) {
    var html = '<div class="bus-section"><div class="bus-section-head">' + escapeHtml(label) + ' <span class="bus-flag-mini">' + country + '</span></div>';
    if (!buses || buses.length === 0) {
      html += '<div class="bus-empty">No buses listed at this station right now.</div>';
    } else {
      for (var i = 0; i < buses.length; i++) {
        var b = buses[i];
        var time = fmtTime(b.time);
        var rt = b.rtTime ? fmtTime(b.rtTime) : null;
        var timeDisplay = b.cancelled ? time : (rt || time);
        var timeClass = b.cancelled ? 'cancelled' : '';
        var tags = '';
        if (b.isReplacement) tags += '<span class="bus-tag replacement">REPLACEMENT</span>';
        if (b.likelyTowardDest) tags += '<span class="bus-tag toward">TOWARD ' + escapeHtml(state.to.name.toUpperCase()) + '</span>';
        html += '<div class="bus-row">' +
                  '<div class="bus-info">' +
                    '<div class="bus-line">' + escapeHtml(b.line || 'Bus') + ' ' + tags + '</div>' +
                    '<div class="bus-direction">→ ' + escapeHtml(b.direction || '') + '</div>' +
                  '</div>' +
                  '<div class="bus-time ' + timeClass + '">' + timeDisplay + '</div>' +
                '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  async function loadEverything() {
    var scanContainer = document.getElementById('scan-container');
    var busContainer = document.getElementById('bus-container');
    var infoNote = document.getElementById('info-note');
    scanContainer.innerHTML = '<div class="loading">Scanning the line…</div>';
    busContainer.innerHTML = '<div class="loading">Checking buses…</div>';
    infoNote.style.display = 'none';
    infoNote.textContent = '';

    try {
      var scanRes = await fetch('/api/line-scan?from=' + state.from.id + '&to=' + state.to.id);
      var scanData = await scanRes.json();
      if (scanData.error) throw new Error(scanData.error);

      var summary = renderLineScan(scanData);

      var fromBusReq = fetch('/api/buses?id=' + state.from.id + '&destId=' + state.to.id + '&dest=' + encodeURIComponent(state.to.name));
      var toBusReq = fetch('/api/buses?id=' + state.to.id + '&destId=' + state.from.id + '&dest=' + encodeURIComponent(state.from.name));
      var fromBusData = await (await fromBusReq).json();
      var toBusData = await (await toBusReq).json();

      var busHtml = renderBusSection('Buses at ' + state.from.name, state.from.country, fromBusData.buses);
      busHtml += renderBusSection('Buses at ' + state.to.name, state.to.country, toBusData.buses);
      busContainer.innerHTML = busHtml;

      if (summary.allOriginCancelled) {
        setStatus('err', 'Cancelled at origin');
        infoNote.style.display = 'block';
        infoNote.textContent = 'All trains from ' + state.from.name + ' toward ' + state.to.name + ' are cancelled. Check replacement buses below — or scan the next station up the line.';
      } else if (summary.anyIssue) {
        setStatus('warn', 'Disruptions');
      } else if (summary.totalTrains > 0) {
        setStatus('ok', 'Live');
      } else {
        setStatus('warn', 'No trains found');
      }

      if (state.from.country === 'DK' || state.to.country === 'DK') {
        if (!infoNote.textContent) {
          infoNote.style.display = 'block';
          infoNote.textContent = 'Danish-side coverage is limited until the Rejseplanen API is connected.';
        }
      }
    } catch (err) {
      scanContainer.innerHTML = '<div class="err-box">Could not load line scan.<br>' + escapeHtml(err.message) + '</div>';
      busContainer.innerHTML = '';
      setStatus('err', 'Error');
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function(c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  renderRoute();
  loadStations().then(loadEverything);
  setInterval(loadEverything, 120000);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('BroAlert server running on port ' + PORT));
