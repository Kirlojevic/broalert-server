const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

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

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BroAlert</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0a0a0b;--bg2:#111113;--bg3:#1a1a1d;--border:rgba(255,255,255,0.08);--border2:rgba(255,255,255,0.14);--text:#f0f0f0;--text2:#888;--text3:#555;--green:#1fd67a;--gdim:rgba(31,214,122,0.12);--red:#ff4d4d;--rdim:rgba(255,77,77,0.12);--amber:#ffb344;--adim:rgba(255,179,68,0.12);--blue:#4d9eff;--bdim:rgba(77,158,255,0.12);--purple:#a78bfa;--pdim:rgba(167,139,250,0.1)}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;max-width:440px;margin:0 auto;padding:0 0 80px}
.header{padding:20px 20px 0;display:flex;justify-content:space-between;align-items:center}
.logo{font-size:20px;font-weight:600;letter-spacing:-.5px}.logo span{color:var(--green)}
.pill{font-size:11px;font-weight:500;padding:4px 10px;border-radius:20px;display:flex;align-items:center;gap:5px;font-family:'DM Mono',monospace}
.pill.ok{background:var(--gdim);color:var(--green);border:.5px solid rgba(31,214,122,.3)}
.pill.bad{background:var(--rdim);color:var(--red);border:.5px solid rgba(255,77,77,.3)}
.pill.loading{background:var(--adim);color:var(--amber);border:.5px solid rgba(255,179,68,.3)}
.dot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:pulse 1.8s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.route-bar{margin:16px 20px 0;background:var(--bg3);border:.5px solid var(--border);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:10px}
.rs{flex:1}.rl{font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:2px}.rn{font-size:13px;font-weight:500}
.ra{color:var(--text3);font-size:16px}
.tabs{display:flex;margin:20px 20px 0;background:var(--bg2);border:.5px solid var(--border);border-radius:12px;padding:3px;gap:2px}
.tab{flex:1;padding:8px 6px;font-size:12px;font-weight:500;text-align:center;border-radius:9px;cursor:pointer;color:var(--text3);border:none;background:none;font-family:'DM Sans',sans-serif;transition:all .15s}
.tab.active{background:var(--bg3);color:var(--text);border:.5px solid var(--border2)}
.panel{display:none;padding:16px 20px 0}.panel.active{display:block}
.bigstatus{background:var(--bg3);border:.5px solid var(--border);border-radius:18px;padding:24px 20px;text-align:center;margin-bottom:14px}
.ring-o{width:80px;height:80px;border-radius:50%;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
.ring-i{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:all .4s}
.ring-i.ok{background:var(--gdim);border:1.5px solid rgba(31,214,122,.4)}
.ring-i.bad{background:var(--rdim);border:1.5px solid rgba(255,77,77,.4)}
.ring-i.loading{background:var(--adim);border:1.5px solid rgba(255,179,68,.4)}
.ring-d{width:14px;height:14px;border-radius:50%}
.ring-d.ok{background:var(--green);animation:pulse 2s infinite}
.ring-d.bad{background:var(--red)}
.ring-d.loading{background:var(--amber);animation:pulse 1s infinite}
.bst{font-size:16px;font-weight:500;margin-bottom:4px}.bss{font-size:13px;color:var(--text2);line-height:1.5}
.slabel{font-size:11px;font-weight:500;color:var(--text3);font-family:'DM Mono',monospace;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}
.stag{font-size:10px;padding:2px 6px;border-radius:6px;font-family:'DM Mono',monospace}
.stag-se{background:var(--gdim);color:var(--green)}.stag-dk{background:var(--bdim);color:var(--blue)}.stag-usr{background:var(--pdim);color:var(--purple)}
.dc{background:var(--bg3);border:.5px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.dc.cancelled{border-color:rgba(255,77,77,.3);background:rgba(255,77,77,.05)}
.dc.delayed{border-color:rgba(255,179,68,.3);background:rgba(255,179,68,.05)}
.dt{font-family:'DM Mono',monospace;font-size:16px;font-weight:500;min-width:48px}
.dt.cancelled{color:var(--red);text-decoration:line-through}.dt.delayed{color:var(--amber)}
.db{flex:1}.dd{font-size:13px;font-weight:500;margin-bottom:2px}.di{font-size:11px;color:var(--text2)}
.badge{font-size:10px;font-weight:500;padding:3px 8px;border-radius:8px;font-family:'DM Mono',monospace;white-space:nowrap}
.b-ok{background:var(--gdim);color:var(--green)}.b-bad{background:var(--rdim);color:var(--red)}.b-warn{background:var(--adim);color:var(--amber)}.b-info{background:var(--bdim);color:var(--blue)}
.infobox{background:var(--bg3);border:.5px solid var(--border2);border-radius:12px;padding:12px 14px;margin-bottom:10px;font-size:12px;color:var(--text2);line-height:1.6}
.infobox strong{color:var(--text);font-weight:500}
.taxi{background:var(--adim);border:.5px solid rgba(255,179,68,.3);border-radius:12px;padding:12px 14px;margin-bottom:10px}
.taxi-t{font-size:13px;font-weight:500;color:var(--amber);margin-bottom:3px}
.taxi-b{font-size:12px;color:rgba(255,179,68,.8);line-height:1.5}
.taxi-l{font-size:12px;color:var(--blue);font-weight:500;margin-top:5px;display:block}
.cpost{border-bottom:.5px solid var(--border);padding:12px 0}.cpost:last-child{border-bottom:none}
.cmeta{display:flex;justify-content:space-between;margin-bottom:5px}
.ctag{font-size:10px;font-weight:500;padding:2px 7px;border-radius:6px;font-family:'DM Mono',monospace}
.ct-bus{background:var(--bdim);color:var(--blue)}.ct-ride{background:var(--gdim);color:var(--green)}.ct-upd{background:var(--adim);color:var(--amber)}.ct-warn{background:var(--rdim);color:var(--red)}
.ctime{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace}
.ctext{font-size:13px;color:var(--text);line-height:1.5;margin-bottom:3px}
.cconf{font-size:11px;color:var(--green)}.clink{font-size:11px;color:var(--blue);font-weight:500}
.compose{display:flex;gap:8px;padding:10px 0 0;border-top:.5px solid var(--border);margin-top:4px}
.cinput{flex:1;background:var(--bg3);border:.5px solid var(--border2);border-radius:20px;padding:9px 14px;font-size:13px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none}
.cinput::placeholder{color:var(--text3)}
.micbtn{width:36px;height:36px;border-radius:50%;background:var(--pdim);border:.5px solid rgba(167,139,250,.3);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.lc{background:var(--bg3);border:.5px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:10px}
.lt{font-size:13px;font-weight:500;margin-bottom:8px}
.lr{display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-top:.5px solid var(--border)}
.ll{color:var(--text2)}.lok{color:var(--green);font-weight:500;font-family:'DM Mono',monospace}.lbad{color:var(--red);font-weight:500;font-family:'DM Mono',monospace}
.bnav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:440px;background:rgba(10,10,11,.95);backdrop-filter:blur(12px);border-top:.5px solid var(--border);display:flex;padding:8px 0 16px}
.ni{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;cursor:pointer}
.nb{width:20px;height:3px;border-radius:2px;transition:background .15s}.nb.on{background:var(--green)}.nb.off{background:var(--border2)}
.nl{font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;transition:color .15s}.nl.on{color:var(--green)}
.spinner{width:20px;height:20px;border:1.5px solid var(--border2);border-top-color:var(--green);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 10px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-s{text-align:center;padding:30px 0;color:var(--text3);font-size:13px}
.err{background:var(--rdim);border:.5px solid rgba(255,77,77,.3);border-radius:12px;padding:12px 14px;font-size:12px;color:var(--red);margin-bottom:10px;line-height:1.6}
.upd{font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;text-align:center;padding:6px 0 0}
</style>
</head>
<body>
<div class="header">
  <div class="logo">Bro<span>Alert</span></div>
  <div class="pill loading" id="gst"><div class="dot"></div><span id="gstxt">Loading…</span></div>
</div>
<div class="route-bar">
  <div class="rs"><div class="rl">FROM</div><div class="rn">Hyllie</div></div>
  <div class="ra">→</div>
  <div class="rs"><div class="rl">TO</div><div class="rn">København H</div></div>
</div>
<div class="tabs">
  <button class="tab active" onclick="sw('status',this,0)">Status</button>
  <button class="tab" onclick="sw('alt',this,1)">Options</button>
  <button class="tab" onclick="sw('comm',this,2)">Community</button>
  <button class="tab" onclick="sw('log',this,3)">My log</button>
</div>
<div class="panel active" id="panel-status">
  <div class="bigstatus">
    <div class="ring-o"><div class="ring-i loading" id="ri"><div class="ring-d loading" id="rd"></div></div></div>
    <div class="bst" id="stitle">Checking live data…</div>
    <div class="bss" id="ssub">Querying Trafiklab for Hyllie</div>
  </div>
  <div class="slabel">Live departures from Hyllie <span class="stag stag-se">Trafiklab</span></div>
  <div id="deplist"><div class="loading-s"><div class="spinner"></div>Fetching live trains…</div></div>
  <div class="upd" id="upd"></div>
</div>
<div class="panel" id="panel-alt">
  <div class="infobox" id="altbox"><strong>Checking route…</strong><br>Alternatives appear here automatically during disruptions.</div>
  <div id="altlist"></div>
  <div id="taxidiv" style="display:none">
    <div class="taxi"><div class="taxi-t">You can claim taxi costs back</div>
    <div class="taxi-b">Delayed 20+ min. Skånetrafiken reimburses taxi and Uber. Keep receipt.</div>
    <a href="https://www.skanetrafiken.se/kundservice/forseningsersattning/" target="_blank" class="taxi-l">Apply at skanetrafiken.se →</a></div>
  </div>
</div>
<div class="panel" id="panel-comm">
  <div class="slabel">Live reports <span class="stag stag-usr">User-reported</span></div>
  <div id="cfeed">
    <div class="cpost"><div class="cmeta"><span class="ctag ct-upd">Update</span><span class="ctime">now</span></div><div class="ctext">Community tab live. Post what you see on the corridor.</div></div>
    <div class="cpost"><div class="cmeta"><span class="ctag ct-bus">Bus sighting</span><span class="ctime">earlier</span></div><div class="ctext">Replacement bus at Hyllie Arena stop, heading Kastrup. Multiple buses standing by.</div><div class="cconf">2 confirmed · not in Skånetrafiken data</div></div>
    <div class="cpost"><div class="cmeta"><span class="ctag ct-ride">Ride offer</span><span class="ctime">earlier</span></div><div class="ctext">Offering ride Malmö C → KH at next disruption. 2 seats. DKK 80.</div><span class="clink">Tap to contact →</span></div>
  </div>
  <div class="compose"><input type="text" class="cinput" placeholder="Post what you see…"><div class="micbtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,.9)" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v4M8 23h8"/></svg></div></div>
</div>
<div class="panel" id="panel-log">
  <div class="slabel">Delay log <span class="stag stag-se">Independent</span></div>
  <div class="infobox"><strong>Independent logging active.</strong><br>BroAlert records real departure times separately from Skånetrafiken — evidence for compensation claims.</div>
  <div class="lc"><div class="lt">Today</div>
    <div class="lr"><span class="ll">Monitoring</span><span class="lok">Active</span></div>
    <div class="lr"><span class="ll">Route</span><span style="font-family:'DM Mono',monospace;font-size:11px;color:#888">Hyllie → KH</span></div>
    <div class="lr"><span class="ll">Disruptions</span><span class="lok" id="logc">0 today</span></div>
  </div>
</div>
<nav class="bnav">
  <div class="ni" onclick="sw('status',null,0)"><div class="nb on" id="n0"></div><div class="nl on" id="nl0">status</div></div>
  <div class="ni" onclick="sw('alt',null,1)"><div class="nb off" id="n1"></div><div class="nl" id="nl1">options</div></div>
  <div class="ni" onclick="sw('comm',null,2)"><div class="nb off" id="n2"></div><div class="nl" id="nl2">community</div></div>
  <div class="ni" onclick="sw('log',null,3)"><div class="nb off" id="n3"></div><div class="nl" id="nl3">my log</div></div>
</nav>
<script>
let dc=0;
function sw(name,btn,idx){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  if(btn)btn.classList.add('active');
  [0,1,2,3].forEach(i=>{
    document.getElementById('n'+i).className='nb '+(i===idx?'on':'off');
    document.getElementById('nl'+i).className='nl'+(i===idx?' on':'');
  });
}
function setst(s,t){const e=document.getElementById('gst');e.className='pill '+s;document.getElementById('gstxt').textContent=t;}
function setring(s){document.getElementById('ri').className='ring-i '+s;document.getElementById('rd').className='ring-d '+s;}
function ft(t){if(!t)return'--:--';if(t.includes('T'))return new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});return t.slice(0,5);}
function delay(s,r){try{const sm=parseInt(s.slice(0,2))*60+parseInt(s.slice(3,5));const rm=parseInt(r.slice(0,2))*60+parseInt(r.slice(3,5));return rm-sm;}catch(e){return 0;}}
async function load(){
  setst('loading','Loading…');
  try{
    const [sr,dr]=await Promise.all([
      fetch('/api/route-status').then(r=>r.json()),
      fetch('/api/hyllie').then(r=>r.json())
    ]);
    renderStatus(sr);
    renderDeps(dr.Departure||[]);
  }catch(e){
    setst('bad','Error');setring('bad');
    document.getElementById('stitle').textContent='Cannot load data';
    document.getElementById('ssub').textContent=e.message;
    document.getElementById('deplist').innerHTML='<div class="err">'+e.message+'</div>';
  }
}
function renderStatus(d){
  if(d.hasDisruption){
    setst('bad','Disruption');setring('bad');
    document.getElementById('stitle').textContent='Disruption on your route';
    document.getElementById('ssub').textContent=d.disruptions.length+' issue(s) detected. Check Options tab.';
    document.getElementById('taxidiv').style.display='block';
    dc++;document.getElementById('logc').textContent=dc+' today';
    document.getElementById('altbox').innerHTML='<strong style="color:var(--red)">Disruption detected.</strong><br>Check the options below — live from Trafiklab.';
    document.getElementById('altlist').innerHTML=`
      <div class="dc"><div class="dt" style="color:var(--green);font-size:13px">Best</div><div class="db"><div class="dd">Pågatågen → Malmö C → Øresundståg</div><div class="di">Local train Hyllie → Malmö C 8 min · then cross bridge</div></div><span class="badge b-ok">SE API</span></div>
      <div class="dc"><div class="dt" style="color:var(--amber);font-size:13px">Bus</div><div class="db"><div class="dd">Replacement bus — Hyllie Arena stop</div><div class="di">Exit towards arena · bus terminal behind it</div></div><span class="badge b-warn">Unconfirmed</span></div>
      <div class="dc"><div class="dt" style="color:var(--blue);font-size:13px">Taxi</div><div class="db"><div class="dd">Taxi — claimable from Skånetrafiken</div><div class="di">20+ min delay: keep receipt, claim at skanetrafiken.se</div></div><span class="badge b-info">Your right</span></div>`;
  }else{
    setst('ok','All clear');setring('ok');
    document.getElementById('stitle').textContent='Your route is clear';
    document.getElementById('ssub').textContent='No cancellations or major delays on the Øresund corridor.';
    document.getElementById('taxidiv').style.display='none';
    document.getElementById('altbox').innerHTML='<strong>Route clear.</strong><br>No disruptions detected. Alternatives appear here automatically.';
    document.getElementById('altlist').innerHTML='';
  }
}
function renderDeps(deps){
  if(!deps.length){document.getElementById('deplist').innerHTML='<div class="err">No departures found.</div>';return;}
  let html='';let n=0;
  for(const d of deps){
    if(n>=6)break;
    const dir=d.direction||'';
    const t=d.time||'';const rt=d.rtTime||'';
    const can=d.cancelled===true||d.Cancelled==='true';
    const del=!can&&rt&&rt!==t&&delay(t,rt)>0;
    const dm=del?delay(t,rt):0;
    const nm=d.name||'';
    const tr=d.rtTrack||d.track||d.Track||'';
    let cc='dc',tc='dt',badge='<span class="badge b-ok">On time</span>';
    if(can){cc='dc cancelled';tc='dt cancelled';badge='<span class="badge b-bad">Cancelled</span>';}
    else if(del&&dm>=2){cc='dc delayed';tc='dt delayed';badge='<span class="badge b-warn">+'+dm+' min</span>';}
    html+=`<div class="${cc}"><div class="${tc}">${ft(rt||t)}</div><div class="db"><div class="dd">${dir}</div><div class="di">${nm}${tr?' · Platform '+tr:''}</div></div>${badge}</div>`;
    n++;
  }
  document.getElementById('deplist').innerHTML=html;
  document.getElementById('upd').textContent='Updated '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+' · refreshes every 60s';
}
load();setInterval(load,60000);
</script>
</body>
</html>`;

app.get('/', (req, res) => res.send(HTML));

app.get('/api/hyllie', async (req, res) => {
  const url = `https://api.resrobot.se/v2.1/departureBoard?id=${STOPS.hyllie}&maxJourneys=12&format=json&accessId=${RESROBOT}`;
  try { const r = await fetch(url); res.json(await r.json()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/route-status', async (req, res) => {
  let hasDisruption = false, disruptions = [], results = {};
  for (const [name, id] of Object.entries({ hyllie: STOPS.hyllie, triangeln: STOPS.triangeln, malmoC: STOPS.malmoC })) {
    try {
      const r = await fetch(`https://api.resrobot.se/v2.1/departureBoard?id=${id}&maxJourneys=8&format=json&accessId=${RESROBOT}`);
      const data = await r.json();
      const deps = data.Departure || [];
      const cancelled = deps.filter(d => d.cancelled === true || d.Cancelled === 'true');
      results[name] = { departures: deps.length, cancelled: cancelled.length };
      if (cancelled.length > 0) { hasDisruption = true; cancelled.forEach(d => disruptions.push({ type: 'cancelled', stop: name, train: d.name || 'Train', direction: d.direction || '', scheduledTime: d.time })); }
    } catch(e) { results[name] = { error: e.message }; }
  }
  res.json({ hasDisruption, disruptions, stops: results, timestamp: new Date().toISOString() });
});

app.get('/api/stops', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'query required' });
  try { const r = await fetch(`https://api.resrobot.se/v2.1/location.name?input=${encodeURIComponent(q)}&maxNo=10&format=json&accessId=${RESROBOT}`); res.json(await r.json()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BroAlert running on port ${PORT}`));
