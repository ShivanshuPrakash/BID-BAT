'use strict';
// Post-auction team grading. Uses ONLY player quality (stats-based profiles in data/stats.json);
// money spent and purse left are deliberately ignored. Never sent to clients before the auction ends.
//
// How a team is judged:
//  - The playing XI is rated slot by slot, in the batting order the owner saved (1-2 openers, 3-5 middle,
//    6-8 finishers, 9-11 tail). A player placed outside his usual role is rated for the slot, not his franchise role.
//  - Bowling is rated by the 20 overs: who bowls the powerplay, middle overs and death, and how many overs of
//    pace and spin the XI really has (all-rounders and part-timers included).
//  - The host's pitch/conditions shift the ratings.
//  - The impact player and the bench are rated separately and do NOT count in the XI score.
const fs = require('fs');
const path = require('path');
let STATS = {};
try { STATS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'stats.json'), 'utf8')); } catch { /* ranking disabled */ }

const SHRINK = { high: 1, medium: 0.9, low: 0.7 };   // thin data pulls a rating toward the average
const FLOOR = 35;
const CUTS = { S: 67, A: 63, B: 58 };                // calibrated on random squads (see test/calibrate.js)
const WEIGHTS = { open: 16, mid: 18, fin: 12, depth: 8, pace: 16, spin: 10, phases: 12, balance: 8 };

const OFF = { opening: { middle_order: -4, finishing: -7 }, middle_order: { opening: -6, finishing: -8 }, finishing: { middle_order: -5, opening: -12 } };
const GRP_NAME = { opening: 'an opener', middle_order: 'a middle-order batter', finishing: 'a finisher' };
const SLOT_GRP = (i) => (i < 2 ? 'opening' : i < 5 ? 'middle_order' : i < 8 ? 'finishing' : 'tail');

// condition effects, in rating points
const CONDS = [
  { re: /batting-friendly/i, name: 'a dry, hard pitch', m: { opening: 2, middle_order: 2, finishing: 2, pace: -1, spin: -1, death: 0 } },
  { re: /turning/i, name: 'a turning pitch', m: { opening: -1, middle_order: -2, finishing: -1, pace: -3, spin: 5, death: 0 } },
  { re: /green top/i, name: 'a green top', m: { opening: -3, middle_order: -1, finishing: 0, pace: 5, spin: -4, death: 0 } },
  { re: /slow and low/i, name: 'a slow, low pitch', m: { opening: -1, middle_order: 0, finishing: -3, pace: -1, spin: 4, death: 0 } },
  { re: /flat track/i, name: 'a flat, high-scoring track', m: { opening: 3, middle_order: 3, finishing: 3, pace: -2, spin: -2, death: -2 } },
  { re: /swing/i, name: 'humid, swinging conditions', m: { opening: -3, middle_order: -1, finishing: 0, pace: 4, spin: -1, death: 0 } },
  { re: /dew/i, name: 'heavy dew', m: { opening: 0, middle_order: 1, finishing: 1, pace: -2, spin: -4, death: -3 } },
  { re: /overcast/i, name: 'an overcast sky', m: { opening: -2, middle_order: -1, finishing: 0, pace: 3, spin: -1, death: 0 } },
  { re: /hot day/i, name: 'a hot day', m: { opening: 0, middle_order: 0, finishing: 0, pace: -2, spin: 1, death: 0 } },
  { re: /night match/i, name: 'a night match', m: { opening: 0, middle_order: 0, finishing: 0, pace: 1, spin: -1, death: 0 } },
];
const NOMOD = { opening: 0, middle_order: 0, finishing: 0, pace: 0, spin: 0, death: 0 };
const condOf = (text) => { const c = CONDS.find((x) => x.re.test(text || '')); return c ? { name: c.name, m: c.m } : { name: null, m: NOMOD }; };

const S = (p) => STATS[p.id] || {};
const R = (p) => S(p).ratings || {};
const sh = (p, v) => 50 + (v - 50) * (SHRINK[S(p).conf] ?? 0.8);
const clamp = (v) => Math.max(0, Math.min(100, v));
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v) => Math.round(v * 10) / 10;
const short = (t, n = 150) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
const dot = (t) => { t = String(t || '').trim(); return t && !/[.!?…]$/.test(t) ? t + '.' : t; };
const verdictOf = (v) => (v >= 74 ? 'Excellent' : v >= 65 ? 'Strong' : v >= 56 ? 'Solid' : v >= 47 ? 'Average' : 'Weak');
const names = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const formWorry = (p) => /poor|struggl|slump|dip\b|inconsistent|indifferent|patchy|unverified|no figures/i.test(S(p).form || '');
const bestRating = (p) => Math.max(0, ...Object.values(R(p)).filter((x) => x != null));

