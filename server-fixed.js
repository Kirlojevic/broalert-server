const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const RESROBOT = '6c964869-c6ab-4d2c-863e-5f9a8463cde0';
const STOPS = { hyllie:'740001586', triangeln:'740001587', malmoC:'740000003', lund:'740000120', kastrup:'740000670' };

app.get('/api/hyllie', async (req, res) => {
  try {
    const r = await fetch('https://api.resrobot.se/v2.1/departureBoard?id=' + STOPS.hyllie + '&maxJourneys=12&format=json&accessId=' + RESROBOT);
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/route-status', async (req, res) => {
  let hasDisruption = false, disruptions = [], results = {};
  for (const [name, id] of [['hyllie',STOPS.hyllie],['triangeln',STOPS.triangeln],['malmoC',STOPS.malmoC]]) {
    try {
      const r = await fetch('https://api.resrobot.se/v2.1/departureBoard?id=' + id + '&maxJourneys=8&format=json&accessId=' + RESROBOT);
      const data = await r.json();
      const deps = data.Departure || [];
      const cancelled = deps.filter(d => d.cancelled === true || d.Cancelled === 'true');
      results[name] = { departures: deps.length, cancelled: cancelled.length };
      if (cancelled.length > 0) {
        hasDisruption = true;
        cancelled.forEach(d => disruptions.push({ type: 'cancelled', stop: name, train: d.name || 'Train', direction: d.direction || '', scheduledTime: d.time }));
      }
    } catch(e) { results[name] = { error: e.message }; }
  }
  res.json({ hasDisruption, disruptions, stops: results, timestamp: new Date().toISOString() });
});

app.get('/api/stops', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'query required' });
  try {
    const r = await fetch('https://api.resrobot.se/v2.1/location.name?input=' + encodeURIComponent(q) + '&maxNo=10&format=json&accessId=' + RESROBOT);
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('BroAlert running on port ' + PORT));
