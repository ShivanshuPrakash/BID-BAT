'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room, GameError, FRANCHISES } = require('./engine');

const PORT = process.env.PORT || 8000;
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const now = () => Date.now() / 1000;

// build id changes whenever any public file changes; clients that load an old copy reload themselves
const buildId = () => { let m = 0; try { for (const f of fs.readdirSync(PUBLIC)) { const st = fs.statSync(path.join(PUBLIC, f)); if (st.isFile()) m = Math.max(m, st.mtimeMs); } } catch { /* ignore */ } return String(Math.floor(m)); };
let BUILD = buildId();
const rooms = new Map();   // code -> Room
const socks = new Map();   // code -> Map(pid -> ws)

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/api/meta') {
    // team logos: drop public/logos/<CODE>.png (or svg/jpg/webp), e.g. CSK.png; picked up on the next page load
    let files = []; try { files = fs.readdirSync(path.join(PUBLIC, 'logos')); } catch { /* none */ }
    const out = {};
    for (const [k, v] of Object.entries(FRANCHISES)) { const f = files.find((x) => /\.(png|svg|jpe?g|webp)$/i.test(x) && x.replace(/\.[^.]+$/, '').toUpperCase() === k.toUpperCase()); out[k] = { ...v, logo: f ? '/logos/' + f : '' }; }
    res.writeHead(200, { 'Content-Type': MIME['.json'] }); return res.end(JSON.stringify(out));
  }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(PUBLIC, url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    if (file.endsWith('app.js')) buf = Buffer.from(buf.toString('utf8').replace('__BUILD__', BUILD));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': /\.(html|js|css|json)$/.test(file) ? 'no-store' : 'public, max-age=30' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room) {
  const t = now();
  for (const [pid, ws] of socks.get(room.code) || []) send(ws, { type: 'state', build: BUILD, state: room.view(pid, t) });
}

function handle(room, pid, m) {
  const t = now(), ints = (v) => (Array.isArray(v) ? v.map(Number) : []);
  switch (m.action) {
    case 'update_settings': return room.updateSettings(pid, m.settings || {});
    case 'start_selection': return room.startSelection(pid, t);
    case 'select_players': return room.selectPlayers(pid, ints(m.ids), ints(m.wish));
    case 'back_to_lobby': return room.backToLobby(pid);
    case 'close_selection': return room.closeSelection(pid);
    case 'start_auction': return room.startAuction(pid, t);
    case 'bid': return room.placeBid(pid, t, m.increment == null ? null : Number(m.increment), m.amount == null ? null : Number(m.amount));
    case 'not_interested': return room.notInterestedIn(pid);
    case 'next_pool': return room.chooseNextPool(pid, String(m.pool));
    case 'pause': return room.pause(pid, t);
    case 'resume': return room.resume(pid, t);
    case 'reauction': return room.startReauction(pid, t);
    case 'end_auction': return room.endAuction(pid);
    case 'set_xi': return room.setXI(pid, ints(m.xi), m.impact == null ? null : Number(m.impact),
      m.captain == null ? null : Number(m.captain), m.keeper == null ? null : Number(m.keeper));
    case 'propose_trade': return room.proposeTrade(pid, String(m.to), ints(m.give), ints(m.get), Number(m.cash) || 0);
    case 'remove_team': {
      room.removeTeam(pid, String(m.team), t);
      const w = socks.get(room.code)?.get(String(m.team)); if (w) { send(w, { type: 'removed' }); socks.get(room.code).delete(String(m.team)); w.close(); }
      return;
    }
    case 'save_team': return room.saveTeam(pid);
    case 'counter_trade': return room.counterTrade(pid, Number(m.trade_id), ints(m.give), ints(m.get), Number(m.cash) || 0);
    case 'respond_trade': return room.respondTrade(pid, Number(m.trade_id), !!m.accept);
    case 'cancel_trade': return room.cancelTrade(pid, Number(m.trade_id));
    case 'ping': return;
    default: throw new GameError('Unknown action');
  }
}

wss.on('connection', (ws) => {
  let room = null, pid = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return send(ws, { type: 'error', message: 'Bad request' }); }
    try {
      if (!room) {                       // first message: create / join / rejoin
        if (m.action === 'create') {
          room = new Room(m.name, m.team_name, m.settings || {}, m.color); rooms.set(room.code, room); pid = room.hostId;
        } else if (m.action === 'join') {
          room = rooms.get(String(m.code || '').toUpperCase()); if (!room) throw new GameError('Room not found');
          pid = room.addTeam(m.name, m.team_name, m.color).pid;
        } else if (m.action === 'rejoin') {
          room = rooms.get(String(m.code || '').toUpperCase()); if (!room) throw new GameError('Room not found');
          pid = room.rejoin(m.token).pid;
        } else throw new GameError('Create or join a room first');
        if (!socks.has(room.code)) socks.set(room.code, new Map());
        const old = socks.get(room.code).get(pid); if (old && old !== ws) old.close();
        socks.get(room.code).set(pid, ws);
        send(ws, { type: 'joined', code: room.code, pid, token: room.teams.get(pid).token });
        return broadcast(room);
      }
      handle(room, pid, m);
    } catch (e) {
      if (!(e instanceof GameError)) { console.error(e); e = new GameError('Bad request'); }
      send(ws, { type: 'error', message: e.message });
      if (!room || !pid) { room = null; return; }   // failed to enter a room; allow retry on same socket
    }
    if (room) broadcast(room);
  });
  ws.on('close', () => {
    if (!room || !pid) return;
    if (socks.get(room.code)?.get(pid) === ws) { socks.get(room.code).delete(pid); room.teams.get(pid).connected = false; broadcast(room); }
  });
});

// game clock: advances timers, pushes a fresh state while bidding so countdowns stay in sync
let beat = 0;
setInterval(() => {
  beat++;
  for (const room of rooms.values()) {
    let changed = false;
    try { changed = room.tick(now()); } catch (e) { console.error(e); }
    if (changed || (room.phase === 'auction' && room.step === 'bidding' && !room.paused && beat % 4 === 0)) broadcast(room);
  }
}, 500);

if (require.main === module) server.listen(PORT, '0.0.0.0', () => console.log(`BID&BAT running on http://localhost:${PORT}`));
module.exports = { server };