// ---------- batting ----------
const batBase = (p) => {
  if (p.type === 'All-rounder') { const a = R(p).allrounder; return a != null ? 42 + (a - 50) * 0.5 : 40; }
  if (p.type === 'Bowler' || p.type === 'Spinner') return 28;
  return 48;
};
/** Rating of player p batting at 0-based slot i. derived = he has no rating for this slot, so it is estimated. */
function batAt(p, i, m) {
  const grp = SLOT_GRP(i), r = R(p);
  const have = ['opening', 'middle_order', 'finishing'].filter((k) => r[k] != null).map((k) => ({ k, v: sh(p, r[k]) })).sort((a, b) => b.v - a.v);
  const natural = have.length ? have[0].k : null;
  if (grp === 'tail') { const b = have.length ? have[0].v - 12 : batBase(p); return { v: clamp(Math.min(b, 60)), grp, natural, derived: false }; }
  const own = have.find((x) => x.k === grp);
  if (own) return { v: clamp(own.v + m[grp]), grp, natural, derived: false };
  if (have.length) return { v: clamp(have[0].v + (OFF[have[0].k][grp] || -8) + m[grp]), grp, natural, derived: true };
  return { v: clamp(batBase(p) + m[grp]), grp, natural: null, derived: true };
}

// ---------- bowling ----------
const kindOf = (p) => {
  const b = p.bowl || '';
  if (/^(OB|LB|SLA|LC|LBG|SLO|OS)$/.test(b)) return 'spin';
  if (/^(RF|RFM|RM|LF|LFM|LM|MF|RMF|LMF)$/.test(b)) return 'pace';
  if (p.type === 'Spinner') return 'spin';
  if (p.type === 'Bowler') return 'pace';
  return null;
};
function bowlProfile(p) {
  const kind = kindOf(p), r = R(p), s = S(p);
  if (!kind) return null;
  let q = kind === 'spin' ? r.spin : r.pace, overs = 0;
  if (p.type === 'Bowler' || p.type === 'Spinner') { overs = 4; q = q ?? 50; }
  else if (p.type === 'All-rounder') {
    const a = r.allrounder; if (q == null) q = a != null ? 45 + (a - 50) * 0.4 : 45;
    overs = /batting all-rounder|batter who bowl|part-time/i.test(s.role || '') ? 2 : (a >= 80 && q >= 75 ? 4 : 3);
  } else if (q != null) { overs = 1; }
  if (!overs) return null;
  const txt = ((s.role || '') + ' ' + (s.trump || '') + ' ' + (s.strong || '') + ' ' + (s.summary || '')).toLowerCase();
  return { p, kind, q: sh(p, q), overs, cap: overs,
    pp: /powerplay|new.ball|swing|opening spell/.test(txt), death: /death|yorker|slog/.test(txt), mid: /middle.overs|breaks? partnership|through the middle/.test(txt) };
}
const phaseQ = (b, ph, m) => {
  let q = b.q + (b.kind === 'spin' ? m.spin : m.pace);
  if (b[ph]) q += 6;
  else if (b.kind === 'spin') q += ph === 'death' ? -8 : ph === 'pp' ? -3 : 3;
  else q += ph === 'mid' ? -2 : 0;
  if (ph === 'death') q += m.death;
  return clamp(q);
};
/** Spread 20 overs across bowlers: death first, then powerplay, then middle. Max 4 overs each, 2 in powerplay, 2 at death. */
function allocate(bowlers, m) {
  const left = new Map(bowlers.map((b) => [b, b.cap]));
  const out = { death: [], pp: [], mid: [] };
  for (const [ph, n, cap] of [['death', 5, 2], ['pp', 6, 2], ['mid', 9, 4]]) {
    const used = new Map();
    for (let k = 0; k < n; k++) {
      const c = bowlers.filter((b) => left.get(b) > 0 && (used.get(b) || 0) < cap).sort((a, b) => phaseQ(b, ph, m) - phaseQ(a, ph, m))[0];
      if (!c) { out[ph].push({ b: null, q: FLOOR }); continue; }
      left.set(c, left.get(c) - 1); used.set(c, (used.get(c) || 0) + 1); out[ph].push({ b: c, q: phaseQ(c, ph, m) });
    }
  }
  return out;
}

