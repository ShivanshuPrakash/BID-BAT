'use strict';
// Real WebSocket flow against a live server. Starts its own server on a random port.
const WebSocket = require('ws');
const assert = require('node:assert/strict');
const { server } = require('../src/server');

const open = (url) => new Promise((res) => { const ws = new WebSocket(url); ws.msgs = []; ws.waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(d); ws.msgs.push(m); ws.waiters = ws.waiters.filter((w) => !w(m)); }); ws.on('open', () => res(ws)); });
const wait = (ws, pred, ms = 8000) => new Promise((res, rej) => { const hit = ws.msgs.slice().reverse().find(pred); if (hit) return res(hit);
  const t = setTimeout(() => rej(new Error('timeout')), ms); ws.waiters.push((m) => { if (pred(m)) { clearTimeout(t); res(m); return true; } return false; }); });
const tx = (ws, o) => ws.send(JSON.stringify(o));

server.listen(0, async () => {
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  try {
    const h = await open(url), g = await open(url);
    tx(h, { action: 'create', name: 'Host', team_name: 'CSK', settings: { squad_size: 12, purse: 5000, bid_timer: 2, selection_window: 600, ground: 'Wankhede' } });
    const hj = await wait(h, (m) => m.type === 'joined');
    tx(g, { action: 'join', code: hj.code, name: 'Guest', team_name: 'Dhoni Army', color: '#12abcd' });
    const gj = await wait(g, (m) => m.type === 'joined');
    await wait(h, (m) => m.type === 'state' && m.state.teams.length === 2);
    tx(h, { action: 'start_selection' });
    const sel = await wait(g, (m) => m.type === 'state' && m.state.phase === 'selection'); assert.equal(sel.state.players.length, 401);
    tx(h, { action: 'select_players', ids: [1, 2] }); tx(g, { action: 'select_players', ids: [2, 3] });
    await new Promise((r) => setTimeout(r, 300));
    tx(h, { action: 'close_selection' }); tx(h, { action: 'start_auction' });
    const live = await wait(g, (m) => m.type === 'state' && m.state.step === 'bidding'); console.log('auction on:', live.state.current.name);
    tx(g, { action: 'bid' });
    const res = await wait(h, (m) => m.type === 'state' && m.state.step === 'result'); console.log('result:', res.state.result.status, res.state.result.team);
    assert.equal(res.state.result.team, 'Dhoni Army');
    g.close(); await new Promise((r) => setTimeout(r, 200));
    const g2 = await open(url); tx(g2, { action: 'rejoin', code: hj.code, token: gj.token });
    const back = await wait(g2, (m) => m.type === 'state'); const me = back.state.teams.find((t) => t.id === gj.pid);
    console.log('rejoined, squad:', me.squad.map((p) => p.name), 'purse', me.purse); assert.equal(me.squad.length, 1);
    const x = await open(url); tx(x, { action: 'join', code: hj.code, name: 'Late', team_name: 'Late' });
    const err = await wait(x, (m) => m.type === 'error'); console.log('late join ->', err.message); assert.match(err.message, /closed/);
    console.log('E2E OK'); process.exit(0);
  } catch (e) { console.error('E2E FAILED', e); process.exit(1); }
});
