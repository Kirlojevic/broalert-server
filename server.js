const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const KEYS = {
  resrobot: process.env.RESROBOT_KEY || '6c964869-c6ab-4d2c-863e-5f9a8463cde0',
  gtfsRealtime: process.env.GTFS_REALTIME_KEY || '75eeea5af8334672af99636034ae1df5',
  gtfsSweden3: process.env.GTFS_SWEDEN3_KEY || '7f87684a9a0f4bdab75f66a22d28a032',
  stopsData: process.env.STOPS_DATA_KEY || 'ac125d6fd6ac4dc5be418217e20fa99f'
};

const STOPS = {
  hyllie:    '740001586',
  triangeln: '740001587',
  malmoC:    '740000003',
  lund:      '740000120',
  kastrup:   '740000670'
};

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'BroAlert API running', version: '1.0' });
});

// Get departures from a stop
app.get('/api/departures/:stopId', async (req, res) => {
  const { stopId } = req.params;
  const max = req.query.max || 12;
  const url = `https://api.resrobot.se/v2.1/departureBoard?id=${stopId}&maxJourneys=${max}&format=json&accessId=${KEYS.resrobot}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get departures from Hyllie (shortcut)
app.get('/api/hyllie', async (req, res) => {
  const url = `https://api.resrobot.se/v2.1/departureBoard?id=${STOPS.hyllie}&maxJourneys=12&format=json&accessId=${KEYS.resrobot}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Route status — checks all key Swedish Øresund stops for cancellations
app.get('/api/route-status', async (req, res) => {
  const stopIds = [STOPS.hyllie, STOPS.triangeln, STOPS.malmoC];
  const results = {};
  let hasDisruption = false;
  let disruptions = [];

  for (const [name, id] of Object.entries({ hyllie: STOPS.hyllie, triangeln: STOPS.triangeln, malmoC: STOPS.malmoC })) {
    try {
      const url = `https://api.resrobot.se/v2.1/departureBoard?id=${id}&maxJourneys=8&format=json&accessId=${KEYS.resrobot}`;
      const r = await fetch(url);
      const data = await r.json();
      const deps = data.Departure || data.departure || [];

      const cancelled = deps.filter(d => d.cancelled === true || d.Cancelled === 'true');
      const delayed = deps.filter(d => {
        if (d.cancelled) return false;
        if (!d.rtTime || d.rtTime === d.time) return false;
        const delay = calcDelay(d.time, d.rtTime);
        return delay >= 20;
      });

      results[name] = {
        stopId: id,
        departures: deps.length,
        cancelled: cancelled.length,
        majorDelays: delayed.length,
        nextDep: deps[0] || null
      };

      if (cancelled.length > 0 || delayed.length > 0) {
        hasDisruption = true;
        cancelled.forEach(d => {
          disruptions.push({
            type: 'cancelled',
            stop: name,
            train: d.name || 'Train',
            direction: d.direction || '',
            scheduledTime: d.time
          });
        });
        delayed.forEach(d => {
          disruptions.push({
            type: 'delayed',
            stop: name,
            train: d.name || 'Train',
            direction: d.direction || '',
            scheduledTime: d.time,
            realtimeTime: d.rtTime,
            delayMin: calcDelay(d.time, d.rtTime)
          });
        });
      }
    } catch (e) {
      results[name] = { error: e.message };
    }
  }

  res.json({
    hasDisruption,
    disruptions,
    stops: results,
    timestamp: new Date().toISOString()
  });
});

// Trip planner — find alternatives
app.get('/api/trip', async (req, res) => {
  const { fromId, toId } = req.query;
  if (!fromId || !toId) return res.status(400).json({ error: 'fromId and toId required' });

  const now = new Date();
  const date = now.toISOString().slice(0,10).replace(/-/g,'');
  const time = now.toTimeString().slice(0,5).replace(':','');

  const url = `https://api.resrobot.se/v2.1/trip?originId=${fromId}&destId=${toId}&date=${date}&time=${time}&maxJourneys=3&format=json&accessId=${KEYS.resrobot}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stop lookup — find stop IDs (used to confirm Kastrup track 11/12)
app.get('/api/stops', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'query required' });
  const url = `https://api.resrobot.se/v2.1/location.name?input=${encodeURIComponent(q)}&maxNo=10&format=json&accessId=${KEYS.resrobot}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function calcDelay(scheduled, realtime) {
  try {
    const sh = parseInt(scheduled.slice(0,2)), sm = parseInt(scheduled.slice(3,5));
    const rh = parseInt(realtime.slice(0,2)), rm = parseInt(realtime.slice(3,5));
    return (rh * 60 + rm) - (sh * 60 + sm);
  } catch(e) { return 0; }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BroAlert server running on port ${PORT}`));
