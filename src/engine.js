'use strict';
/* IPL-style auction engine. Pure JS, no networking.
 * Money is in lakhs (100 lakh = 1 crore). Time is passed in (`now`, seconds) so timers are testable. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rating = require('./rating');

const POOLS = ['Batsman', 'Bowler', 'All-rounder', 'Spinner'];
const SQUAD_SIZES = [12, 15, 25];
const BIG_JUMP = 500, BIG_LOCK = 3;   // lakh above the current price, and seconds of lock after such a bid
const RESULT_GAP = 3.8;
const EPIC_GAP = 6.6;                       // a few players get a longer, special sold animation
const EPIC = new Set(['Virat Kohli']);
const FRANCHISES = {
  CSK:  { name: 'Chennai Super Kings',         c1: '#F9CD05', c2: '#0A4DA2' },
  MI:   { name: 'Mumbai Indians',              c1: '#005DA0', c2: '#D1AB3E' },
  RCB:  { name: 'Royal Challengers Bengaluru', c1: '#D1222B', c2: '#C9A24A' },
  KKR:  { name: 'Kolkata Knight Riders',       c1: '#3A225D', c2: '#C9A227' },
  DC:   { name: 'Delhi Capitals',              c1: '#1F4DA3', c2: '#EF1B23' },
  SRH:  { name: 'Sunrisers Hyderabad',         c1: '#F26522', c2: '#1B1B1B' },
  RR:   { name: 'Rajasthan Royals',            c1: '#EA1A85', c2: '#254AA5' },
  PBKS: { name: 'Punjab Kings',                c1: '#D71920', c2: '#A7A9AC' },
  LSG:  { name: 'Lucknow Super Giants',        c1: '#A72056', c2: '#FFCC00' },
  GT:   { name: 'Gujarat Titans',              c1: '#1C2C5B', c2: '#C0A062' },
};

const PLAYERS = new Map();
for (const p of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'players.json'), 'utf8'))) PLAYERS.set(p.id, p);

const PHOTO_DIR = path.join(__dirname, '..', 'public', 'photos');
const slug = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let photoCache = { t: 0, map: new Map() };
function photoOf(p) {
  if (p.photo) return p.photo;
  const now = Date.now();
  if (now - photoCache.t > 10000) {
    photoCache = { t: now, map: new Map() };
    try { for (const f of fs.readdirSync(PHOTO_DIR)) { const m = /^(.*)\.(jpe?g|png|webp)$/i.exec(f); if (m) photoCache.map.set(m[1].toLowerCase(), f); } } catch (e) { /* no photos folder */ }
  }
  const f = photoCache.map.get(slug(p.name));
  return f ? '/photos/' + encodeURIComponent(f) : null;
}

class GameError extends Error {}
const fail = (m) => { throw new GameError(m); };
const hex = (n) => crypto.randomBytes(n).toString('hex');
const roomCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[crypto.randomInt(a.length)]; return s; };
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const P = (id) => PLAYERS.get(id);

class Team {
  constructor(pid, name, teamName, purse, color) {
    Object.assign(this, { pid, name, teamName, token: hex(12), purse, color, selection: new Set(),
      squad: new Map(), wishlist: new Set(), xi: [], impact: null, captain: null, keeper: null, saved: false, connected: true });
  }
  overseasCount(ids) { let n = 0; for (const i of (ids ?? this.squad.keys())) if (P(i).overseas) n++; return n; }
  hasKeeper() { for (const i of this.squad.keys()) if (P(i).wicketkeeper) return true; return false; }
}

