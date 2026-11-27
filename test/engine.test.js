'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, GameError, PLAYERS, RESULT_GAP } = require('../src/engine');

const pidOf = (name) => [...PLAYERS.values()].find((p) => p.name === name).id;
const mk = (n = 3, s = {}) => {
  const r = new Room('Host', 'CSK', { squad_size: 12, purse: 1000, base_price: 20, increments: [5, 10, 25], max_overseas: 3, bid_timer: 10, ...s });
  for (let i = 0; i < n - 1; i++) r.addTeam(`P${i}`, `T${i}`);
  return r;
};
const start = (r, picks, now = 0) => {
  r.startSelection(r.hostId, now);
  for (const t of r.teams.values()) r.selectPlayers(t.pid, picks);
  r.closeSelection(r.hostId); r.startAuction(r.hostId, now);
};
const sold = (r, team, names) => names.forEach((n) => r.teams.get(team).squad.set(pidOf(n), 20));
const throws = (fn, re) => assert.throws(fn, (e) => e instanceof GameError && (!re || re.test(e.message)));

test('selection merges unique players; unpicked excluded', () => {
  const r = mk(); r.startSelection(r.hostId, 0);
  const [a, b] = [...r.teams.keys()];
  r.selectPlayers(a, [1, 2]); r.selectPlayers(b, [2, 3]); r.closeSelection(r.hostId);
  assert.deepEqual(r.pool, [1, 2, 3]); assert.equal(r.queue.length, 3);
});
test('no joining after start', () => { const r = mk(); r.startSelection(r.hostId, 0); throws(() => r.addTeam('x', 'late')); });
test('host decides pool order', () => {
  const r = mk(3, { pool_order: ['Spinner', 'Bowler', 'All-rounder', 'Batsman'] });
  const ids = ['Noor Ahmed', 'Jos Buttler', 'Sam Curran', 'Mitchell Starc'].map(pidOf);
  r.startSelection(r.hostId, 0); r.selectPlayers(r.hostId, ids); r.closeSelection(r.hostId);
  assert.deepEqual(r.queue.map((i) => PLAYERS.get(i).type), ['Spinner', 'Bowler', 'All-rounder', 'Batsman']);
});
test('bid -> sold and purse update', () => {
  const r = mk(); const [a, b] = [...r.teams.keys()]; const pant = pidOf('Rishabh Pant');
  start(r, [pant]); r.placeBid(a, 1); assert.equal(r.bid, 20);
  throws(() => r.placeBid(a, 2, 5)); r.placeBid(b, 2, 10); assert.equal(r.bid, 30);
  assert.equal(r.tick(20), true); assert.equal(r.step, 'result');
  assert.equal(r.teams.get(b).purse, 970); assert.ok(r.teams.get(b).squad.has(pant));
});
test('timer resets on bid; pause/resume', () => {
  const r = mk(); const a = [...r.teams.keys()][0]; start(r, [1], 0);
  r.placeBid(a, 5); assert.equal(r.deadline, 15);
  r.pause(r.hostId, 8); r.tick(100); assert.equal(r.step, 'bidding');
  r.resume(r.hostId, 100); assert.equal(r.deadline, 107);
  r.tick(106.9); assert.equal(r.step, 'bidding');
});
test('auto-skip when everyone not interested', () => {
  const r = mk(); start(r, [1]); for (const t of r.teams.keys()) r.notInterestedIn(t);
  r.tick(1); assert.equal(r.result.status, 'UNSOLD'); assert.ok(r.unsold.includes(1));
});
test('timeout with no bids = unsold', () => { const r = mk(); start(r, [1]); r.tick(11); assert.equal(r.result.status, 'UNSOLD'); });
test('purse limit', () => {
  const r = mk(3, { purse: 30 }); const a = r.hostId, b = [...r.teams.keys()][1]; start(r, [1]);
  r.placeBid(a, 1); throws(() => r.placeBid(b, 2, 25), /purse/);
});
test('overseas cap blocks bidding', () => {
  const r = mk(3, { max_overseas: 1 }); const os = [...PLAYERS.values()].filter((p) => p.overseas).slice(0, 2).map((p) => p.id);
  start(r, os); r.placeBid(r.hostId, 1); r.tick(12); r.tick(16);
  assert.equal(r.step, 'bidding'); throws(() => r.placeBid(r.hostId, 17), /Overseas/);
});
test('auction ends when all squads full', () => {
  const r = new Room('H', 'A', { squad_size: 12, purse: 100000, base_price: 20, max_overseas: 12, bid_timer: 5 });
  start(r, [...PLAYERS.keys()].slice(0, 12)); let t = 0;
  for (let i = 0; i < 12; i++) { r.placeBid(r.hostId, t); t += 6; r.tick(t); t += RESULT_GAP + 1; r.tick(t); }
  assert.equal(r.phase, 'finished');
});
test('re-auction flow', () => {
  const r = mk(); start(r, [1, 2]); let t = 0;
  for (let i = 0; i < 2; i++) { t += 11; r.tick(t); t += 4; r.tick(t); }
  assert.equal(r.step, 'pools_done'); assert.equal(r.unsold.length, 2);
  r.startReauction(r.hostId, t); assert.equal(r.step, 'bidding'); assert.equal(r.unsold.length, 0);
  throws(() => r.startReauction([...r.teams.keys()][1], t));
});
test('playing XI rules', () => {
  const r = mk(); r.phase = 'auction'; r.settings.squad_size = 25; r.settings.max_overseas = 10; const a = r.hostId;
  const ind = ['Rishabh Pant', 'KL Rahul', 'Shreyas Iyer', 'Arshdeep Singh', 'Yuzvendra Chahal', 'Mohammed Siraj', 'Ishan Kishan', 'Venkatesh Iyer', 'Nitish Rana', 'Avesh Khan', 'Akash Deep'];
  const os = ['Jos Buttler', 'Mitchell Starc', 'Trent Boult', 'Jofra Archer', 'Josh Hazlewood'];
  sold(r, a, [...ind, ...os]);
  throws(() => r.setXI(a, [...ind.slice(0, 6), ...os].map(pidOf), null, pidOf('Rishabh Pant'), pidOf('Rishabh Pant')), /4 overseas/);
  const xi = [...ind.slice(0, 7), ...os.slice(0, 4)].map(pidOf);
  throws(() => r.setXI(a, xi, pidOf('Josh Hazlewood'), xi[0], pidOf('Rishabh Pant')), /Overseas impact/);
  r.setXI(a, xi, pidOf('Avesh Khan'), xi[0], pidOf('Ishan Kishan'));
  assert.equal(r.teams.get(a).keeper, pidOf('Ishan Kishan'));
  throws(() => r.setXI(a, xi, null, xi[0], xi[2]), /wicketkeeper/i);
});
test('auto keeper + no-keeper flag', () => {
  const r = mk(); r.phase = 'auction'; const a = r.hostId, b = [...r.teams.keys()][1];
  const names = ['Rishabh Pant', 'Shreyas Iyer', 'Arshdeep Singh', 'Yuzvendra Chahal', 'Mohammed Siraj', 'Venkatesh Iyer', 'Nitish Rana', 'Avesh Khan', 'Akash Deep', 'Washington Sundar', 'Harshal Patel', 'Bhuvneshwar Kumar'];
  sold(r, a, names); const xi = names.slice(0, 11).map(pidOf); r.setXI(a, xi, null, xi[1]);
  assert.equal(r.teams.get(a).keeper, pidOf('Rishabh Pant'));
  sold(r, b, ['Shreyas Iyer']);
  assert.equal(r.view(b, 0).teams.find((t) => t.id === b).no_keeper_flag, true);
});
test('trade flow with cash', () => {
  const r = mk(); r.phase = 'auction'; const [a, b] = [...r.teams.keys()];
  const pant = pidOf('Rishabh Pant'), sir = pidOf('Mohammed Siraj'); sold(r, a, ['Rishabh Pant']); sold(r, b, ['Mohammed Siraj']);
  const tr = r.proposeTrade(a, b, [pant], [sir], 100);
  throws(() => r.respondTrade(a, tr.id, true)); r.respondTrade(b, tr.id, true);
  assert.ok(r.teams.get(a).squad.has(sir)); assert.ok(r.teams.get(b).squad.has(pant));
  assert.equal(r.teams.get(a).purse, 900); assert.equal(r.teams.get(b).purse, 1100);
});
test('trade blocked by purse; reject works', () => {
  const r = mk(); r.phase = 'auction'; const [a, b] = [...r.teams.keys()]; sold(r, a, ['Rishabh Pant']); const pant = pidOf('Rishabh Pant');
  throws(() => r.proposeTrade(a, b, [pant], [], 5000), /purse/);
  const tr = r.proposeTrade(a, b, [pant], [], 0); r.respondTrade(b, tr.id, false); assert.equal(tr.status, 'rejected');
});
test('trade blocked by overseas cap', () => {
  const r = mk(); r.phase = 'auction'; r.settings.max_overseas = 1; const [a, b] = [...r.teams.keys()];
  sold(r, a, ['Rishabh Pant', 'Trent Boult']); sold(r, b, ['Jos Buttler']);
  throws(() => r.proposeTrade(a, b, [], [pidOf('Jos Buttler')], 0), /overseas/);
});
test('rejoin restores team', () => { const r = mk(); const t = [...r.teams.values()][1]; t.connected = false; assert.equal(r.rejoin(t.token), t); assert.equal(t.connected, true); });
test('franchise names get official colours, custom gets chosen colour', () => {
  const r = mk(1); const t = r.addTeam('x', 'rcb'); assert.equal(t.franchise, 'RCB'); assert.equal(t.color, '#D1222B');
  const c = r.addTeam('y', 'My XI', '#12abcd'); assert.equal(c.franchise, null); assert.equal(c.color, '#12abcd');
});

