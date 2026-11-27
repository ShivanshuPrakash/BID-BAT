// Calibration helper: random squads -> auto XI -> score distribution. Run: node test/calibrate.js
const E = require('../src/engine.js'); const R = require('../src/rating.js');
const all = [...E.PLAYERS.values()].filter((p) => p.season);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const stats = require('../data/stats.json');
const best = (p) => Math.max(0, ...Object.values((stats[p.id] || {}).ratings || {}).filter((x) => x != null));
function team(i) {
  const sq = []; const pool = [...all];
  while (sq.length < 15) { const p = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; if (sq.filter((x) => x.overseas).length >= 8 && p.overseas) continue; sq.push(p); }
  // sensible XI: keeper, 4 best bowlers-ish, order by natural group
  let xi = [...sq].sort((a, b) => best(b) - best(a)); const pick = []; let os = 0;
  for (const p of xi) { if (pick.length === 11) break; if (p.overseas && os >= 4) continue; if (p.overseas) os++; pick.push(p); }
  const grp = (p) => { const r = (stats[p.id] || {}).ratings || {}; const g = ['opening', 'middle_order', 'finishing'].map((k) => [k, r[k] ?? -1]).sort((a, b) => b[1] - a[1])[0]; return g[1] < 0 ? 3 : ['opening', 'middle_order', 'finishing'].indexOf(g[0]); };
  pick.sort((a, b) => grp(a) - grp(b));
  const rest = sq.filter((p) => !pick.includes(p));
  return { id: 't' + i, squad: sq, xi: pick.map((p) => p.id), impact: rest[0] && !(rest[0].overseas && os >= 4) ? rest[0].id : null };
}
const cond = process.argv[2] || '';
const sc = []; for (let i = 0; i < 3000; i++) sc.push(R.rankTeams([team(i)], cond)[0].score);
sc.sort((a, b) => a - b); const q = (x) => sc[Math.floor(x * sc.length)];
console.log('min', sc[0], 'p10', q(.1), 'p30', q(.3), 'p50', q(.5), 'p65', q(.65), 'p90', q(.9), 'max', sc[sc.length - 1]);
console.log('suggested cuts: S', q(.9), 'A', q(.65), 'B', q(.3));