class Room {
  constructor(hostName, teamName, settings = {}, color) {
    const s = { purse: 12000, base_price: 100, bid_timer: 15, increments: [100, 250, 500], squad_size: 15, max_overseas: 8,
      selection_window: 120, pool_order: [...POOLS], mix: false, ground: '', state: '', conditions: '', ...settings };
    Room.validateSettings(s);
    this.settings = s;
    this.code = roomCode();
    this.phase = 'lobby'; // lobby -> selection -> auction -> finished
    this.teams = new Map();
    this.hostId = '';
    this.selectionDeadline = 0;
    this.pool = []; this.queue = []; this.unsold = []; this.soldLog = [];
    this.bigSeq = 0; this.bigBid = null; this.lockUntil = 0;
    this.current = null; this.bid = 0; this.holder = null; this.notInterested = new Set();
    this.deadline = 0; this.paused = false; this.remainingOnPause = 0;
    this.step = 'idle'; // idle | bidding | result | pools_done
    this.result = null; this.nextAt = 0;
    this.trades = new Map(); this.tradeSeq = 0;
    this.hostId = this.addTeam(hostName, teamName, color).pid;
  }

  static validateSettings(s) {
    if (!SQUAD_SIZES.includes(s.squad_size)) fail(`Squad size must be one of ${SQUAD_SIZES.join(', ')}`);
    if ([...s.pool_order].sort().join() !== [...POOLS].sort().join()) fail('pool_order must contain each pool exactly once');
    if (!(s.purse > 0) || !(s.base_price > 0) || !(s.bid_timer > 0)) fail('purse, base price and timer must be positive');
    if (!Array.isArray(s.increments) || !s.increments.length || s.increments.some((i) => !(i > 0))) fail('increments must be positive numbers');
    if (!(s.max_overseas >= 0)) fail('max_overseas cannot be negative');
  }
  hostOnly(pid) { if (pid !== this.hostId) fail('Only the host can do that'); }

  updateSettings(pid, patch) {
    this.hostOnly(pid);
    if (this.phase !== 'lobby') fail('Settings can only change in the lobby');
    const merged = { ...this.settings, ...patch };
    Room.validateSettings(merged);
    this.settings = merged;
    for (const t of this.teams.values()) t.purse = merged.purse;
  }