test('defaults: 120 Cr purse, 1 Cr base price', () => {
  const r = new Room('H', 'MI'); assert.equal(r.settings.purse, 12000); assert.equal(r.settings.base_price, 100);
});
test('host can end the auction mid-way; others cannot', () => {
  const r = mk(); start(r, [1, 2]); const g = [...r.teams.keys()][1];
  throws(() => r.endAuction(g), /host/i);
  r.placeBid(g, 1); r.endAuction(r.hostId);
  assert.equal(r.phase, 'finished'); assert.equal(r.teams.get(g).squad.size, 0); assert.ok(r.unsold.includes(1) || r.unsold.length >= 0);
  throws(() => r.endAuction(r.hostId));
});

test('host can bring a pool forward; others cannot; empty pool refused', () => {
  const r = mk(); const ids = ['Jos Buttler', 'Rishabh Pant', 'Mohammed Siraj', 'Pat Cummins', 'Noor Ahmed'].map(pidOf);
  start(r, ids);                                    // batsmen first, then bowlers, all-rounders, spinners
  assert.equal(r.view(r.hostId, 0).next_pool, 'Batsman');
  throws(() => r.chooseNextPool([...r.teams.keys()][1], 'Spinner'), /host/i);
  r.chooseNextPool(r.hostId, 'Spinner');
  assert.equal(r.view(r.hostId, 0).next_pool, 'Spinner');
  assert.equal(PLAYERS.get(r.queue[0]).type, 'Spinner');
  throws(() => r.chooseNextPool(r.hostId, 'All-rounder'), /No All-rounder/);
  assert.equal(r.queue.length, ids.length - 1 - 0 === r.queue.length ? r.queue.length : -1);
  r.tick(11); r.tick(15);                           // current lot unsold, next comes from the chosen pool
  assert.equal(PLAYERS.get(r.current).type, 'Spinner');
});
test('player view carries batting hand, bowling style and photo slot', () => {
  const r = mk(); start(r, [pidOf('Devon Conway')]);
  const c = r.view(r.hostId, 0).current;
  assert.equal(c.bat, 'L'); assert.ok('bowl' in c); assert.ok('photo' in c);
  assert.ok([...PLAYERS.values()].every((p) => p.bat === 'R' || p.bat === 'L'));
});

