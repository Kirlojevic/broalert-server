const express = require('express');
const cors = require('cors');
const app = express();

const VERSION = 'v21-corridor-estimate-2026-05-16';

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

// Typical journey time between adjacent corridor stations (Öresundståg-class service).
// Used as a fallback when Trafiklab's passlist arrival data is missing or implausible
// (common for cross-border trains until Rejseplanen API is added).
const CORRIDOR_LEG_MINUTES = {
  'København H|Nørreport': 3,
  'Nørreport|Ørestad': 6,
  'Ørestad|Tårnby': 4,
  'Tårnby|Kastrup Lufthavn': 3,
  'Kastrup Lufthavn|Hyllie': 12,
  'Hyllie|Triangeln': 4,
  'Triangeln|Malmö C': 4,
  'Malmö C|Lund C': 13,
  'Lund C|Helsingborg C': 38
};

const FAR_NORTH = ['Helsingborg', 'Göteborg', 'Halmstad', 'Karlskrona', 'Kalmar', 'Hässleholm',
                   'Kristianstad', 'Ängelholm', 'Landskrona', 'Stockholm', 'Hallsberg',
                   'Eslöv', 'Höör', 'Sösdala', 'Markaryd', 'Kävlinge'];
const FAR_SOUTH = ['København', 'Köpenhamn', 'Köpenhavn', 'Helsingør', 'Roskilde',
                   'Kalundborg', 'Holbæk', 'Nykøbing', 'Lufthavnen', 'Lufthavn',
                   'Airport', 'Trelleborg', 'Næstved', 'Ringsted'];

const cache = new Map();
const CACHE_TTL_MS = 90 * 1000;

async function fetchDeparturesCached(stopId) {
  const key = 'dep:' + stopId;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && (now - cached.time) < CACHE_TTL_MS) return cached.data;
  const url = 'https://api.resrobot.se/v2.1/departureBoard?id=' + stopId +
              '&maxJourneys=40&passlist=1&format=json&accessId=' + RESROBOT;
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
  if (cat.indexOf('tåg') >= 0 || cat.indexOf('train') >= 0 || cat.indexOf('pågatåg') >= 0 || cat.indexOf('öresund') >= 0 || icon.indexOf('ic') >= 0 || icon.indexOf('train') >= 0 || icon.indexOf('reg') >= 0 || icon.indexOf('ir') >= 0) return 'train';
  var catCode = product.catCode;
  if (catCode !== undefined && catCode !== null) {
    catCode = parseInt(catCode, 10);
    if (!isNaN(catCode) && catCode >= 0 && catCode <= 4) return 'train';
    if (catCode === 5 || catCode === 7) return 'bus';
  }
  var t = ((dep.type || '') + '').toUpperCase();
  if (['ST', 'RE', 'RB', 'IC', 'ICE', 'IR', 'S', 'JNY', 'EC', 'EN', 'NJ'].indexOf(t) >= 0) return 'train';
  if (['BUS', 'B'].indexOf(t) >= 0) return 'bus';
  return 'other';
}

function buildCategoryBlob(dep) {
  var product = dep.ProductAtStop || (dep.Product && dep.Product[0]) || dep.Product || {};
  var pieces = [];
  var fields = ['name', 'internalName', 'displayNumber', 'line', 'lineId',
                'catOut', 'catOutS', 'catOutL', 'catIn', 'catInS',
                'operator', 'operatorCode', 'admin', 'matchId', 'cls'];
  for (var i = 0; i < fields.length; i++) {
    var v = product[fields[i]];
    if (v && (typeof v === 'string' || typeof v === 'number')) pieces.push(String(v));
  }
  if (Array.isArray(dep.Product)) {
    for (var j = 0; j < dep.Product.length; j++) {
      var p2 = dep.Product[j];
      for (var k = 0; k < fields.length; k++) {
        var vv = p2[fields[k]];
        if (vv && (typeof vv === 'string' || typeof vv === 'number')) pieces.push(String(vv));
      }
    }
  }
  if (dep.name) pieces.push(String(dep.name));
  if (dep.type) pieces.push(String(dep.type));
  if (dep.JourneyDetailRef && dep.JourneyDetailRef.title) pieces.push(String(dep.JourneyDetailRef.title));
  if (dep.Notes && dep.Notes.Note) {
    var ns = Array.isArray(dep.Notes.Note) ? dep.Notes.Note : [dep.Notes.Note];
    for (var n = 0; n < ns.length; n++) {
      if (ns[n].value) pieces.push(String(ns[n].value));
      if (ns[n].txtN) pieces.push(String(ns[n].txtN));
      if (ns[n].txtS) pieces.push(String(ns[n].txtS));
    }
  }
  return pieces.join(' ').toLowerCase();
}

function getTrainCategory(dep) {
  var blob = buildCategoryBlob(dep);
  if (blob.indexOf('öresundståg') >= 0 || blob.indexOf('öresundstog') >= 0 ||
      blob.indexOf('oresundstag') >= 0 || blob.indexOf('oresundstog') >= 0 ||
      blob.indexOf('öresund') >= 0) return { name: 'Öresundståg', cls: 'oresundstog' };
  if (blob.indexOf('pågatåg') >= 0 || blob.indexOf('pagatag') >= 0) return { name: 'Pågatåg', cls: 'pagatag' };
  if (blob.indexOf('krösatåg') >= 0 || blob.indexOf('krosatag') >= 0) return { name: 'Krösatåg', cls: 'kros' };
  if (blob.indexOf('snäll') >= 0 || blob.indexOf('snall') >= 0) return { name: 'Snälltåget', cls: 'snall' };
  if (blob.indexOf('snabbtåg') >= 0 || blob.indexOf('snabbtag') >= 0) return { name: 'SJ Snabbtåg', cls: 'sj' };
  if (blob.indexOf('intercity') >= 0) return { name: 'IC', cls: 'ic' };
  if (blob.indexOf('arriva') >= 0) return { name: 'Pågatåg', cls: 'pagatag' };
  if (blob.indexOf('transdev') >= 0 || blob.indexOf('veolia') >= 0 || blob.indexOf('dsbfirst') >= 0) return { name: 'Öresundståg', cls: 'oresundstog' };
  if (/(^|\s|-)sj(\s|$|-|ab)/.test(blob)) return { name: 'SJ', cls: 'sj' };
  if (blob.indexOf('dsb') >= 0) return { name: 'DSB', cls: 'dsb' };
  if (blob.indexOf('skånetrafiken') >= 0 || blob.indexOf('skanetrafiken') >= 0) return { name: 'Skånetrafiken', cls: 'pagatag' };
  if (/(^|\s)re\s|(^|\s)re\d/.test(blob)) return { name: 'RE', cls: 'default' };
  if (/(^|\s)ic\s|(^|\s)ic\d/.test(blob)) return { name: 'IC', cls: 'ic' };
  if (/(^|\s)ir\s|(^|\s)ir\d/.test(blob)) return { name: 'IR', cls: 'default' };
  return { name: 'Tåg', cls: 'default' };
}