  addTeam(name, teamName, color) {
    if (this.phase !== 'lobby') fail('Auction already started - joining is closed');
    name = String(name ?? '').trim(); teamName = String(teamName ?? '').trim();
    if (!name || !teamName) fail('Your name and a team name are required');
    if (name.length > 30 || teamName.length > 30) fail('Names are limited to 30 characters');
    if (this.teams.size >= 10) fail('Room is full (10 teams)');
    for (const t of this.teams.values()) if (t.teamName.toLowerCase() === teamName.toLowerCase()) fail('That team name is already taken');
    const f = FRANCHISES[teamName.toUpperCase()];
    const col = f ? f.c1 : (/^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#7c8cff');
    const t = new Team(hex(4), name, f ? teamName.toUpperCase() : teamName, this.settings.purse, col);
    t.franchise = f ? teamName.toUpperCase() : null;
    t.color2 = f ? f.c2 : '#ffffff';
    this.teams.set(t.pid, t);
    return t;
  }
  rejoin(token) {
    for (const t of this.teams.values()) if (t.token === token) { if (t.removed) fail('The host removed your team from this auction'); t.connected = true; return t; }
    fail('Could not restore your team');
  }

  // host removes a team that went offline or is disturbing the game; its squad stays on record but it no longer takes part
  removeTeam(pid, targetPid, now) {
    this.hostOnly(pid);
    const t = this.teams.get(targetPid);
    if (!t) fail('Team not found');
    if (targetPid === this.hostId) fail('The host cannot be removed');
    if (t.removed) fail('That team is already removed');
    t.removed = true; t.connected = false;
    if (this.phase === 'selection' && !this.pool.length) { t.selection.clear(); t.wishlist.clear(); }
    for (const tr of this.trades.values()) if (tr.status === 'pending' && (tr.frm === targetPid || tr.to === targetPid)) tr.status = 'cancelled';
    this.notInterested.delete(targetPid);
    if (this.phase === 'auction' && this.step === 'bidding' && this.holder === targetPid) {   // its top bid is void: the player restarts from base price
      this.holder = null; this.bid = 0; this.deadline = now + this.settings.bid_timer;
      if (this.paused) this.remainingOnPause = this.settings.bid_timer;
    }
  }

  // ---- selection ----
  startSelection(pid, now) {
    this.hostOnly(pid);
    if (this.phase !== 'lobby') fail('Selection already started');
    this.phase = 'selection';
    this.selectionDeadline = now + this.settings.selection_window;
  }
  /** ids = players the team wants in the auction; wish = private wishlist (always a subset of ids). */
  selectPlayers(pid, ids, wish = []) {
    if (this.phase !== 'selection') fail('Player selection is not open');
    if (this.pool.length) fail('Selection is closed - the host will start the auction');
    if (ids.some((i) => !PLAYERS.has(i))) fail('Unknown player id');
    const t = this.teams.get(pid);
    t.selection = new Set(ids);
    t.wishlist = new Set(wish.filter((i) => t.selection.has(i)));
  }
  // host steps back from player selection to the waiting room (picks are cleared, teams and settings stay)
  backToLobby(pid) {
    this.hostOnly(pid);
    if (this.phase !== 'selection') fail('You can only go back before the auction starts');
    this.phase = 'lobby'; this.pool = []; this.queue = []; this.selectionDeadline = 0;
    for (const t of this.teams.values()) { t.selection.clear(); t.wishlist.clear(); }
  }
  closeSelection(pid) {
    if (pid != null) this.hostOnly(pid);
    if (this.phase !== 'selection') fail('Selection is not open');
    if (this.pool.length) fail('Selection is already closed');
    const chosen = new Set();
    for (const t of this.teams.values()) for (const i of t.selection) chosen.add(i);
    if (!chosen.size) fail('Nobody selected any player - nothing to auction');
    this.pool = [...chosen].sort((a, b) => a - b);
    this.buildQueue(this.pool);
  }
  buildQueue(ids) {
    const q = [];
    if (this.settings.mix) { this.queue = shuffle([...ids]); return; }
    for (const pool of this.settings.pool_order) q.push(...shuffle(ids.filter((i) => P(i).type === pool)));
    this.queue = q;
  }

  // ---- auction flow ----
  startAuction(pid, now) {
    this.hostOnly(pid);
    if (this.phase !== 'selection') fail('Close selection first');
    if (!this.queue.length) this.closeSelection(pid);
    this.phase = 'auction';
    this.nextPlayer(now);
  }
  canBidEver(t, player) {
    return t.squad.size < this.settings.squad_size
      && !(player.overseas && t.overseasCount() >= this.settings.max_overseas)
      && t.purse >= this.settings.base_price;
  }
  eligible(player) { return [...this.teams.values()].filter((t) => !t.removed && this.canBidEver(t, player)).map((t) => t.pid); }
  allFull() { return [...this.teams.values()].filter((t) => !t.removed).every((t) => t.squad.size >= this.settings.squad_size); }
  finish() { this.phase = 'finished'; this.step = 'idle'; this.current = null; }
  nextPlayer(now) {
    if (this.allFull()) return this.finish();
    if (this.queue.length) {
      this.current = this.queue.shift();
      this.bid = 0; this.holder = null; this.notInterested = new Set(); this.bigBid = null; this.lockUntil = 0;
      this.step = 'bidding'; this.result = null; this.paused = false;
      this.deadline = now + this.settings.bid_timer;
      if (!this.eligible(P(this.current)).length) this.resolve(now);
      return;
    }
    this.current = null;
    this.step = 'pools_done';
  }
  checkBidder(t, player, amount) {
    if (t.squad.size >= this.settings.squad_size) fail('Your squad is full');
    if (player.overseas && t.overseasCount() >= this.settings.max_overseas) fail('Overseas limit reached');
    if (amount > t.purse) fail('Not enough purse for this bid');
  }
  /** increment = one of the preset steps; amount = a custom total in lakh. A custom jump above BIG_JUMP triggers the big-bid alert and a short lock. */
  placeBid(pid, now, increment = null, amount = null) {
    if (this.phase !== 'auction' || this.step !== 'bidding') fail('No player is up for bidding');
    if (this.paused) fail('Auction is paused');
    if (now >= this.deadline) fail('Time is up for this player');
    if (now < this.lockUntil) fail('The price just jumped. Bidding reopens in a moment');
    const t = this.teams.get(pid), player = P(this.current);
    if (t.removed) fail('You were removed from this auction');
    if (this.holder === pid) fail('You already hold the highest bid');
    const prev = this.holder === null ? this.settings.base_price : this.bid, minStep = Math.min(...this.settings.increments);
    let bidAmt;
    if (amount != null) {
      bidAmt = Math.round(Number(amount));
      if (!Number.isFinite(bidAmt)) fail('Enter a valid amount');
      if (this.holder === null ? bidAmt < prev : bidAmt < prev + minStep) fail(`Your bid must be at least ${this.holder === null ? prev : prev + minStep} lakh`);
    } else if (this.holder === null) bidAmt = prev;
    else {
      if (!this.settings.increments.includes(increment)) fail('Invalid bid increment');
      bidAmt = prev + increment;
    }
    this.checkBidder(t, player, bidAmt);
    this.bid = bidAmt; this.holder = pid;
    this.notInterested.delete(pid);
    this.deadline = now + this.settings.bid_timer;
    if (bidAmt - prev > BIG_JUMP) { this.bigBid = { id: ++this.bigSeq, team: pid, from: prev, to: bidAmt }; this.lockUntil = now + BIG_LOCK; }
  }
  notInterestedIn(pid) {
    if (this.phase !== 'auction' || this.step !== 'bidding') fail('No player is up for bidding');
    if (this.holder === pid) fail('You hold the highest bid');
    this.notInterested.add(pid);
  }
  pause(pid, now) {
    this.hostOnly(pid);
    if (this.phase !== 'auction' || this.step !== 'bidding' || this.paused) fail('Nothing to pause');
    this.paused = true; this.remainingOnPause = Math.max(0, this.deadline - now);
  }
  resume(pid, now) {
    this.hostOnly(pid);
    if (!this.paused) fail('Auction is not paused');
    this.paused = false; this.deadline = now + this.remainingOnPause;
  }
  resolve(now) {
    if (this.holder) {
      const t = this.teams.get(this.holder);
      t.purse -= this.bid; t.squad.set(this.current, this.bid);
      this.result = { player: this.current, status: 'SOLD', team: t.teamName, team_id: t.pid, price: this.bid };
      this.soldLog.push(this.result);
    } else {
      this.unsold.push(this.current);
      this.result = { player: this.current, status: 'UNSOLD' };
    }
    this.step = 'result'; this.nextAt = now + (this.result.status === 'SOLD' && EPIC.has(this.result.player.name) ? EPIC_GAP : RESULT_GAP);
  }
  /** Advance time-based events. Returns true if state changed. */
  tick(now) {
    if (this.phase === 'selection' && !this.pool.length && now >= this.selectionDeadline) {
      if ([...this.teams.values()].some((t) => t.selection.size)) { this.closeSelection(); return true; }
      this.selectionDeadline = now + 30; return true;
    }
    if (this.phase !== 'auction' || this.paused) return false;
    if (this.step === 'bidding') {
      if (this.holder === null) {
        const voters = this.eligible(P(this.current));
        if (!voters.length || voters.every((p) => this.notInterested.has(p))) { this.resolve(now); return true; }
      }
      if (this.holder !== null && now >= this.lockUntil) {   // everyone else has passed or cannot bid: the holder wins now
        const minStep = Math.min(...this.settings.increments), pl = P(this.current);
        const rivals = [...this.teams.values()].filter((t) => t.pid !== this.holder && !t.removed && !this.notInterested.has(t.pid) && this.canBidEver(t, pl) && t.purse >= this.bid + minStep);
        if (!rivals.length) { this.resolve(now); return true; }
      }
      if (now >= this.deadline) { this.resolve(now); return true; }
    } else if (this.step === 'result' && now >= this.nextAt) { this.nextPlayer(now); return true; }
    return false;
  }
  startReauction(pid, now) {
    this.hostOnly(pid);
    if (this.phase !== 'auction' || this.step !== 'pools_done') fail('Re-auction is only available after all pools are done');
    if (!this.unsold.length) fail('There are no unsold players');
    this.buildQueue(this.unsold); this.unsold = [];
    this.nextPlayer(now);
  }
  /** Host can end the auction at any point. A player still being bid on is returned unsold (no deal). */
  endAuction(pid) {
    this.hostOnly(pid);
    if (this.phase !== 'auction') fail('There is no auction to end');
    if (this.step === 'bidding' && this.current != null) { this.unsold.push(this.current); this.paused = false; }
    this.finish();
  }

  /** Host brings one pool forward. The player on stage is not interrupted; the next players come from this pool. */
  chooseNextPool(pid, pool) {
    this.hostOnly(pid);
    if (this.phase !== 'auction') fail('The auction is not running');
    if (pool === 'Mix') {                         // jumble everything still to come into one surprise order
      if (!this.queue.length) fail('No players are left in this round');
      this.queue = shuffle([...this.queue]); this.mixed = true; return;
    }
    if (!POOLS.includes(pool)) fail('Unknown pool');
    this.mixed = false;
    const inPool = this.queue.filter((i) => P(i).type === pool);
    if (!inPool.length) fail(`No ${pool} players are left in this round`);
    this.queue = [...inPool, ...this.queue.filter((i) => P(i).type !== pool)];
  }

  // ---- playing XI ----
  setXI(pid, xi, impact = null, captain = null, keeper = null) {
    if (!['auction', 'finished'].includes(this.phase)) fail('The auction has not started yet');
    const t = this.teams.get(pid);
    if (xi.length !== 11 || new Set(xi).size !== 11) fail('Playing XI needs exactly 11 different players');
    if (xi.some((i) => !t.squad.has(i))) fail('All XI players must be in your squad');
    if (t.overseasCount(xi) > 4) fail('Max 4 overseas players in the playing XI');
    if (impact != null) {
      if (!t.squad.has(impact) || xi.includes(impact)) fail('Impact player must be in your squad and outside the XI');
      if (P(impact).overseas && t.overseasCount(xi) >= 4) fail('Overseas impact player is allowed only if the XI has 3 or fewer overseas players');
    }
    if (captain == null || !xi.includes(captain)) fail('Pick a captain from the XI');
    const keepers = [...t.squad.keys()].filter((i) => P(i).wicketkeeper);
    if (keeper == null && keepers.length === 1 && xi.includes(keepers[0])) keeper = keepers[0];
    if (keeper != null) {
      if (!xi.includes(keeper)) fail('Wicketkeeper must be in the XI');
      if (keepers.length && !P(keeper).wicketkeeper) fail("Choose one of your squad's wicketkeepers");
    } else if (keepers.length) fail('Pick a wicketkeeper from the XI');
    Object.assign(t, { xi: [...xi], impact, captain, keeper, saved: true });
  }
  // lock the team as final; squads with fewer than 11 players can't set an XI, so they are saved as they are
  saveTeam(pid) {
    if (!['auction', 'finished'].includes(this.phase)) fail('The auction has not started yet');
    const t = this.teams.get(pid);
    if (t.squad.size >= 11 && t.xi.length !== 11) fail('Set your playing XI first');
    t.saved = true;
  }

  // ---- trading ----
  proposeTrade(pid, toPid, give, get, cash = 0) {
    if (!['auction', 'finished'].includes(this.phase)) fail('Trading opens once the auction starts');
    if (!this.teams.has(toPid) || toPid === pid) fail('Pick another team to trade with');
    if (this.teams.get(toPid).removed || this.teams.get(pid).removed) fail('A removed team cannot trade');
    if (!give.length && !get.length && !cash) fail('Empty trade');
    const tr = { id: ++this.tradeSeq, frm: pid, to: toPid, give: [...give], get: [...get], cash: Math.trunc(cash), status: 'pending' };
    this.checkTrade(tr);
    this.trades.set(tr.id, tr);
    return tr;
  }
  // the other team answers with its own terms: the original offer is closed and a new one goes back
  counterTrade(pid, id, give, get, cash = 0) {
    const old = this.trades.get(id);
    if (!old || old.status !== 'pending') fail('Trade is no longer pending');
    if (pid !== old.to) fail('Only the other team can counter this trade');
    if (!give.length && !get.length && !cash) fail('Empty trade');
    const tr = { id: this.tradeSeq + 1, frm: pid, to: old.frm, give: [...give], get: [...get], cash: Math.trunc(cash), status: 'pending' };
    this.checkTrade(tr);
    old.status = 'countered'; this.tradeSeq++; this.trades.set(tr.id, tr);
    return tr;
  }
  checkTrade(tr) {
    const a = this.teams.get(tr.frm), b = this.teams.get(tr.to);
    if (tr.give.some((i) => !a.squad.has(i))) fail(`${a.teamName} does not own all offered players`);
    if (tr.get.some((i) => !b.squad.has(i))) fail(`${b.teamName} does not own all requested players`);
    const cap = this.settings.max_overseas, size = this.settings.squad_size;
    const aAfter = new Set([...a.squad.keys()].filter((i) => !tr.give.includes(i)).concat(tr.get));
    const bAfter = new Set([...b.squad.keys()].filter((i) => !tr.get.includes(i)).concat(tr.give));
    for (const [team, after] of [[a, aAfter], [b, bAfter]]) {
      if (after.size > size) fail(`${team.teamName} squad would exceed ${size} players`);
      if (team.overseasCount(after) > cap) fail(`${team.teamName} would exceed the overseas limit`);
    }
    if (a.purse - tr.cash < 0) fail(`${a.teamName} has insufficient purse`);
    if (b.purse + tr.cash < 0) fail(`${b.teamName} has insufficient purse`);
  }
  respondTrade(pid, id, accept) {
    const tr = this.trades.get(id);
    if (!tr || tr.status !== 'pending') fail('Trade is no longer pending');
    if (pid !== tr.to) fail('Only the other team can respond to this trade');
    if (!accept) { tr.status = 'rejected'; return tr; }
    this.checkTrade(tr);
    const a = this.teams.get(tr.frm), b = this.teams.get(tr.to);
    for (const i of tr.give) { b.squad.set(i, a.squad.get(i)); a.squad.delete(i); }
    for (const i of tr.get) { a.squad.set(i, b.squad.get(i)); b.squad.delete(i); }
    a.purse -= tr.cash; b.purse += tr.cash;
    a.saved = b.saved = false;
    for (const t of [a, b]) {
      t.xi = t.xi.filter((i) => t.squad.has(i));                  // traded-away players leave the XI; everyone else keeps their slot
      if (t.impact != null && !t.squad.has(t.impact)) t.impact = null;
      if (t.captain != null && !t.squad.has(t.captain)) t.captain = null;
      if (t.keeper != null && !t.squad.has(t.keeper)) t.keeper = null;
    }
    tr.status = 'accepted';
    for (const o of this.trades.values()) if (o !== tr && o.status === 'pending') { try { this.checkTrade(o); } catch (e) { if (e instanceof GameError) o.status = 'cancelled'; else throw e; } }
    return tr;
  }
  cancelTrade(pid, id) {
    const tr = this.trades.get(id);
    if (!tr || tr.status !== 'pending' || tr.frm !== pid) fail('Cannot cancel this trade');
    tr.status = 'cancelled';
  }

  // ---- views ----
  view(viewer, now) {
    const pl = (i) => { const p = P(i); return { id: i, name: p.name, type: p.type, overseas: p.overseas, wicketkeeper: p.wicketkeeper, bat: p.bat || '', bowl: p.bowl || '', photo: photoOf(p), team: p.team || '', season: p.season || 0 }; };
    const teams = [...this.teams.values()].map((t) => ({
      id: t.pid, name: t.name, team_name: t.teamName, franchise: t.franchise, color: t.color, color2: t.color2,
      purse: t.purse, connected: t.connected, is_host: t.pid === this.hostId,
      squad: [...t.squad].map(([i, price]) => ({ ...pl(i), price })),
      overseas: t.overseasCount(), no_keeper_flag: t.squad.size > 0 && !t.hasKeeper(),
      xi: t.xi, impact: t.impact, captain: t.captain, keeper: t.keeper, saved: t.saved, removed: !!t.removed, selected_count: t.selection.size,
    }));
    let cur = null;
    if (this.current != null) {
      const remaining = this.paused ? this.remainingOnPause : Math.max(0, this.deadline - now);
      cur = { ...pl(this.current), bid: this.bid, holder: this.holder ? this.teams.get(this.holder).teamName : null,
        big_bid: this.bigBid ? { ...this.bigBid, team_name: this.teams.get(this.bigBid.team).teamName, lock_remaining: Math.max(0, Math.round((this.lockUntil - now) * 10) / 10) } : null,
        holder_id: this.holder, remaining: Math.round(remaining * 10) / 10, not_interested: [...this.notInterested].sort(),
        wished: !!(this.teams.get(viewer) && this.teams.get(viewer).wishlist.has(this.current)) };
    }
    const me = this.teams.get(viewer);
    const wishStatus = (i) => {
      if (this.phase === 'lobby' || this.phase === 'selection') return { status: 'pending' };
      if (i === this.current) return { status: 'live' };
      const sale = [...this.soldLog].reverse().find((x) => x.player === i);
      if (sale) return { status: 'sold', team: sale.team, team_id: sale.team_id, price: sale.price };
      return { status: this.queue.includes(i) ? 'upcoming' : 'unsold' };
    };
    const tv = (t) => ({ id: t.id, from: t.frm, to: t.to, from_team: this.teams.get(t.frm).teamName, to_team: this.teams.get(t.to).teamName,
      give: t.give.map((i) => ({ id: i, name: P(i).name })), get: t.get.map((i) => ({ id: i, name: P(i).name })), cash: t.cash, status: t.status });
    const live = teams.filter((t) => !t.removed);
    const allSaved = this.phase === 'finished' && live.length > 0 && live.every((t) => t.saved);
    let ranking = null;
    if (allSaved && rating.available()) {          // stats-based grades appear only after everyone has saved
      ranking = rating.rankTeams(live, this.settings.conditions).map((g) => ({ ...g, pool: undefined }));
    }
    return {
      ranking,
      code: this.code, phase: this.phase, step: this.step, paused: this.paused, settings: this.settings,
      host_id: this.hostId, me: viewer, teams, current: cur,
      all_saved: allSaved,
      result: this.result ? { ...this.result, player: pl(this.result.player) } : null,
      queue_left: this.queue.length, mixed: !!this.mixed || !!this.settings.mix, next_pool: this.queue.length ? P(this.queue[0]).type : null,
      pools_left: Object.fromEntries(POOLS.map((x) => [x, this.queue.filter((i) => P(i).type === x).length])), unsold: this.unsold.map(pl),
      selection_remaining: this.phase === 'selection' ? Math.max(0, Math.round((this.selectionDeadline - now) * 10) / 10) : 0,
      my_selection: me ? [...me.selection].sort((a, b) => a - b) : [], pool_size: this.pool.length,
      my_wish: me ? [...me.wishlist].sort((a, b) => a - b) : [],
      my_wishlist: me ? [...me.wishlist].sort((a, b) => a - b).map((i) => ({ ...pl(i), ...wishStatus(i) })) : [],
      trades: [...this.trades.values()].filter((t) => t.frm === viewer || t.to === viewer).map(tv),
      players: this.phase === 'selection' ? [...PLAYERS.keys()].map(pl) : [],
      sold_log: this.soldLog.slice(-30).map((s) => ({ ...s, player: pl(s.player) })),
    };
  }
}

module.exports = { Room, GameError, PLAYERS, POOLS, FRANCHISES, RESULT_GAP, SQUAD_SIZES };