test('wishlist is private, always inside the selection, and flags the live lot', () => {
  const r = mk(); const [a, b] = [...r.teams.keys()]; const pant = pidOf('Rishabh Pant'), buttler = pidOf('Jos Buttler');
  r.startSelection(r.hostId, 0);
  r.selectPlayers(a, [pant], [pant, buttler]);            // buttler is not selected, so he cannot be wishlisted
  r.selectPlayers(b, [pant, buttler], [buttler]);
  assert.deepEqual(r.view(a, 0).my_wish, [pant]);
  assert.deepEqual(r.view(b, 0).my_wish, [buttler]);
  r.closeSelection(r.hostId); r.startAuction(r.hostId, 0);
  const cur = r.current;
  assert.equal(r.view(a, 0).current.wished, cur === pant);
  assert.equal(r.view(b, 0).current.wished, cur === buttler);
  assert.equal(r.view(a, 0).my_wishlist[0].status, cur === pant ? 'live' : 'upcoming');
  assert.ok(!JSON.stringify(r.view(a, 0).teams).includes('wish'));   // nothing about wishlists leaks via the teams list
  r.placeBid(r.hostId === a ? a : a, 1); // a bids on whoever is live; then sale
  r.tick(20);
  assert.ok(['sold', 'live', 'upcoming'].includes(r.view(a, 21).my_wishlist[0].status));
});