// ---------- text helpers ----------
const lc = (t) => String(t || '').replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
/** One clear sentence about what the player is good at / bad at; very short profile fragments are turned into sentences. */
const trumpBody = (p) => { const t = String(S(p).trump || '').trim(); if (!t) return ''; return t.length < 28 ? `known for ${lc(t)}.` : dot(short(t)); };
const trumpOf = (p, nm) => { const b = trumpBody(p); return b ? `${nm}: ${b}` : ''; };
const spotOf = (p, nm) => { const t = String(S(p).spot || '').trim(); if (!t) return ''; return t.length < 28 ? `${nm}: ${lc(t)} is the known weak point.` : `${nm}: ${dot(short(t))}`; };
function playerNotes(p, rating, o) {
  const s = S(p), pros = [], cons = [], nm = p.name;
  if (o.derived) {
    if (o.natural) cons.push(`${nm} is usually ${GRP_NAME[o.natural]}. At No. ${o.slot + 1} his rating (${Math.round(rating)}) is an estimate of how he fits this role, not his franchise record.`);
    else cons.push(`${nm} is a bowler first; at No. ${o.slot + 1} he is rated ${Math.round(rating)} as a batter.`);
    if (o.bowl && rating >= 50) pros.push(`${nm} adds hitting at No. ${o.slot + 1} and still bowls, the classic way to build batting depth without losing an over.`);
  } else if (rating >= 72 && s.trump) pros.push(`${nm} (${Math.round(rating)}): ${trumpBody(p)}`);
  else if (rating >= 64) pros.push(`${nm} (${Math.round(rating)}): reliable for this role.`);
  if (!o.derived && s.spot && rating < 80) cons.push(spotOf(p, nm));
  else if (!o.derived && rating < 60) cons.push(`${nm} (${Math.round(rating)}) is below the level of a strong side at this spot.`);
  if (formWorry(p)) cons.push(`${nm}: recent form is a worry. ${dot(short(s.form, 140))}`);
  if (s.conf === 'low') cons.push(`${nm}: limited public data, so this rating is cautious.`);
  return { pros, cons };
}
function condLine(c, key, label) {
  const d = c.m[key]; if (!d || !c.name) return null;
  return { good: d > 0, text: `${c.name[0].toUpperCase()}${c.name.slice(1)} ${d > 0 ? 'helps' : 'hurts'} the ${label} (${d > 0 ? '+' : ''}${d}).` };
}
function section(key, label, score, players, pros, cons, paragraph) {
  if (!pros.length) pros = ['Nothing stands out as a clear strength here.'];
  if (!cons.length) cons = ['No obvious weakness.'];
  return { key, label, score: r1(score), w: WEIGHTS[key], verdict: verdictOf(score), summary: paragraph, pros, cons, players };
}

// ---------- the grade ----------
function lineupOf(t) {
  const byId = new Map(t.squad.map((p) => [p.id, p]));
  if (t.xi && t.xi.length === 11 && t.xi.every((i) => byId.has(i))) {
    return { xi: t.xi.map((i) => byId.get(i)), imp: t.impact != null ? byId.get(t.impact) || null : null,
      bench: t.squad.filter((p) => !t.xi.includes(p.id) && p.id !== t.impact), full: true };
  }
  // team not complete: grade the squad as it stands, best players first, no impact or bench
  const xi = [...t.squad].sort((a, b) => bestRating(b) - bestRating(a)).slice(0, 11);
  return { xi, imp: null, bench: [], full: false };
}