function isReplacementBus(dep) {
  var blob = buildCategoryBlob(dep) + ' ' + (dep.direction || '').toLowerCase();
  return /ersätt|replac|skenersätt|spårersätt|train replacement|rail replacement|tågbuss|tåg buss|togbus|tog buss|sj buss/i.test(blob);
}

function getTrack(dep) {
  if (dep.rtTrack) return dep.rtTrack;
  if (dep.track) return dep.track;
  if (dep.Stops && dep.Stops.Stop) {
    var stops = Array.isArray(dep.Stops.Stop) ? dep.Stops.Stop : [dep.Stops.Stop];
    if (stops.length > 0) {
      var first = stops[0];
      return first.rtDepTrack || first.depTrack || first.rtTrack || first.track || null;
    }
  }
  return null;
}

function normName(n) {
  if (!n) return '';
  var s = String(n).toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/centralstation/g, 'c').replace(/centralen/g, 'c').replace(/central/g, 'c');
  s = s.replace(/köpenhamn|copenhagen|köpenhavn/g, 'københavn');
  s = s.replace(/lufthavnen/g, 'lufthavn');
  s = s.replace(/[\s\.\,;:()]/g, '');
  return s;
}

function nameWords(n) {
  if (!n) return [];
  var s = String(n).toLowerCase().replace(/\([^)]*\)/g, ' ');
  return s.split(/[\s\.\,;:]+/).filter(Boolean).map(function(w) {
    if (w.length >= 5 && w[w.length - 1] === 's') return w.slice(0, -1);
    return w;
  });
}

var GENERIC_WORDS = ['c', 'central', 'centralen', 'centralstation', 'station', 'st', 'h',
                     'lufthavn', 'lufthavnen', 'airport', 'tog', 'banegård', 'banegard',
                     'knutpunkt', 'knutpunkten'];

function isWordChar(c) { return /[a-zåäöæøéè]/i.test(c); }