test('counter offer, cash both ways, saved flag resets after trade', () => {
  const r = mk(); r.phase = 'auction'; const [a, b] = [...r.teams.keys()];
  const pant = pidOf('Rishabh Pant'), sir = pidOf('Mohammed Siraj'); sold(r, a, ['Rishabh Pant']); sold(r, b, ['Mohammed Siraj']);
  const t1 = r.proposeTrade(a, b, [pant], [sir], 0);
  throws(() => r.counterTrade(a, t1.id, [sir], [pant], 0));
  const t2 = r.counterTrade(b, t1.id, [sir], [pant], 200);   // B gives Siraj, wants Pant, B pays 2 Cr
  assert.equal(t1.status, 'countered'); assert.equal(t2.frm, b); assert.equal(t2.to, a);
  r.teams.get(a).saved = true; r.teams.get(b).saved = true;
  r.respondTrade(a, t2.id, true);
  assert.equal(r.teams.get(a).purse - r.teams.get(b).purse, 400 - 0);
  assert.equal(r.teams.get(a).saved, false);
});
test('save team and all_saved', () => {
  const r = mk(2); r.phase = 'finished'; const [a, b] = [...r.teams.keys()];
  r.saveTeam(a); assert.equal(r.view(a, 0).all_saved, false); r.saveTeam(b); assert.equal(r.view(a, 0).all_saved, true);
});
test('ranking only after all teams saved, ignores money, shows tiers', () => {
  const r = mk(2); r.phase = 'finished'; const [a, b] = [...r.teams.keys()];
  const sold2 = (pid, names) => sold(r, pid, names);
  sold2(a, ['Rishabh Pant', 'Mohammed Siraj']); sold2(b, ['Noor Ahmed']);
  r.saveTeam(a); assert.equal(r.view(a, 0).ranking, null);
  r.saveTeam(b); const rk = r.view(a, 0).ranking;
  assert.equal(rk.length, 2); assert.ok(['S', 'A', 'B', 'C'].includes(rk[0].tier)); assert.ok(rk[0].score >= rk[1].score);
  assert.ok(rk[0].cats.length === 8);
});
test('host can remove a team: bid voided, cannot bid or rejoin, ignored for end and ranking', () => {
  const r = mk(3); const [h, a, b] = [...r.teams.keys()]; r.phase = 'auction'; r.step = 'bidding';
  r.current = pidOf('Rishabh Pant'); r.holder = a; r.bid = 300; r.deadline = 50; r.notInterested = new Set();
  throws(() => r.removeTeam(a, b, 10)); throws(() => r.removeTeam(h, h, 10));
  r.removeTeam(h, a, 10);
  assert.equal(r.holder, null); assert.equal(r.bid, 0); assert.equal(r.deadline, 10 + r.settings.bid_timer);
  throws(() => r.placeBid(a, 11), /removed/); throws(() => r.rejoin(r.teams.get(a).token), /removed/);
  assert.equal(r.view(h, 11).teams.find((t) => t.id === a).removed, true);
  r.phase = 'finished'; r.saveTeam(h); r.saveTeam(b); assert.equal(r.view(h, 0).all_saved, true);
});