function gradeTeam(t, cond) {
  const c = cond || condOf('');
  const m = c.m;
  const { xi, imp, bench, full } = lineupOf(t);
  const slots = xi.map((p, i) => ({ p, i, ...batAt(p, i, m) }));
  const bowlers = xi.map(bowlProfile).filter(Boolean);
  const bp = (p) => bowlers.find((b) => b.p.id === p.id);

  // --- batting sections by slot group
  const grpSection = (key, label, from, to, grpKey, role) => {
    const sl = slots.slice(from, to);
    if (!sl.length) return section(key, label, FLOOR, [], [], ['The XI has no player in this role.'], `Nobody is placed at ${role}.`);
    const score = avg(sl.map((x) => x.v));
    const pros = [], cons = [];
    for (const x of sl) {
      const n = playerNotes(x.p, x.v, { derived: x.derived, natural: x.natural, slot: x.i, bowl: !!bp(x.p) });
      pros.push(...n.pros); cons.push(...n.cons);
    }
    if (sl.length > 1 && sl.every((x) => x.v >= 72)) pros.unshift(`${sl.length === 2 ? 'Both' : 'All ' + sl.length} are high-quality for ${role}.`);
    if (score < 56) cons.unshift('This group is below the level of a strong side. Winning teams usually have at least one genuinely elite batter here.');
    const cl = condLine(c, grpKey, label.toLowerCase()); if (cl) (cl.good ? pros : cons).push(cl.text);
    const lead = sl.map((x) => `${x.p.name} (${Math.round(x.v)})`);
    return section(key, label, score, sl.map((x) => x.p.name), pros, cons,
      `${names(lead)} ${sl.length > 1 ? 'are' : 'is'} placed at ${role}. ${verdictOf(score)} for this role${c.name ? ` on ${c.name}` : ''}.`);
  };
  const open = grpSection('open', 'Openers', 0, 2, 'opening', 'No. 1 and 2');
  const mid = grpSection('mid', 'Middle order', 2, 5, 'middle_order', 'No. 3 to 5');
  const fin = grpSection('fin', 'Hitting and finishing', 5, 8, 'finishing', 'No. 6 to 8');

  // --- batting depth
  const real = slots.slice(0, 9).filter((x) => x.v >= 55);
  const depthScore = [40, 40, 40, 44, 52, 62, 72, 82, 90, 96][Math.min(real.length, 9)];
  const dp = [], dc = [];
  if (real.length >= 7) dp.push(`${real.length} proper batters in the first 9 spots; the tail is short.`);
  else if (real.length === 6) dp.push('6 proper batters in the first 9 spots is workable.');
  if (slots[7] && slots[7].v >= 55) dp.push(`${slots[7].p.name} at No. 8 means the lower order can still score.`);
  if (real.length <= 5) dc.push(`Only ${real.length} proper batters in the first 9 spots. If the top order fails, the innings collapses.`);
  if (slots[6] && slots[6].v < 50) dc.push(`${slots[6].p.name} at No. 7 is a bowler more than a batter, so the order thins out early.`);
  const depth = section('depth', 'Batting depth', depthScore, slots.slice(5, 9).map((x) => x.p.name), dp, dc,
    `${real.length} batters rated 55 or above among the first 9 slots. ${depthScore >= 72 ? 'The side can keep attacking late.' : depthScore >= 56 ? 'Depth is acceptable.' : 'Depth is a real risk.'}`);

  // --- bowling
  const pace = bowlers.filter((b) => b.kind === 'pace'), spin = bowlers.filter((b) => b.kind === 'spin');
  const oversOf = (arr) => arr.reduce((a, b) => a + b.overs, 0);
  const wq = (arr, mod) => { const o = oversOf(arr); return o ? arr.reduce((a, b) => a + (b.q + mod) * b.overs, 0) / o : FLOOR; };
  const bowlSection = (key, arr, mod, need, kindWord) => {
    const o = oversOf(arr); let score = wq(arr, mod);
    const pros = [], cons = [];
    for (const b of arr.slice().sort((a, z) => z.q - a.q)) {
      const q = clamp(b.q + mod), s = S(b.p), ov = `${b.overs} ${b.overs === 1 ? 'over' : 'overs'}`;
      if (q >= 72 && s.trump) pros.push(`${b.p.name} (${Math.round(q)}, ${ov}): ${trumpBody(b.p)}`);
      else if (q >= 64) pros.push(`${b.p.name} (${Math.round(q)}, ${ov}): dependable ${kindWord} option.`);
      if (b.p.type !== 'All-rounder' && b.p.type !== 'Batsman' && s.spot && q < 82) cons.push(spotOf(b.p, b.p.name));
      else if (q < 58) cons.push(`${b.p.name} (${Math.round(q)}) is below the standard needed to bowl ${ov}.`);
      if (formWorry(b.p)) cons.push(`${b.p.name}: recent form is a worry. ${dot(short(s.form, 140))}`);
    }
    if (o < need) score -= (need - o) * (key === 'spin' ? 6 : 2.5);
    if (key === 'spin') {
      if (!o) { score = 35; cons.unshift('No spin at all. Twenty overs of pace is risky when the ball grips or the middle overs need controlling.'); }
      else if (o >= 8) pros.push(`${o} spin overs gives real control of the middle overs.`);
      else if (o >= 4) pros.push(`${o} spin overs from ${names(arr.map((b) => b.p.name))}. One quality spinner plus part-time overs is how most IPL sides play, and a second spin option can come in as the impact player.`);
      if (o > 0 && o < 4) cons.push(`Only ${o} spin ${o === 1 ? 'over' : 'overs'} in total, not enough to control the middle phase.`);
      if (c.m.spin >= 4 && o < 8) { score -= (8 - o) * 1.5; cons.push(`${c.name[0].toUpperCase()}${c.name.slice(1)} suits spin, but the XI has only ${o} spin overs; the impact player must cover this.`); }
    } else if (o < need) cons.unshift(`Only ${o} overs of pace; ${need} are needed to cover the new ball and death properly.`);
    else if (o >= 16) cons.push(`${o} overs of pace leaves little spin variety.`);
    const cl = condLine(c, kindWord, `${kindWord} attack`); if (cl) (cl.good ? pros : cons).push(cl.text);
    score = clamp(score);
    return section(key, key === 'spin' ? 'Spin attack' : 'Pace attack', score, arr.map((b) => b.p.name), pros, cons,
      arr.length ? `${names(arr.map((b) => `${b.p.name} (${b.overs})`))}: ${o} overs. ${verdictOf(score)} ${kindWord} attack${c.name ? ` on ${c.name}` : ''}.` : `No ${kindWord} bowlers in the XI.`);
  };
  const paceS = bowlSection('pace', pace, m.pace, 8, 'pace');
  const spinS = bowlSection('spin', spin, m.spin, 4, 'spin');

  // phases
  const al = allocate(bowlers, m);
  const ph = (k) => ({ q: avg(al[k].map((x) => x.q)), who: names([...new Set(al[k].filter((x) => x.b).map((x) => x.b.p.name))]), gap: al[k].filter((x) => !x.b).length });
  const P = { pp: ph('pp'), mid: ph('mid'), death: ph('death') };
  const phScore = P.pp.q * 0.38 + P.mid.q * 0.32 + P.death.q * 0.30;
  const pPros = [], pCons = [];
  for (const [k, label, ov] of [['pp', 'Powerplay (overs 1-6)', 6], ['mid', 'Middle overs (7-15)', 9], ['death', 'Death overs (16-20)', 5]]) {
    const x = P[k];
    if (x.gap) pCons.push(`${label}: ${x.gap} of ${ov} overs have nobody suitable to bowl them.`);
    if (x.q >= 70) pPros.push(`${label}: ${x.who} (${Math.round(x.q)}). Real wicket-taking potential.`);
    else if (x.q < 58) pCons.push(`${label}: ${x.who || 'nobody'} (${Math.round(x.q)}). This phase will leak runs.`);
    else pPros.push(`${label}: ${x.who} (${Math.round(x.q)}). Serviceable.`);
  }
  const phases = section('phases', 'Bowling by phase', phScore, [], pPros, pCons,
    `Powerplay ${Math.round(P.pp.q)}, middle ${Math.round(P.mid.q)}, death ${Math.round(P.death.q)}. Rated by who bowls each over, with a 4-over cap per bowler and at most 2 in the powerplay and at death.`);

  // --- balance
  const keeper = xi.find((p) => p.wicketkeeper);
  const allr = xi.filter((p) => p.type === 'All-rounder'), opts = bowlers.filter((b) => b.overs >= 2).length;
  const bats = slots.slice(0, 7).filter((x) => x.v >= 55).length;
  let bal = 50; const bPros = [], bCons = [];
  if (keeper) { bal += 8; bPros.push(`${keeper.name} keeps wicket.`); } else { bal -= 14; bCons.push('No wicketkeeper in the XI.'); }
  if (opts >= 5) { bal += 14; bPros.push(`${opts} bowlers can bowl 2 or more overs, so the 20 overs are covered without hiding anyone.`); }
  else { bal -= (5 - opts) * 8; bCons.push(`Only ${opts} bowlers can bowl 2 or more overs. One bad day and there is nobody to turn to.`); }
  if (allr.length >= 2 && allr.length <= 4) { bal += 12; bPros.push(`${allr.length} all-rounders (${names(allr.map((p) => p.name))}) give the captain flexibility.`); }
  else if (allr.length === 0) { bal -= 6; bCons.push('No all-rounder in the XI, so the balance between bat and ball is rigid.'); }
  else if (allr.length > 4) bCons.push(`${allr.length} all-rounders can dilute quality in both departments.`);
  if (bats >= 5) { bal += 6; bPros.push(`${bats} proper batters in the first 7.`); } else { bal -= (5 - bats) * 5; bCons.push(`Only ${bats} proper batters in the first 7.`); }
  const os = xi.filter((p) => p.overseas).length;
  if (os === 4) bPros.push('All 4 overseas places are used.'); else bCons.push(`${os} overseas ${os === 1 ? 'player' : 'players'} in the XI; ${4 - os} overseas ${4 - os === 1 ? 'place is' : 'places are'} unused.`);
  const balS = section('balance', 'Team balance', clamp(bal), [], bPros, bCons,
    `${keeper ? 'Keeper in place' : 'No keeper'}, ${opts} bowling options of 2+ overs, ${allr.length} all-rounder${allr.length === 1 ? '' : 's'}. ${verdictOf(clamp(bal))} balance.`);

  const cats = [open, mid, fin, depth, paceS, spinS, phases, balS];
  const total = cats.reduce((a, x) => a + x.score * x.w, 0) / cats.reduce((a, x) => a + x.w, 0);
  const score = r1(total);
  const tier = score >= CUTS.S ? 'S' : score >= CUTS.A ? 'A' : score >= CUTS.B ? 'B' : 'C';

  // --- impact player (not part of the XI score)
  let impact = null;
  if (full) {
    if (!imp) impact = { score: 0, verdict: 'None chosen', name: null, summary: 'No impact player was chosen, so the team has no way to change the game mid-match.', pros: [], cons: ['A free substitution is wasted.'] };
    else {
      const bpI = bowlProfile(imp), kindI = bpI ? bpI.kind : null;
      const batBest = Math.max(...['opening', 'middle_order', 'finishing'].map((k) => (R(imp)[k] != null ? sh(imp, R(imp)[k]) + m[k] : 0)), batBase(imp));
      const bowlBest = bpI ? clamp(bpI.q + (kindI === 'spin' ? m.spin : m.pace)) : 0;
      const base = Math.max(batBest, bowlBest), role = batBest >= bowlBest ? 'batting' : kindI + ' bowling';
      const weakest = [['pace', paceS.score], ['spin', spinS.score], ['bat', avg([fin.score, depth.score])]].sort((a, b) => a[1] - b[1])[0][0];
      const pros = [], cons = [];
      let fit = 0;
      if (bowlBest >= 60 && weakest === kindI) { fit += 9; pros.push(`Fills the weakest part of the XI: the ${kindI} attack.`); }
      if (batBest >= 62 && weakest === 'bat') { fit += 9; pros.push('Fills the weakest part of the XI: late hitting and depth.'); }
      if (kindI === 'spin' && c.m.spin >= 4) { fit += 6; pros.push(`Brings extra spin on ${c.name}, exactly the swap a captain makes.`); }
      if (kindI === 'pace' && c.m.pace >= 3) { fit += 5; pros.push(`Brings extra pace on ${c.name}.`); }
      if (/dry, hard|flat|dew/.test(c.name || '') && batBest >= 68) { fit += 3; pros.push(`A hitter is useful on ${c.name}.`); }
      if (kindI === 'spin' && c.m.spin <= -3) { fit -= 4; cons.push(`${c.name[0].toUpperCase()}${c.name.slice(1)} does not help spin, so a spinner is a less useful impact choice.`); }
      const s = S(imp);
      if (base >= 70 && s.trump) pros.push(trumpOf(imp, imp.name));
      if (s.spot) cons.push(spotOf(imp, imp.name));
      if (formWorry(imp)) cons.push(`${imp.name}: recent form is a worry. ${dot(short(s.form, 140))}`);
      if (!pros.length) pros.push(`${imp.name} is a ${role} option (${Math.round(base)}), but he does not fix a specific gap.`);
      const sc = clamp(base + fit);
      impact = { score: r1(sc), verdict: verdictOf(sc), name: imp.name, id: imp.id,
        summary: `${imp.name} (${Math.round(base)} as a ${role} option). ${verdictOf(sc)} impact choice${c.name ? ` for ${c.name}` : ''}.`, pros, cons: cons.length ? cons : ['No obvious weakness.'] };
    }
  }

  // --- bench (not part of the XI score)
  let benchS = null;
  if (full) {
    const best = (fn) => { const v = bench.map(fn).filter((x) => x != null); return v.length ? Math.max(...v) : null; };
    const covers = [
      ['an opener', best((p) => (R(p).opening != null ? sh(p, R(p).opening) : null))],
      ['a middle-order batter', best((p) => (R(p).middle_order != null ? sh(p, R(p).middle_order) : null))],
      ['a finisher', best((p) => (R(p).finishing != null ? sh(p, R(p).finishing) : null))],
      ['a pace bowler', best((p) => { const b = bowlProfile(p); return b && b.kind === 'pace' ? b.q : null; })],
      ['a spinner', best((p) => { const b = bowlProfile(p); return b && b.kind === 'spin' ? b.q : null; })],
    ];
    const bPros = [], bCons = [];
    for (const [w, v] of covers) { if (v == null) bCons.push(`No cover for ${w}.`); else if (v >= 68) bPros.push(`Good cover for ${w} (${Math.round(v)}).`); else if (v < 55) bCons.push(`Cover for ${w} is weak (${Math.round(v)}).`); }
    if (bench.find((p) => p.wicketkeeper)) bPros.push(`${bench.find((p) => p.wicketkeeper).name} is a backup keeper.`); else bCons.push('No backup wicketkeeper. An injury to the keeper would be a problem.');
    const sc = clamp(avg(covers.map(([, v]) => (v == null ? FLOOR : v))) - (bench.length < 3 ? 6 : 0));
    const top = bench.slice().sort((a, b) => bestRating(b) - bestRating(a)).slice(0, 3).map((p) => p.name);
    benchS = { score: r1(sc), verdict: verdictOf(sc), players: top, size: bench.length,
      summary: `${bench.length} players on the bench${top.length ? `, led by ${names(top)}` : ''}. ${verdictOf(sc)} depth if injuries or a form slump hit.`,
      pros: bPros.length ? bPros : ['No standout depth.'], cons: bCons.length ? bCons : ['No obvious gap.'] };
  }

  // --- overall summary and match-winner (judged at the slot he plays)
  const sorted = [...cats].sort((a, b) => b.score - a.score);
  const cand = xi.map((p, i) => { const b = bp(p), bv = b ? clamp(b.q + (b.kind === 'spin' ? m.spin : m.pace)) : 0; return { p, v: Math.max(slots[i].v, bv), as: slots[i].v >= bv ? `batting at No. ${i + 1}` : `${b.kind} bowling` }; }).sort((a, b) => b.v - a.v)[0];
  const star = cand ? { id: cand.p.id, as: cand.as, trump: S(cand.p).trump || '', spot: S(cand.p).spot || '' } : null;
  const summary = `${{ S: 'An elite', A: 'A strong', B: 'An average', C: 'A weak' }[tier]} side on paper${c.name ? ` for ${c.name}` : ''}. Best: ${sorted[0].label.toLowerCase()} (${sorted[0].score}). Weakest: ${sorted[sorted.length - 1].label.toLowerCase()} (${sorted[sorted.length - 1].score}).${full ? '' : ' The playing XI was not set, so the squad was judged as it stands.'}`;
  return { team: t.id, score, tier, cats, impact, bench: benchS, star, summary, conditions: c.name, full, pool: xi.map((p) => p.id) };
}

function rankTeams(teams, conditions) {
  const c = condOf(conditions);
  const grades = teams.map((t) => gradeTeam(t, c)).sort((a, b) => b.score - a.score);
  const low = (g) => { let l = 0; for (const id of g.pool) if (STATS[id] && STATS[id].conf === 'low') l++; return g.pool.length ? l / g.pool.length : 0; };
  return grades.map((g, i) => ({ ...g, rank: i + 1, thin_data: low(g) > 0.4 }));
}
const profile = (id) => STATS[id] || null;
module.exports = { rankTeams, gradeTeam, profile, condOf, CUTS, WEIGHTS, available: () => Object.keys(STATS).length > 0 };
