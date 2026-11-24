'use strict';
// Post-auction team grading. Uses ONLY player quality (stats-based ratings in data/stats.json);
// money spent and purse left are deliberately ignored. Never sent to clients before the auction ends.
const fs = require('fs');
const path = require('path');
let STATS = {};
try { STATS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'stats.json'), 'utf8')); } catch { /* ranking disabled */ }

const CATS = [
  { key: 'opening', label: 'Openers', n: 2, w: 20, rate: 'opening' },
  { key: 'middle', label: 'Middle order', n: 3, w: 20, rate: 'middle_order' },
  { key: 'finishing', label: 'Hitting and finishing', n: 2, w: 15, rate: 'finishing' },
  { key: 'allround', label: 'All-rounders', n: 2, w: 15, rate: 'allrounder' },
  { key: 'pace', label: 'Pace attack', n: 3, w: 17, rate: 'pace' },
  { key: 'spin', label: 'Spin attack', n: 2, w: 13, rate: 'spin' },
];
const SHRINK = { high: 1, medium: 0.9, low: 0.7 };   // thin data pulls a rating toward the average
const FLOOR = 35;                                     // an empty slot counts as a weak player
// tier cut-offs, calibrated on random squads from the pool (S about the top 10%, A next 25%, B next 35%)
const CUTS = { S: 65, A: 61, B: 57 };

const rated = (p, rate) => {
  const s = STATS[p.id]; if (!s || !s.ratings || s.ratings[rate] == null) return null;
  return 50 + (s.ratings[rate] - 50) * (SHRINK[s.conf] ?? 0.8);
};

function gradeTeam(t) {
  const pool = t.xi.length === 11 ? t.squad.filter((p) => t.xi.includes(p.id) || p.id === t.impact) : t.squad;
  const cats = CATS.map((c) => {
    const picks = pool.map((p) => ({ p, r: rated(p, c.rate) })).filter((x) => x.r != null).sort((a, b) => b.r - a.r).slice(0, c.n);
    const vals = picks.map((x) => x.r); while (vals.length < c.n) vals.push(FLOOR);
    return { key: c.key, label: c.label, w: c.w, score: Math.round((vals.reduce((a, b) => a + b, 0) / c.n) * 10) / 10, players: picks.map((x) => x.p.name), gap: picks.length < c.n };
  });
  const total = cats.reduce((a, c) => a + c.score * c.w, 0) / CATS.reduce((a, c) => a + c.w, 0);
  const score = Math.round(total * 10) / 10;
  const tier = score >= CUTS.S ? 'S' : score >= CUTS.A ? 'A' : score >= CUTS.B ? 'B' : 'C';
  return { team: t.id, score, tier, cats, pool: pool.map((p) => p.id) };
}

function explain(g, all) {
  const mean = (k) => all.reduce((a, x) => a + x.cats.find((c) => c.key === k).score, 0) / all.length;
  const diffs = g.cats.map((c) => ({ c, d: c.score - mean(c.key) })).sort((a, b) => b.d - a.d);
  const best = diffs.slice(0, 2).filter((x) => x.d > 1), worst = diffs.slice(-2).reverse().filter((x) => x.d < -1);
  const who = (c) => (c.players.length ? c.players.join(' and ') : 'nobody suitable');
  const lines = [];
  for (const x of best) lines.push({ good: true, text: `${x.c.label} (${x.c.score}): strong. ${who(x.c)}.` });
  for (const x of worst) lines.push({ good: false, text: `${x.c.label} (${x.c.score}): weak${x.c.gap ? ', not enough players for this role' : ''}. ${who(x.c)}.` });
  // trump card and risk lines from the single best-rated player
  const top = g.pool.map((id) => ({ id, s: STATS[id] })).filter((x) => x.s).map((x) => ({ ...x, best: Math.max(...Object.values(x.s.ratings).filter((v) => v != null), 0) })).sort((a, b) => b.best - a.best)[0];
  return { lines, star: top ? { id: top.id, trump: top.s.trump, spot: top.s.spot } : null };
}

function rankTeams(teams) {
  const grades = teams.map(gradeTeam).sort((a, b) => b.score - a.score);
  const quality = (g) => {
    let low = 0, n = 0; for (const id of g.pool) { n++; if (STATS[id] && STATS[id].conf === 'low') low++; } return n ? low / n : 0;
  };
  return grades.map((g, i) => ({ ...g, rank: i + 1, ...explain(g, grades), thin_data: quality(g) > 0.4 }));
}
const profile = (id) => STATS[id] || null;
module.exports = { rankTeams, gradeTeam, profile, CUTS, available: () => Object.keys(STATS).length > 0 };