function wordBoundaryContains(haystack, needle) {
  if (!haystack || !needle || needle.length < 3) return false;
  var idx = haystack.indexOf(needle);
  while (idx !== -1) {
    var before = idx === 0 ? ' ' : haystack[idx - 1];
    var after = (idx + needle.length >= haystack.length) ? ' ' : haystack[idx + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

function nameMatches(stopName, target) {
  if (!stopName || !target) return false;
  var sn = normName(stopName);
  var tn = normName(target);
  if (!sn || !tn) return false;
  if (sn === tn) return true;
  var stopL = String(stopName).toLowerCase().replace(/\([^)]*\)/g, ' ');
  var targetL = String(target).toLowerCase().replace(/\([^)]*\)/g, ' ');
  if (wordBoundaryContains(stopL, targetL)) return true;
  if (wordBoundaryContains(targetL, stopL)) return true;
  var sWords = nameWords(stopName);
  var tWords = nameWords(target);
  function distinctive(w) { return GENERIC_WORDS.indexOf(w) < 0 && w.length >= 3; }
  var sCore = sWords.filter(distinctive);
  var tCore = tWords.filter(distinctive);
  if (tCore.length === 0) return false;
  for (var i = 0; i < tCore.length; i++) {
    var found = false;
    for (var j = 0; j < sCore.length; j++) {
      if (sCore[j] === tCore[i]) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

function preferredStationName(apiName) {
  if (!apiName) return null;
  for (var i = 0; i < STATIONS.length; i++) {
    if (nameMatches(apiName, STATIONS[i].name)) return STATIONS[i].name;
  }
  return apiName;
}

// Time math helpers
function parseToMinSrv(t) {
  if (!t) return 0;
  var p = String(t).split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}
function diffMinSrv(from, to) {
  var d = parseToMinSrv(to) - parseToMinSrv(from);
  if (d < -720) d += 24 * 60;
  if (d > 720) d -= 24 * 60;
  return d;
}
function addMinutes(timeStr, mins) {
  var p = String(timeStr).split(':');
  var total = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) + mins;
  total = ((total % 1440) + 1440) % 1440;
  var hh = Math.floor(total / 60);
  var mm = total % 60;
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ':00';
}

function estimateCorridorMinutes(fromName, toName) {
  var fromIdx = CORRIDOR_ORDER.indexOf(fromName);
  var toIdx = CORRIDOR_ORDER.indexOf(toName);
  if (fromIdx === -1 || toIdx === -1) return null;
  if (fromIdx === toIdx) return 0;
  var startIdx = Math.min(fromIdx, toIdx);
  var endIdx = Math.max(fromIdx, toIdx);
  var total = 0;
  for (var i = startIdx; i < endIdx; i++) {
    var key = CORRIDOR_ORDER[i] + '|' + CORRIDOR_ORDER[i + 1];
    if (CORRIDOR_LEG_MINUTES[key] == null) return null;
    total += CORRIDOR_LEG_MINUTES[key];
  }
  return total;
}

// Returns arrival info for the user's chosen destination.
// Tries Trafiklab passlist first; if that data is missing or fails sanity,
// falls back to a corridor-leg estimate so cross-border trains still show
// a reasonable arrival time. Returns null only if the train doesn't reach
// the destination at all.
function findTrainArrivalAtDest(dep, currentId, currentName, destId, destName) {
  if (!dep.Stops || !dep.Stops.Stop) return null;
  var stops = Array.isArray(dep.Stops.Stop) ? dep.Stops.Stop : [dep.Stops.Stop];
  if (stops.length === 0) return null;

  var currentIdx = -1;
  for (var i = 0; i < stops.length; i++) {
    var s = stops[i];
    if (currentId && (s.extId === currentId || s.id === currentId)) { currentIdx = i; break; }
    if (nameMatches(s.name, currentName)) { currentIdx = i; break; }
  }
  if (currentIdx < 0) currentIdx = 0;
  var currentStop = stops[currentIdx];
  var depTimeHere = currentStop ? (currentStop.rtDepTime || currentStop.depTime || null) : null;

  for (var j = currentIdx + 1; j < stops.length; j++) {
    var stop = stops[j];
    var matchedById = destId && (stop.extId === destId || stop.id === destId);
    var matchedByName = !matchedById && nameMatches(stop.name, destName);
    if (matchedById || matchedByName) {
      var arrTime = stop.arrTime || null;
      var rtArrTime = stop.rtArrTime || null;
      var prefName = preferredStationName(stop.name) || stop.name || destName;

      // If the API gave us a time, decide if it's sane
      if ((arrTime || rtArrTime) && depTimeHere) {
        var checkAgainst = rtArrTime || arrTime;
        var journey = diffMinSrv(depTimeHere, checkAgainst);
        if (journey > 0 && journey <= 120) {
          return {
            name: prefName,
            time: arrTime,
            rtTime: rtArrTime,
            isEstimate: false,
            matchedApiName: stop.name,
            matchedExtId: stop.extId,
            matchedById: !!matchedById
          };
        }
      }

      // API time missing or implausible — fall back to corridor estimate
      if (depTimeHere) {
        var est = estimateCorridorMinutes(currentName, destName);
        if (est != null && est > 0) {
          return {
            name: prefName,
            time: addMinutes(depTimeHere, est),
            rtTime: null,
            isEstimate: true,
            matchedApiName: stop.name,
            matchedExtId: stop.extId,
            matchedById: !!matchedById
          };
        }
      }
      return null;
    }
  }
  return null;
}

function findBusArrivalAtDest(dep, destId, destName) {
  if (!dep.Stops || !dep.Stops.Stop) return null;
  var stops = Array.isArray(dep.Stops.Stop) ? dep.Stops.Stop : [dep.Stops.Stop];
  if (stops.length === 0) return null;
  var last = stops[stops.length - 1];
  var matches = (destId && (last.extId === destId || last.id === destId)) || nameMatches(last.name, destName);
  if (!matches) {
    if (!nameMatches(dep.direction, destName)) return null;
  }
  if (!last.arrTime && !last.rtArrTime) return null;
  return {
    name: preferredStationName(last.name) || last.name,
    time: last.arrTime || null,
    rtTime: last.rtArrTime || null,
    isEstimate: false
  };
}

function trainAdvancesTowardRoute(dep, currentId, currentName, usefulIds, usefulNames) {
  if (!dep.Stops) return null;
  var stops = dep.Stops.Stop;
  if (!stops) return null;
  if (!Array.isArray(stops)) stops = [stops];
  if (stops.length === 0) return null;
  var currentIdx = -1;
  for (var i = 0; i < stops.length; i++) {
    var s = stops[i];
    if (currentId && (s.extId === currentId || s.id === currentId)) { currentIdx = i; break; }
    if (nameMatches(s.name, currentName)) { currentIdx = i; break; }
  }
  var startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
  for (var j = startIdx; j < stops.length; j++) {
    var stop = stops[j];
    if (usefulIds) {
      for (var u = 0; u < usefulIds.length; u++) {
        if (stop.extId === usefulIds[u] || stop.id === usefulIds[u]) return true;
      }
    }
    if (usefulNames) {
      for (var n = 0; n < usefulNames.length; n++) {
        if (nameMatches(stop.name, usefulNames[n])) return true;
      }
    }
  }
  return false;
}

function headingInRightDirection(direction, currentStation, destStation) {
  if (!direction) return false;
  var dir = direction.trim();
  if (dir === destStation) return true;
  if (nameMatches(dir, destStation)) return true;
  var currPos = CORRIDOR_ORDER.indexOf(currentStation);
  var destPos = CORRIDOR_ORDER.indexOf(destStation);
  if (currPos === -1 || destPos === -1) return true;
  var goingNorth = destPos > currPos;
  var dirPos = CORRIDOR_ORDER.indexOf(dir);
  if (dirPos !== -1) {
    if (goingNorth) return dirPos > currPos;
    return dirPos < currPos;
  }
  var farList = goingNorth ? FAR_NORTH : FAR_SOUTH;
  for (var i = 0; i < farList.length; i++) {
    if (dir.toLowerCase().indexOf(farList[i].toLowerCase()) >= 0) return true;
  }
  return false;
}

function busEndsAtDestination(direction, destName) {
  if (!direction || !destName) return false;
  return nameMatches(direction, destName);
}

function simplifyDeparture(dep) {
  var product = dep.ProductAtStop || (dep.Product && dep.Product[0]) || dep.Product || {};
  return {
    line: product.displayNumber || product.num || product.line || dep.transportNumber || dep.name || '',
    productName: product.name || '',
    direction: dep.direction || '',
    time: dep.time || '',
    rtTime: dep.rtTime || null,
    track: getTrack(dep),
    cancelled: dep.cancelled === true || dep.Cancelled === 'true',
    mode: getMode(dep),
    isReplacement: isReplacementBus(dep),
    _raw: dep
  };
}

app.get('/api/version', (req, res) => res.json({ version: VERSION, timestamp: new Date().toISOString() }));
app.get('/api/stations', (req, res) => res.json(STATIONS));

app.get('/api/debug', async (req, res) => {
  try {
    const stopId = req.query.id || '740000003';
    const data = await fetchDeparturesCached(stopId);
    const deps = (data.Departure || []).slice(0, 5);
    res.json({
      version: VERSION, stopId, count: deps.length,
      departures: deps.map(d => ({
        classified_as: getMode(d),
        detected_category: getTrainCategory(d),
        track: getTrack(d),
        name: d.name, direction: d.direction,
        time: d.time, rtTime: d.rtTime,
        all_stops: (d.Stops && d.Stops.Stop) ? (Array.isArray(d.Stops.Stop) ? d.Stops.Stop : [d.Stops.Stop]).map(s => ({
          name: s.name, extId: s.extId,
          arrTime: s.arrTime, rtArrTime: s.rtArrTime,
          depTime: s.depTime, rtDepTime: s.rtDepTime
        })) : []
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/line-scan', async (req, res) => {
  try {
    const fromId = req.query.from;
    const toId = req.query.to;
    const debug = req.query.debug === '1';
    if (!fromId || !toId) return res.status(400).json({ error: 'from and to required' });

    const fromStation = STATIONS.find(s => s.id === fromId);
    const toStation = STATIONS.find(s => s.id === toId);
    if (!fromStation || !toStation) return res.status(400).json({ error: 'unknown stations' });

    const fromPos = CORRIDOR_ORDER.indexOf(fromStation.name);
    const toPos = CORRIDOR_ORDER.indexOf(toStation.name);
    if (fromPos === -1 || toPos === -1) {
      return res.json({ version: VERSION, from: fromStation, to: toStation, supported: false, stations: [] });
    }

    let names = [];
    if (fromPos < toPos) for (let i = fromPos; i <= toPos; i++) names.push(CORRIDOR_ORDER[i]);
    else for (let i = fromPos; i >= toPos; i--) names.push(CORRIDOR_ORDER[i]);
    const routeStops = names.map(name => STATIONS.find(s => s.name === name)).filter(Boolean);

    const results = [];
    for (let i = 0; i < routeStops.length; i++) {
      const stop = routeStops[i];
      const isDestination = stop.name === toStation.name;
      const isOrigin = stop.name === fromStation.name;

      let allDeps = [];
      let fetchError = null;
      try {
        const data = await fetchDeparturesCached(stop.id);
        allDeps = (data.Departure || []).map(simplifyDeparture);
      } catch (e) {
        fetchError = e.message;
      }

      const replacementBuses = allDeps
        .filter(d => d.mode === 'bus' && d.isReplacement)
        .slice(0, 5)
        .map(d => {
          const arr = findBusArrivalAtDest(d._raw, toStation.id, toStation.name);
          return {
            line: d.line, direction: d.direction, time: d.time, rtTime: d.rtTime,
            track: d.track, cancelled: d.cancelled,
            arrTime: arr ? arr.time : null,
            rtArrTime: arr ? arr.rtTime : null,
            arrAt: arr ? arr.name : null,
            arrIsEstimate: arr ? !!arr.isEstimate : false
          };
        });

      if (isDestination) {
        results.push({
          name: stop.name, country: stop.country, isDestination: true,
          trains: [], replacementBuses
        });
        continue;
      }

      const remaining = routeStops.slice(i + 1);
      const remainingIds = remaining.map(s => s.id);
      const remainingNames = remaining.map(s => s.name);

      const trains = allDeps
        .filter(d => d.mode === 'train')
        .filter(d => {
          const adv = trainAdvancesTowardRoute(d._raw, stop.id, stop.name, remainingIds, remainingNames);
          if (adv === true) return true;
          if (adv === false) return false;
          return headingInRightDirection(d.direction, stop.name, toStation.name);
        })
        .slice(0, 5)
        .map(d => {
          const cat = getTrainCategory(d._raw);
          const arr = findTrainArrivalAtDest(d._raw, stop.id, stop.name, toStation.id, toStation.name);
          const out = {
            line: d.line, productName: d.productName, direction: d.direction,
            time: d.time, rtTime: d.rtTime, track: d.track, cancelled: d.cancelled,
            category: cat.name, categoryClass: cat.cls,
            arrTime: arr ? arr.time : null,
            rtArrTime: arr ? arr.rtTime : null,
            arrAt: arr ? arr.name : null,
            arrIsEstimate: arr ? !!arr.isEstimate : false
          };
          if (debug) {
            out._passlist = (d._raw.Stops && d._raw.Stops.Stop)
              ? (Array.isArray(d._raw.Stops.Stop) ? d._raw.Stops.Stop : [d._raw.Stops.Stop]).map(s => ({
                  name: s.name, extId: s.extId, arrTime: s.arrTime, rtArrTime: s.rtArrTime,
                  depTime: s.depTime, rtDepTime: s.rtDepTime
                }))
              : [];
          }
          return out;
        });

      results.push({
        name: stop.name, country: stop.country, isOrigin,
        error: fetchError, trains, replacementBuses
      });
    }

    res.json({ version: VERSION, from: fromStation, to: toStation, supported: true, stations: results });
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

    let buses = all.filter(d => d.mode === 'bus').map(d => {
      const arr = findBusArrivalAtDest(d._raw, destId, destName);
      return {
        line: d.line, productName: d.productName, direction: d.direction,
        time: d.time, rtTime: d.rtTime, track: d.track, cancelled: d.cancelled,
        isReplacement: d.isReplacement,
        endsAtDest: busEndsAtDestination(d.direction, destName),
        arrTime: arr ? arr.time : null,
        rtArrTime: arr ? arr.rtTime : null,
        arrAt: arr ? arr.name : null,
        arrIsEstimate: arr ? !!arr.isEstimate : false
      };
    });
    buses = buses.filter(b => b.endsAtDest && !b.isReplacement);
    buses.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    res.json({ buses: buses.slice(0, 5) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', version: VERSION, timestamp: new Date().toISOString() }));

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
  .badge-bus { background: rgba(255,179,68,0.15); color: #ffb344; border: 0.5px solid rgba(255,179,68,0.3); }
  .notice-banner { border-radius: 12px; padding: 12px 14px; font-size: 13px; line-height: 1.45; margin-bottom: 12px; display: flex; gap: 10px; align-items: flex-start; }
  .notice-banner.escape { background: rgba(31,214,122,0.08); border: 0.5px solid rgba(31,214,122,0.3); color: #1fd67a; }
  .notice-banner.warn { background: rgba(255,179,68,0.08); border: 0.5px solid rgba(255,179,68,0.3); color: #ffb344; }
  .notice-banner.err { background: rgba(255,77,77,0.08); border: 0.5px solid rgba(255,77,77,0.3); color: #ff8080; }
  .notice-icon { font-size: 14px; line-height: 1.45; flex-shrink: 0; }
  .line-scan { position: relative; padding-left: 24px; }
  .line-scan::before { content: ''; position: absolute; left: 9px; top: 12px; bottom: 12px; width: 2px; background: rgba(255,255,255,0.1); }
  .scan-station { position: relative; padding: 4px 0 18px; }
  .scan-station::before { content: ''; position: absolute; left: -19px; top: 12px; width: 12px; height: 12px; border-radius: 50%; background: #1a1a1d; border: 2px solid #1fd67a; transition: box-shadow 0.3s; }
  .scan-station.origin::before { background: #1fd67a; }
  .scan-station.destination::before { background: #1fd67a; }
  .scan-station.has-issue::before { border-color: #ffb344; }
  .scan-station.all-cancelled::before { border-color: #ff4d4d; background: rgba(255,77,77,0.2); }
  .scan-station.first-working::before { background: #1fd67a; border-color: #1fd67a; box-shadow: 0 0 0 4px rgba(31,214,122,0.25); }
  .scan-station-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px; }
  .scan-station-name { font-size: 15px; font-weight: 600; }
  .scan-station-name .flag-mini { font-size: 10px; color: #666; margin-left: 6px; font-weight: 400; }
  .scan-station-tag { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .scan-station.first-working .scan-station-tag { background: #1fd67a; color: #0a0a0b; padding: 3px 8px; border-radius: 4px; font-weight: 700; letter-spacing: 0.5px; }
  .scan-trains { display: flex; flex-direction: column; gap: 6px; }
  .scan-train { background: #1a1a1d; border: 0.5px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .scan-train.cancelled { border-color: rgba(255,77,77,0.4); background: rgba(255,77,77,0.06); }
  .scan-train.delayed { border-color: rgba(255,179,68,0.3); }
  .train-info { min-width: 0; flex: 1; }
  .train-line { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .train-cat { display: inline-block; font-size: 9px; padding: 2px 6px; border-radius: 3px; font-weight: 700; letter-spacing: 0.4px; }
  .train-cat.pagatag { background: #b14eff; color: white; }
  .train-cat.oresundstog { background: #00a99d; color: white; }
  .train-cat.sj { background: #1e3a8a; color: white; }
  .train-cat.snall { background: #16a34a; color: white; }
  .train-cat.ic { background: #c2410c; color: white; }
  .train-cat.kros { background: #d97706; color: white; }
  .train-cat.dsb { background: #dc2626; color: white; }
  .train-cat.default { background: #555; color: white; }
  .train-direction { font-size: 11px; color: #888; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .train-status { font-size: 10px; margin-top: 4px; display: flex; align-items: center; gap: 4px; font-weight: 500; }
  .train-status .sdot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .train-status.on-time { color: #1fd67a; }
  .train-status.delayed { color: #ffb344; }
  .train-status.cancelled { color: #ff4d4d; }
  .train-right { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; min-width: 84px; }
  .train-time { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }
  .train-time.delayed { color: #ffb344; }
  .train-time.cancelled { color: #ff4d4d; text-decoration: line-through; }
  .train-time .orig { display: block; font-size: 10px; color: #666; text-decoration: line-through; font-weight: 400; }
  .train-arrival { font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1; color: #1fd67a; font-weight: 600; display: flex; align-items: center; gap: 3px; }
  .train-arrival .arrow { color: #1fd67a; font-size: 9px; }
  .train-arrival.estimate { color: #ffb344; }
  .train-arrival.estimate .arrow { color: #ffb344; }
  .train-arr-station { font-size: 10px; color: #1fd67a; font-weight: 500; line-height: 1.1; }
  .train-arr-station.estimate { color: #ffb344; }
  .train-track { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; padding: 1px 6px; border: 0.5px solid rgba(255,255,255,0.15); border-radius: 4px; }
  .scan-empty { font-size: 12px; color: #666; padding: 8px 12px; font-style: italic; }
  .scan-destination { color: #1fd67a; font-size: 13px; padding: 4px 0; }
  .bus-section { background: #1a1a1d; border-radius: 12px; padding: 12px 14px; border: 0.5px solid rgba(255,179,68,0.25); margin-bottom: 10px; }
  .bus-section-head { font-size: 12px; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; color: #ffb344; }
  .bus-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 0.5px solid rgba(255,255,255,0.05); gap: 10px; }
  .bus-row:first-of-type { border-top: none; padding-top: 4px; }
  .bus-info { min-width: 0; flex: 1; }
  .bus-line { font-size: 13px; font-weight: 600; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .bus-tag { font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 700; letter-spacing: 0.3px; }
  .bus-tag.replacement { background: #ffb344; color: #1a1a1d; }
  .bus-tag.toward { background: rgba(31,214,122,0.15); color: #1fd67a; border: 0.5px solid rgba(31,214,122,0.3); }
  .bus-route-line { font-size: 11px; color: #aaa; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bus-from { color: #ffb344; font-weight: 500; }
  .bus-right { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; min-width: 84px; }
  .bus-time { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }
  .bus-time.cancelled { color: #ff4d4d; text-decoration: line-through; }
  .bus-arrival { font-size: 11px; font-variant-numeric: tabular-nums; color: #1fd67a; font-weight: 600; line-height: 1; display: flex; align-items: center; gap: 3px; }
  .bus-arrival .arrow { color: #1fd67a; font-size: 9px; }
  .bus-arr-station { font-size: 10px; color: #1fd67a; font-weight: 500; line-height: 1.1; }
  .bus-track { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; padding: 1px 6px; border: 0.5px solid rgba(255,255,255,0.15); border-radius: 4px; }
  .empty, .loading { padding: 28px 16px; text-align: center; color: #666; font-size: 13px; }
  .err-box { background: rgba(255,77,77,0.08); border: 0.5px solid rgba(255,77,77,0.3); border-radius: 12px; padding: 16px; color: #ff8080; font-size: 13px; line-height: 1.5; }
  .refresh { width: 100%; background: #1a1a1d; color: #f0f0f0; border: 0.5px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; margin-top: 14px; cursor: pointer; font-size: 13px; font-weight: 500; }
  .refresh:hover { background: #2a2a2d; }
  .footer { text-align: center; color: #444; font-size: 10px; margin-top: 18px; letter-spacing: 0.3px; }
  .estimate-legend { text-align: center; color: #888; font-size: 10px; margin-top: 14px; padding: 8px 12px; background: rgba(255,179,68,0.04); border: 0.5px solid rgba(255,179,68,0.15); border-radius: 8px; }
  .estimate-legend strong { color: #ffb344; }
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

  <div id="banner-area"></div>

  <div class="section-label">
    <span>Trains along your route</span>
    <span class="badge badge-trafiklab">TRAFIKLAB</span>
  </div>

  <div id="scan-container">
    <div class="loading">Scanning the line…</div>
  </div>

  <div id="bus-section-label" style="display:none" class="section-label">
    <span>Replacement buses &amp; alternatives</span>
    <span class="badge badge-bus">BUSES</span>
  </div>

  <div id="bus-container"></div>

  <div id="estimate-legend" class="estimate-legend" style="display:none">
    <strong>~estimated</strong> arrivals are computed from typical corridor times when Trafiklab's data is incomplete (e.g. cross-border trains). Live Danish data arrives once the Rejseplanen API is connected.
  </div>

  <button class="refresh" onclick="loadEverything()">Refresh</button>

  <div class="footer" id="footer">BroAlert ` + VERSION + `</div>

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
  var MAX_JOURNEY_MIN = 120;
  var MAX_DELAY_VS_SCHEDULED = 60;

  try {
    var saved = localStorage.getItem('broalert-route');
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed.from && parsed.to) state = parsed;
    }
  } catch (e) {}

  function saveRoute() { try { localStorage.setItem('broalert-route', JSON.stringify(state)); } catch (e) {} }

  function renderRoute() {
    document.getElementById('from-name').textContent = state.from.name;
    document.getElementById('to-name').textContent = state.to.name;
    document.getElementById('from-flag').textContent = state.from.country;
    document.getElementById('to-flag').textContent = state.to.country;
  }

  async function loadStations() {
    try { var res = await fetch('/api/stations'); STATIONS = await res.json(); } catch (e) {}
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
    saveRoute(); renderRoute(); closePicker(); loadEverything();
  }

  function swapStations() {
    var tmp = state.from; state.from = state.to; state.to = tmp;
    saveRoute(); renderRoute(); loadEverything();
  }

  function fmtTime(t) { return t ? t.substring(0, 5) : '--:--'; }
  function parseToMin(t) { if (!t) return 0; var p = t.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function diffMin(from, to) {
    var d = parseToMin(to) - parseToMin(from);
    if (d < -720) d += 24 * 60;
    if (d > 720) d -= 24 * 60;
    return d;
  }
  function delayMin(s, a) { var d = parseToMin(a) - parseToMin(s); if (d < -720) d += 24 * 60; return d; }

  function setStatus(level, text) {
    var pill = document.getElementById('status-pill');
    pill.className = 'status-pill ' + level;
    document.getElementById('status-text').textContent = text;
  }

  function renderBanner(level, text) {
    var area = document.getElementById('banner-area');
    if (!text) { area.innerHTML = ''; return; }
    var icon = level === 'escape' ? '→' : (level === 'err' ? '!' : '⚠');
    area.innerHTML = '<div class="notice-banner ' + level + '"><span class="notice-icon">' + icon + '</span><div>' + escapeHtml(text) + '</div></div>';
  }

  function trackBadge(track) {
    if (!track) return '';
    return '<div class="train-track">Spår ' + escapeHtml(track) + '</div>';
  }

  function chooseTrustedArrTime(arrTime, rtArrTime) {
    if (!arrTime && !rtArrTime) return null;
    if (!arrTime) return rtArrTime;
    if (!rtArrTime) return arrTime;
    var d = Math.abs(diffMin(fmtTime(arrTime), fmtTime(rtArrTime)));
    if (d > MAX_DELAY_VS_SCHEDULED) return arrTime;
    return rtArrTime;
  }

  // Tracks whether any estimate appeared in the rendered set (used to show legend)
  var sawAnyEstimate = false;

  function destArrivalBlock(arrTime, rtArrTime, cancelled, depTime, arrAt, isEstimate) {
    if (cancelled || !arrAt) return '';
    var chosen = isEstimate ? arrTime : chooseTrustedArrTime(arrTime, rtArrTime);
    if (!chosen || !depTime) return '';
    var journey = diffMin(fmtTime(depTime), fmtTime(chosen));
    if (journey <= 0 || journey > MAX_JOURNEY_MIN) return '';
    var arr = fmtTime(chosen);
    var cls = isEstimate ? ' estimate' : '';
    var prefix = isEstimate ? '~' : '';
    if (isEstimate) sawAnyEstimate = true;
    return '<div class="train-arrival' + cls + '"><span class="arrow">→</span>' + prefix + arr + '</div>' +
           '<div class="train-arr-station' + cls + '">' + escapeHtml(arrAt) + (isEstimate ? ' (est)' : '') + '</div>';
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
    var catClass = train.categoryClass || 'default';
    var catName = train.category || 'Tåg';

    return '<div class="scan-train' + cardClass + '">' +
             '<div class="train-info">' +
               '<div class="train-line"><span class="train-cat ' + catClass + '">' + catName.toUpperCase() + '</span><span>' + escapeHtml(train.line || '') + '</span></div>' +
               '<div class="train-direction">→ ' + escapeHtml(train.direction || '') + '</div>' +
               '<div class="train-status ' + statusClass + '"><span class="sdot"></span>' + statusText + '</div>' +
             '</div>' +
             '<div class="train-right">' +
               '<div class="train-time ' + timeClass + '">' + timeHtml + '</div>' +
               destArrivalBlock(train.arrTime, train.rtArrTime, cancelled, train.time, train.arrAt, train.arrIsEstimate) +
               trackBadge(train.track) +
             '</div>' +
           '</div>';
  }

  function renderLineScan(data) {
    sawAnyEstimate = false;
    var container = document.getElementById('scan-container');
    if (!data.supported) {
      container.innerHTML = '<div class="err-box">Route between these stations is outside the supported Øresund corridor for now.</div>';
      return { totalStop: false, anyIssue: false, totalTrains: 0, firstWorkingIdx: -1, originOK: false, replacements: [] };
    }
    var foot = document.getElementById('footer');
    if (foot && data.version) foot.textContent = 'BroAlert ' + data.version;

    var stations = data.stations || [];
    if (stations.length === 0) {
      container.innerHTML = '<div class="empty">No stations to scan.</div>';
      return { totalStop: false, anyIssue: false, totalTrains: 0, firstWorkingIdx: -1, originOK: false, replacements: [] };
    }
    var originIdx = -1;
    for (var oi = 0; oi < stations.length; oi++) if (stations[oi].isOrigin) { originIdx = oi; break; }
    var originOK = originIdx >= 0 && stations[originIdx].trains.length > 0 && stations[originIdx].trains.some(function(t) { return !t.cancelled; });
    var firstWorkingIdx = -1;
    if (!originOK && originIdx >= 0) {
      for (var fi = originIdx + 1; fi < stations.length; fi++) {
        if (stations[fi].isDestination) continue;
        if (stations[fi].trains.length > 0 && stations[fi].trains.some(function(t) { return !t.cancelled; })) {
          firstWorkingIdx = fi; break;
        }
      }
    }
    var html = '<div class="line-scan">';
    var anyIssue = false, totalTrains = 0, totalStop = true;
    var replacements = [];

    for (var i = 0; i < stations.length; i++) {
      var st = stations[i];
      var trains = st.trains || [];
      if (st.replacementBuses && st.replacementBuses.length > 0) {
        for (var ri = 0; ri < st.replacementBuses.length; ri++) {
          replacements.push(Object.assign({}, st.replacementBuses[ri], { fromStation: st.name, fromCountry: st.country }));
        }
      }
      if (st.isDestination) {
        html += '<div class="scan-station destination">' +
                  '<div class="scan-station-head">' +
                    '<div class="scan-station-name">' + escapeHtml(st.name) + ' <span class="flag-mini">' + st.country + '</span></div>' +
                    '<div class="scan-station-tag">Destination</div>' +
                  '</div>' +
                  '<div class="scan-destination">Arrival station</div>' +
                '</div>';
        continue;
      }
      var cancelledHere = trains.filter(function(t) { return t.cancelled; }).length;
      var delayedHere = trains.filter(function(t) { return !t.cancelled && t.rtTime && t.rtTime !== t.time; }).length;
      var workingHere = trains.filter(function(t) { return !t.cancelled; }).length;
      var stationClass = '';
      if (trains.length > 0 && cancelledHere === trains.length) { stationClass = ' all-cancelled'; anyIssue = true; }
      else if (cancelledHere > 0 || delayedHere > 0) { stationClass = ' has-issue'; anyIssue = true; }
      if (workingHere > 0) totalStop = false;
      if (st.isOrigin) stationClass += ' origin';
      if (i === firstWorkingIdx) stationClass += ' first-working';
      totalTrains += trains.length;
      var trainsHtml = '';
      if (trains.length === 0) trainsHtml = '<div class="scan-empty">No trains advancing toward ' + escapeHtml(state.to.name) + ' in the next window.</div>';
      else for (var j = 0; j < trains.length; j++) trainsHtml += renderTrainRow(trains[j]);
      var tag = st.isOrigin ? 'Origin' : 'Stop';
      if (i === firstWorkingIdx) tag = '→ Escape here';
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
    // Show estimate legend only if any estimate appeared
    var legend = document.getElementById('estimate-legend');
    legend.style.display = sawAnyEstimate ? 'block' : 'none';
    return {
      totalStop: totalStop, anyIssue: anyIssue, totalTrains: totalTrains,
      firstWorkingIdx: firstWorkingIdx, originOK: originOK, stations: stations,
      replacements: replacements
    };
  }

  function busArrivalBlock(b) {
    if (b.cancelled || !b.arrAt) return '';
    var chosen = chooseTrustedArrTime(b.arrTime, b.rtArrTime);
    if (!chosen || !b.time) return '';
    var journey = diffMin(fmtTime(b.time), fmtTime(chosen));
    if (journey <= 0 || journey > MAX_JOURNEY_MIN) return '';
    var arrT = fmtTime(chosen);
    return '<div class="bus-arrival"><span class="arrow">→</span>' + arrT + '</div>' +
           '<div class="bus-arr-station">' + escapeHtml(b.arrAt) + '</div>';
  }

  function renderBusSection(replacements, directToDest) {
    var container = document.getElementById('bus-container');
    var label = document.getElementById('bus-section-label');
    if (replacements.length === 0 && directToDest.length === 0) {
      container.innerHTML = ''; label.style.display = 'none'; return;
    }
    label.style.display = 'flex';
    var html = '';
    if (replacements.length > 0) {
      html += '<div class="bus-section"><div class="bus-section-head">Replacement buses (Tåg-bussar)</div>';
      replacements.sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });
      for (var i = 0; i < replacements.length; i++) {
        var b = replacements[i];
        var time = fmtTime(b.time);
        var rt = b.rtTime ? fmtTime(b.rtTime) : null;
        var timeDisplay = b.cancelled ? time : (rt || time);
        var timeClass = b.cancelled ? 'cancelled' : '';
        var trackHtml = b.track ? '<div class="bus-track">Spår ' + escapeHtml(b.track) + '</div>' : '';
        html += '<div class="bus-row">' +
                  '<div class="bus-info">' +
                    '<div class="bus-line"><span class="bus-tag replacement">REPLACEMENT</span><span>' + escapeHtml(b.line || 'Bus') + '</span></div>' +
                    '<div class="bus-route-line"><span class="bus-from">from ' + escapeHtml(b.fromStation) + '</span> → ' + escapeHtml(b.direction || 'unknown') + '</div>' +
                  '</div>' +
                  '<div class="bus-right">' +
                    '<div class="bus-time ' + timeClass + '">' + timeDisplay + '</div>' +
                    busArrivalBlock(b) +
                    trackHtml +
                  '</div>' +
                '</div>';
      }
      html += '</div>';
    }
    if (directToDest.length > 0) {
      html += '<div class="bus-section"><div class="bus-section-head">Direct buses to ' + escapeHtml(state.to.name) + '</div>';
      directToDest.sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });
      for (var k = 0; k < directToDest.length; k++) {
        var d = directToDest[k];
        var dtime = fmtTime(d.time);
        var drt = d.rtTime ? fmtTime(d.rtTime) : null;
        var dtimeDisplay = d.cancelled ? dtime : (drt || dtime);
        var dtimeClass = d.cancelled ? 'cancelled' : '';
        var dtrackHtml = d.track ? '<div class="bus-track">Spår ' + escapeHtml(d.track) + '</div>' : '';
        html += '<div class="bus-row">' +
                  '<div class="bus-info">' +
                    '<div class="bus-line"><span class="bus-tag toward">TO ' + escapeHtml(state.to.name.toUpperCase()) + '</span><span>' + escapeHtml(d.line || 'Bus') + '</span></div>' +
                    '<div class="bus-route-line"><span class="bus-from">from ' + escapeHtml(d.fromStation) + '</span> → ' + escapeHtml(d.direction || '') + '</div>' +
                  '</div>' +
                  '<div class="bus-right">' +
                    '<div class="bus-time ' + dtimeClass + '">' + dtimeDisplay + '</div>' +
                    busArrivalBlock(d) +
                    dtrackHtml +
                  '</div>' +
                '</div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  }

  async function loadEverything() {
    var scanContainer = document.getElementById('scan-container');
    var busContainer = document.getElementById('bus-container');
    var busLabel = document.getElementById('bus-section-label');
    scanContainer.innerHTML = '<div class="loading">Scanning the line…</div>';
    busContainer.innerHTML = '';
    busLabel.style.display = 'none';
    renderBanner(null, null);
    try {
      var scanRes = await fetch('/api/line-scan?from=' + state.from.id + '&to=' + state.to.id);
      var scanData = await scanRes.json();
      if (scanData.error) throw new Error(scanData.error);
      var summary = renderLineScan(scanData);
      if (!summary.originOK && summary.firstWorkingIdx > 0 && summary.stations) {
        var broken = [];
        for (var bi = 0; bi < summary.firstWorkingIdx; bi++) if (!summary.stations[bi].isDestination) broken.push(summary.stations[bi].name);
        var escapeStation = summary.stations[summary.firstWorkingIdx].name;
        renderBanner('escape', 'Trains cancelled at ' + broken.join(' & ') + '. First working option: ' + escapeStation + '.');
      } else if (summary.totalStop && summary.totalTrains > 0) {
        renderBanner('err', 'All trains on this route are currently cancelled. Check replacement buses below if available.');
      } else if (state.from.country === 'DK' || state.to.country === 'DK') {
        renderBanner('warn', 'Danish-side coverage is limited until the Rejseplanen API is connected.');
      }
      var directToDest = [];
      if (summary.totalStop) {
        try {
          var fromBusReq = await fetch('/api/buses?id=' + state.from.id + '&destId=' + state.to.id + '&dest=' + encodeURIComponent(state.to.name));
          var toBusReq = await fetch('/api/buses?id=' + state.to.id + '&destId=' + state.from.id + '&dest=' + encodeURIComponent(state.from.name));
          var fromBusData = await fromBusReq.json();
          var toBusData = await toBusReq.json();
          (fromBusData.buses || []).forEach(function(b) { directToDest.push(Object.assign({}, b, { fromStation: state.from.name })); });
          (toBusData.buses || []).forEach(function(b) { directToDest.push(Object.assign({}, b, { fromStation: state.to.name })); });
        } catch (e) {}
      }
      renderBusSection(summary.replacements, directToDest);
      if (summary.totalStop && summary.totalTrains > 0) setStatus('err', 'All cancelled');
      else if (!summary.originOK && summary.firstWorkingIdx > 0) setStatus('warn', 'Escape needed');
      else if (summary.anyIssue) setStatus('warn', 'Disruptions');
      else if (summary.totalTrains > 0) setStatus('ok', 'Live');
      else setStatus('warn', 'No trains found');
    } catch (err) {
      scanContainer.innerHTML = '<div class="err-box">Could not load line scan.<br>' + escapeHtml(err.message) + '</div>';
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
  setInterval(loadEverything, 180000);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('BroAlert ' + VERSION + ' running on port ' + PORT));