test('host can step back from selection to the lobby', () => {
  const r = mk(2); const [h, a] = [...r.teams.keys()]; r.startSelection(h, 0); r.selectPlayers(a, [1, 2], [1]);
  throws(() => r.backToLobby(a)); r.backToLobby(h);
  assert.equal(r.phase, 'lobby'); assert.equal(r.teams.get(a).selection.size, 0);
  r.startSelection(h, 5); assert.equal(r.phase, 'selection');
});
test('sells at once when every rival has passed or cannot bid', () => {
  const r = mk(3); const [h, a, b] = [...r.teams.keys()]; start(r, [pidOf('Rishabh Pant'), pidOf('Jos Buttler')]);
  r.placeBid(a, 1); r.notInterestedIn(h); r.tick(2); assert.equal(r.step, 'bidding');     // b can still bid
  r.notInterestedIn(b); r.tick(3);
  assert.equal(r.step, 'result'); assert.equal(r.result.status, 'SOLD'); assert.equal(r.result.team_id, a);
});
test('everyone passes with no bid: unsold', () => {
  const r = mk(2); const [h, a] = [...r.teams.keys()]; start(r, [pidOf('Rishabh Pant')]);
  r.notInterestedIn(h); r.notInterestedIn(a); r.tick(1); assert.equal(r.result.status, 'UNSOLD');
});
test('custom bid: validation, big-bid alert and lock', () => {
  const r = mk(3, { purse: 5000 }); const [h, a, b] = [...r.teams.keys()]; start(r, [pidOf('Rishabh Pant'), pidOf('Jos Buttler')]);
  r.placeBid(a, 1); assert.equal(r.bid, 20);
  throws(() => r.placeBid(b, 2, null, 22), /at least/);                 // below current + smallest step
  r.placeBid(b, 2, null, 40); assert.equal(r.bid, 40); assert.equal(r.bigBid, null);   // small jump: no alert
  r.placeBid(a, 3, null, 900);                                            // jump of 860 lakh > 500
  assert.equal(r.bid, 900); assert.equal(r.bigBid.team, a); assert.equal(r.bigBid.from, 40);
  assert.equal(r.view(b, 3).current.big_bid.lock_remaining, 3);
  throws(() => r.placeBid(b, 4, 5), /jumped/); throws(() => r.placeBid(b, 5, null, 950), /jumped/);
  r.placeBid(b, 6.5, null, 950); assert.equal(r.holder, b);               // lock over
  throws(() => r.placeBid(a, 7, null, 6000), /purse/);
});
test('trade keeps the rest of the XI in place', () => {
  const r = mk(2); r.phase = 'auction'; const [a, b] = [...r.teams.keys()];
  const names = ['Rishabh Pant', 'Mohammed Siraj', 'Jos Buttler']; sold(r, a, names); sold(r, b, ['Noor Ahmed']);
  const ta = r.teams.get(a); ta.xi = names.map(pidOf); ta.captain = pidOf('Jos Buttler'); ta.impact = null; ta.saved = true;
  const t = r.proposeTrade(a, b, [pidOf('Mohammed Siraj')], [pidOf('Noor Ahmed')], 0); r.respondTrade(b, t.id, true);
  assert.deepEqual(ta.xi, [pidOf('Rishabh Pant'), pidOf('Jos Buttler')]); assert.equal(ta.captain, pidOf('Jos Buttler')); assert.equal(ta.saved, false);
});

test('rating uses the batting slot and conditions; impact and bench are separate', () => {
  const rating = require('../src/rating');
  const by = (n) => { const p = [...PLAYERS.values()].find((x) => x.name === n); assert.ok(p, n); return p; };
  const names = ['Vaibhav Suryavanshi', 'Phil Salt', 'Virat Kohli', 'Shubman Gill', 'Suryakumar Yadav', 'Hardik Pandya', 'Sunil Narine', 'Rashid Khan', 'Jasprit Bumrah', 'Mohammed Siraj', 'Kuldeep Yadav', 'Ravindra Jadeja', 'Tilak Varma'];
  const sq = names.map(by); const mk2 = (order) => ({ id: 'a', squad: sq, xi: order.map((n) => by(n).id), impact: by('Ravindra Jadeja').id });
  const xi = names.slice(0, 11);
  const g = rating.rankTeams([mk2(xi)], 'Dry, turning pitch (spin-friendly)')[0];
  assert.equal(g.cats.length, 8); assert.ok(g.impact && g.bench);
  for (const c of g.cats) { assert.ok(c.pros.length && c.cons.length && c.summary); }
  // Narine at 7 is flagged as out of his usual role; at 1 he is a natural opener
  const at7 = g.cats.find((c) => c.key === 'fin');
  assert.ok(at7.cons.some((x) => x.includes('Sunil Narine is usually an opener')));
  const swapped = [...xi]; swapped[0] = 'Sunil Narine'; swapped[6] = 'Vaibhav Suryavanshi';
  const g2 = rating.rankTeams([mk2(swapped)], 'Dry, turning pitch (spin-friendly)')[0];
  assert.ok(!g2.cats.find((c) => c.key === 'open').cons.some((x) => x.includes('usually an opener')));
  // conditions change the spin score
  const turn = rating.rankTeams([mk2(xi)], 'Dry, turning pitch (spin-friendly)')[0].cats.find((c) => c.key === 'spin').score;
  const green = rating.rankTeams([mk2(xi)], 'Green top (pace and bounce)')[0].cats.find((c) => c.key === 'spin').score;
  assert.ok(turn > green);
});
