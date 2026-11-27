'use strict';
/* BID&BAT client. Server holds all state; this file renders it and sends actions. */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => (v >= 100 ? '₹' + +(v / 100).toFixed(2) + ' Cr' : '₹' + v + ' L');
const incLabel = (i) => '+' + (i >= 100 ? +(i / 100).toFixed(2) + ' Cr' : i + ' L');
const POOLS = ['Batsman', 'Bowler', 'All-rounder', 'Spinner'];
const NORMAL = 'Normal play (nothing specified)';
const VENUES = {
  'Maharashtra': ['Wankhede Stadium, Mumbai', 'MCA Stadium, Pune'],
  'Tamil Nadu': ['MA Chidambaram Stadium, Chennai'],
  'Karnataka': ['M. Chinnaswamy Stadium, Bengaluru'],
  'West Bengal': ['Eden Gardens, Kolkata'],
  'Delhi': ['Arun Jaitley Stadium, Delhi'],
  'Telangana': ['Rajiv Gandhi International Stadium, Hyderabad'],
  'Rajasthan': ['Sawai Mansingh Stadium, Jaipur'],
  'Punjab': ['PCA Stadium, Mohali', 'Maharaja Yadavindra Singh Stadium, Mullanpur'],
  'Himachal Pradesh': ['HPCA Stadium, Dharamsala'],
  'Uttar Pradesh': ['BRSABV Ekana Stadium, Lucknow'],
  'Gujarat': ['Narendra Modi Stadium, Ahmedabad'],
  'Assam': ['Barsapara Stadium, Guwahati'],
  'Andhra Pradesh': ['ACA-VDCA Stadium, Visakhapatnam'],
  'No specific venue': [NORMAL],
};
const CONDITIONS = [NORMAL, 'Dry, hard pitch (batting-friendly)', 'Dry, turning pitch (spin-friendly)', 'Green top (pace and bounce)', 'Slow and low pitch', 'Flat track, high scoring',
  'Humid, ball swings', 'Heavy dew expected (chasing is easier)', 'Overcast sky', 'Hot day, tired legs', 'Night match under lights'];

const BOWL = { RF: 'Right-arm fast', RFM: 'Right-arm fast-medium', RM: 'Right-arm medium', LF: 'Left-arm fast', LFM: 'Left-arm fast-medium', LM: 'Left-arm medium',
  OB: 'Right-arm off spin', LB: 'Right-arm leg spin', SLA: 'Left-arm orthodox spin', LC: 'Left-arm wrist spin' };
const PACE = ['RF', 'RFM', 'RM', 'LF', 'LFM', 'LM'];
const batLabel = (p) => (p.bat === 'L' ? 'Left-hand batter' : 'Right-hand batter');
const roleLabel = (p) => (p.type === 'Batsman' ? (p.wicketkeeper ? 'Wicketkeeper-batter' : 'Batter') : p.type === 'Bowler' ? (PACE.includes(p.bowl) ? 'Fast bowler' : 'Bowler') : p.type === 'Spinner' ? 'Spin bowler' : 'All-rounder');
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
// a drawn shirt in the team's colours with the player's surname on the back (no logos or photos needed)
function jersey(p, c1, c2, mini) {
  const body = c1 || '#4a5270', trim = c2 || '#cfd6ff', tx = ink(body);
  const sur = p.name.trim().split(/\s+/).slice(-1)[0].toUpperCase(), fs = sur.length > 9 ? 17 : sur.length > 7 ? 20 : 25;
  return `<svg class="jsy" viewBox="0 0 200 200" aria-hidden="true"><path d="M70 28 L40 40 L8 82 L38 104 L52 88 L52 182 L148 182 L148 88 L162 104 L192 82 L160 40 L130 28 Q100 52 70 28Z" fill="${body}" stroke="rgba(0,0,0,.35)" stroke-width="3" stroke-linejoin="round"/>
    <path d="M8 82 L38 104 L52 88 L40 40Z M192 82 L162 104 L148 88 L160 40Z" fill="${trim}" opacity=".95"/>
    <path d="M70 28 Q100 52 130 28 L124 24 Q100 42 76 24Z" fill="${trim}"/>
    <rect x="52" y="168" width="96" height="8" fill="${trim}" opacity=".9"/>
    ${mini ? `<text x="100" y="118" text-anchor="middle" font-family="Big Shoulders Display,Impact,sans-serif" font-weight="900" font-size="44" fill="${tx}">${esc(initials(p.name))}</text>`
      : `<text x="100" y="92" text-anchor="middle" font-family="Big Shoulders Display,Impact,sans-serif" font-weight="900" font-size="${fs}" letter-spacing="1" fill="${tx}">${esc(sur)}</text>
    <text x="100" y="146" text-anchor="middle" font-family="Big Shoulders Display,Impact,sans-serif" font-weight="900" font-size="48" fill="${tx}" opacity=".9">${esc(initials(p.name))}</text>`}</svg>`;
}
const kit = (p) => { const f = FR[p.team]; return f ? [f.c1, f.c2] : [null, null]; };
function portrait(p) {
  return `<div class="pcard" id="pcard"><div class="pfig"><span class="ini jersey">${jersey(p, ...kit(p))}</span>${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" onerror="this.remove()">` : ''}</div>
    <div class="pcap">${esc(roleLabel(p))}</div></div>`;
}
function abilities(p) {
  const bowl = p.bowl ? BOWL[p.bowl] : 'Rarely bowls', icon = p.bowl ? (PACE.includes(p.bowl) ? '⚡' : '🌀') : '–';
  return `<div class="abil"><div class="ab"><span class="ai">🏏</span><div><small>Batting</small><b>${batLabel(p)}</b></div></div>
    <div class="ab"><span class="ai">${icon}</span><div><small>Bowling</small><b>${bowl}</b></div></div></div>`;
}

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const ink = (hex) => (lum(hex) > 0.58 ? '#0c0e13' : '#ffffff');
/** lighten a dark team colour until it reads on the dark background */
const accentOf = (hex) => {
  let n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  for (let t = 0; t <= 1 && lum('#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')) < 0.42; t += 0.08) { r += (255 - r) * 0.08; g += (255 - g) * 0.08; b += (255 - b) * 0.08; }
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
};
const store = { get(k = 'ipl') { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

let FR = {}, ws = null, S = null, me = null, lastRecv = 0;
const draft = {};
let entry = { mode: 'create', fr: 'CSK', color: '#7c8cff' };
const inviteCode = (() => { try { return (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); } catch { return ''; } })();
if (inviteCode) entry.mode = 'join';                  // opened from an invite link: go straight to the join form
const inviteUrl = (code) => `${location.origin}/?room=${code}`;
let selTeam = 'all', selShowAll = false, selDraft = null, wishDraft = null, selTab = 'All', saveTimer = null, selSaved = true;
let feed = [], feedSeq = 0, feedSeen = 0, feedInit = false, fPrev = { cur: null, holder: null, bid: 0, ni: 0, res: '' };
const prevVals = {};
let lastBigId = 0, bigLockUntil = 0, bigT = null;
const locked = () => Date.now() < bigLockUntil;
let lineup = null, xiBase = '', xiSig = '', xiSaving = false, lastMoved = null;
let tdraft = { give: new Set(), get: new Set() }, counterOf = null;
let wasLeft = false, wasRemoved = false, endArm = false, endT = null, rmArm = null, rmT = null;
const rmBtn = (t) => (S && me === S.host_id && t.id !== me && !t.removed ? `<button class="btn sm ${rmArm === t.id ? 'armed' : 'danger'} rm" data-act="rmteam" data-tid="${t.id}" title="Remove this team from the auction (for example if they went offline)">${rmArm === t.id ? 'Click again to remove' : 'Remove'}</button>` : '');
let soundOn = store.get('iplsound') !== false;
let lastFx = '', lastCur = null, lastBid = null, audio = null;
const cache = {};

const T = (id) => S.teams.find((t) => t.id === id);
const abbr = (t) => t.franchise || (t.team_name.trim().split(/\s+/).length > 1 ? t.team_name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3) : t.team_name.slice(0, 3)).toUpperCase();
const logoOf = (k) => (FR[k] && FR[k].logo) || '';
const badge = (t, cls = '') => logoOf(t.franchise) ? `<span class="badge logo ${cls}"><img src="${logoOf(t.franchise)}" alt="${esc(abbr(t))}"></span>` : `<span class="badge ${cls}" style="background:${t.color};color:${ink(t.color)}">${esc(abbr(t))}</span>`;
const tags = (p) => `${p.overseas ? '<span class="tag os">OS</span>' : ''}${p.wicketkeeper ? '<span class="tag wk">WK</span>' : ''}`;

// ---------- networking ----------
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3500); }
const BUILD = '__BUILD__';
let lastFirst = null, retryT = null;
function connect(first) {
  lastFirst = first; clearTimeout(retryT); wasLeft = false;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => send(first);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'error') { toast(m.message); if (first.action === 'rejoin' && !me) { store.set('ipl', null); lastFirst = null; setHTML('entry', entryHTML()); } }
    if (m.type === 'removed') { wasRemoved = true; store.set('ipl', null); toast('The host removed your team from this auction.'); setTimeout(() => location.reload(), 2500); }
    if (m.type === 'joined') { me = m.pid; store.set('ipl', { code: m.code, token: m.token }); }
    if (m.type === 'state' && m.build && BUILD !== '__BUILD__' && m.build !== BUILD) return location.reload();   // this tab has an old copy of the page
    if (m.type === 'state') { S = m.state; if (S.phase === 'lobby') { selDraft = null; wishDraft = null; } lastRecv = Date.now(); render(); }
  };
  ws.onclose = () => {
    if (wasRemoved || wasLeft) return;
    const sv = store.get('ipl');                       // dropped connection: quietly get back into the room
    if (sv && lastFirst) { retryT = setTimeout(() => connect({ action: 'rejoin', code: sv.code, token: sv.token }), 1500); }
    else if (S) toast('Connection lost. Reload the page.');
  };
}
setInterval(() => send({ action: 'ping' }), 25000);

// ---------- flicker-free rendering ----------
function setHTML(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  const el = document.getElementById(id), a = document.activeElement;
  const keep = a && el.contains(a) && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  const sc = [...el.querySelectorAll('.plist,.log')].map((x) => x.scrollTop);
  el.innerHTML = html;
  el.querySelectorAll('input[id],select[id]').forEach((x) => { if (x.id in draft) x.value = draft[x.id]; });
  el.querySelectorAll('.plist,.log').forEach((x, i) => { if (sc[i]) x.scrollTop = sc[i]; });
  if (keep) { const n = document.getElementById(keep.id); if (n) { n.focus(); try { n.setSelectionRange(keep.s, keep.e); } catch {} } }
}
const val = (id, d = '') => (id in draft ? draft[id] : d);
const setAcc = (hex) => { const r = document.documentElement.style, a = accentOf(hex); r.setProperty('--acc', a); r.setProperty('--acc-ink', ink(a)); };

// ---------- entry ----------
function entryHTML() {
  const sv = store.get('ipl'), create = entry.mode === 'create';
  const tile = (k, name, color, label) => `<button class="tile ${entry.fr === k ? 'on' : ''}" style="--c:${accentOf(color)}" data-act="pickfr" data-fr="${k}">${logoOf(k) ? `<span class="badge logo"><img src="${logoOf(k)}" alt="${label}"></span>` : `<span class="badge" style="background:${color};color:${ink(color)}">${label}</span>`}${esc(name)}</button>`;
  const tiles = Object.entries(FR).map(([k, f]) => tile(k, f.name, f.c1, k)).join('') + tile('', 'Custom team', entry.color, '★');
  return `<div class="hero"><h1>Your own IPL auction</h1><p>Create a room, share the code, and bid for real IPL players against your friends. Every bid is live.</p></div>
  <div class="panel"><div class="seg"><span class="${create ? 'on' : ''}" data-act="mode" data-m="create">Create a room</span><span class="${create ? '' : 'on'}" data-act="mode" data-m="join">Join a room</span></div>
    <div class="row">${create ? '' : `<label class="f">Room code<input type="text" id="e_code" maxlength="5" placeholder="e.g. K7QXM" autocomplete="off" value="${esc(val('e_code', inviteCode))}" style="text-transform:uppercase"></label>`}
      <label class="f">Your name<input type="text" id="e_name" maxlength="30" placeholder="e.g. Rahul" autocomplete="off"></label></div>
    <div class="rule"></div><h2 style="font:600 16px var(--body);margin-bottom:12px">Choose your team</h2><div class="tiles">${tiles}</div>
    ${entry.fr === '' ? `<div class="row" style="margin-top:14px"><label class="f">Team name<input type="text" id="e_team" maxlength="30" placeholder="e.g. Dhoni's Army" autocomplete="off"></label>
       <label class="f fit">Colour<input type="color" id="e_color" value="${entry.color}"></label></div>` : ''}
    <div class="row" style="margin-top:20px"><button class="btn pri fit" data-act="${create ? 'create' : 'join'}">${create ? 'Create room' : 'Join room'}</button>
    ${sv ? `<button class="btn fit" data-act="rejoin">Rejoin room ${esc(sv.code)}</button>` : ''}</div></div>`;
}
const entryTeamName = () => (entry.fr === '' ? (document.getElementById('e_team')?.value || '').trim() : entry.fr);

// ---------- render ----------
function render() {
  $('#entry').hidden = true;
  trackFeed();
  const mine = T(me);
  if (mine) setAcc(mine.color);
  const host = S.host_id === me;
  setHTML('topr', `${S.phase === 'auction' ? `<span class="livepill ${S.paused ? 'p' : ''}"><i></i>${S.paused ? 'Paused' : 'Live'}</span>` : ''}<button class="btn sm" data-act="home" title="Back to the home screen">⌂ Home</button><button class="iconbtn" data-act="sound" title="Sound effects" aria-label="Toggle sound">${soundOn ? '🔊' : '🔇'}</button>
    <span class="pill">Room <b>${S.code}</b></span>${mine ? `<span class="pill">${badge(mine, 'sm')}${esc(mine.team_name)}</span>` : ''}
    ${mine && ['auction', 'finished'].includes(S.phase) ? `<button class="btn sm tradebtn" data-act="tgo">🔁 Trades${myInbox() ? `<i class="nb">${myInbox()}</i>` : ''}</button>` : ''}
    ${host && S.phase === 'auction' ? `<button class="btn sm ${endArm ? 'armed' : 'danger'}" data-act="endauc">${endArm ? 'Click again to end' : 'End auction'}</button>` : ''}`);
  setHTML('stage', stageHTML());
  setHTML('teams', teamsHTML());
  setHTML('xi', xiHTML());
  setHTML('trade', tradeHTML());
  feedSeen = feedSeq;
  document.body.classList.toggle('live', S.phase === 'auction' && S.step === 'bidding' && !S.paused);
  tickTimers();
  rollAll();
  motion();
}

function settingsSummary() {
  const s = S.settings, p = (x) => `<span class="pill">${x}</span>`;
  return `<div class="meta" style="gap:8px">${s.ground ? p('🏟️ ' + esc(s.ground)) : ''}${s.state && !s.ground ? p(esc(s.state)) : ''}${s.conditions ? p(esc(s.conditions)) : ''}
    ${p('Purse ' + money(s.purse))}${p('Base ' + money(s.base_price))}${p('Squad of ' + s.squad_size)}${p('Overseas max ' + s.max_overseas)}${p('Timer ' + s.bid_timer + 's')}${p(s.mix ? 'Mixed order (surprise)' : s.pool_order.join(' → '))}</div>`;
}

// who is still in this lot: purse, squad size and status for every team
function teamBar(c, s) {
  const next = c.holder_id ? c.bid + Math.min(...s.increments) : s.base_price;
  const chips = S.teams.filter((t) => !t.removed).map((t) => {
    let st = 'in', label = 'In';
    if (t.id === c.holder_id) { st = 'lead'; label = 'Leading'; }
    else if (c.not_interested.includes(t.id)) { st = 'out'; label = 'Passed'; }
    else if (t.squad.length >= s.squad_size) { st = 'out'; label = 'Squad full'; }
    else if (c.overseas && t.overseas >= s.max_overseas) { st = 'out'; label = 'Overseas limit'; }
    else if (t.purse < next) { st = 'out'; label = 'Low purse'; }
    return `<div class="tb ${st} ${t.id === me ? 'me' : ''}" style="--c:${accentOf(t.color)}">${badge(t, 'sm')}<div class="tbn"><b>${esc(abbr(t))}${t.id === me ? ' (you)' : ''}</b><small>${t.squad.length}/${s.squad_size} players</small></div><div class="tbp"><b>${money(t.purse)}</b><small>${label}</small></div></div>`;
  }).join('');
  return `<div class="tbar">${chips}</div>`;
}
function stageHTML() {
  const host = S.host_id === me;
  if (S.phase === 'lobby') return lobbyHTML(host);
  if (S.phase === 'selection') return selectionHTML(host);
  if (S.phase === 'auction') return auctionHTML(host);
  return `<div class="panel done"><h2>Auction complete</h2><p class="sub" style="margin:10px 0 16px">Final squads are below. You can still set your playing XI and trade.</p>${settingsSummary()}</div>`;
}

function lobbyHTML(host) {
  const s = S.settings;
  const teams = S.teams.map((t) => `<div class="member ${t.connected ? '' : 'off'}">${badge(t)}<div><b>${esc(t.team_name)}</b>${t.is_host ? ' 👑' : ''}<small>${esc(t.name)}${t.removed ? ', removed' : ''}</small></div>${rmBtn(t)}</div>`).join('');
  let form = '';
  if (host) {
    const st = val('s_st', s.state), grounds = VENUES[st] || [];
    const sel = (id, cur, opts, ph, dis) => `<select id="${id}" ${dis ? 'disabled' : ''}><option value="">${ph}</option>${opts.map((o) => `<option ${cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    const po = (i) => `<label class="f">${['First', 'Second', 'Third', 'Fourth'][i]} pool<select id="p${i}">${POOLS.map((p) => `<option ${val('p' + i, s.pool_order[i]) === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>`;
    form = `<div class="panel"><h2>Auction settings</h2>
      <div class="row"><label class="f">Purse per team (₹ Cr)<input type="number" id="s_purse" step="0.5" min="1" value="${val('s_purse', s.purse / 100)}"></label>
        <label class="f">Base price per player (₹ Cr)<input type="number" id="s_base" step="0.05" min="0.05" value="${val('s_base', s.base_price / 100)}"></label>
        <label class="f">Bid timer (seconds)<input type="number" id="s_timer" min="3" value="${val('s_timer', s.bid_timer)}"></label>
        <label class="f">Bid buttons (in ₹ lakh, 100 = 1 Cr, comma separated)<input type="text" id="s_inc" value="${esc(val('s_inc', s.increments.join(', ')))}"></label></div>
      <div class="row" style="margin-top:12px"><label class="f">Squad size<select id="s_sq">${[12, 15, 25].map((n) => `<option ${+val('s_sq', s.squad_size) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f">Max overseas per squad<input type="number" id="s_os" min="0" value="${val('s_os', s.max_overseas)}"></label>
        <label class="f">Player selection time (seconds)<input type="number" id="s_win" min="10" value="${val('s_win', s.selection_window)}"></label></div>
      <div class="row" style="margin-top:12px"><label class="f">Auction order<select id="s_mix"><option value="0" ${!+val('s_mix', s.mix ? 1 : 0) ? 'selected' : ''}>Pool by pool (I choose the order)</option><option value="1" ${+val('s_mix', s.mix ? 1 : 0) ? 'selected' : ''}>Mix (all players jumbled, a surprise)</option></select></label></div>
      <div class="row" style="margin-top:12px;${+val('s_mix', s.mix ? 1 : 0) ? 'opacity:.4;pointer-events:none' : ''}">${po(0)}${po(1)}${po(2)}${po(3)}</div>
      <div class="rule"></div><h2>Match venue</h2>
      <div class="row"><label class="f">State${sel('s_st', st, Object.keys(VENUES), 'Select a state')}</label>
        <label class="f">Ground${sel('s_g', val('s_g', s.ground), grounds, st ? 'Select a ground' : 'Choose a state first', !st)}</label>
        <label class="f">Conditions${sel('s_cond', val('s_cond', s.conditions), CONDITIONS, 'Select conditions')}</label></div>
      <div class="row" style="margin-top:20px"><button class="btn fit" data-act="savesettings">Save settings</button><button class="btn pri fit" data-act="startsel">Save and start player selection</button></div></div>`;
  }
  return `<div class="panel"><h2>Waiting room</h2><div class="sub">Share this code or the invite link with your friends</div><div class="code">${S.code}</div>
    <div class="invite"><input type="text" readonly value="${esc(inviteUrl(S.code))}" onfocus="this.select()"><button class="btn pri fit" data-act="copylink">Copy invite link</button></div>
    <div class="teamlist">${teams}</div><div class="rule"></div>${settingsSummary()}${host ? '' : '<p class="sub" style="margin-top:14px">Waiting for the host to start the player selection.</p>'}</div>${form}`;
}

function selectionHTML(host) {
  if (!selDraft) { selDraft = new Set(S.my_selection); wishDraft = new Set(S.my_wish); }
  const closed = S.pool_size > 0, q = (val('q', '') || '').toLowerCase();
  const inTeam = (p) => selTeam === 'all' || (selTeam === 'other' ? !p.team : p.team === selTeam);
  const teamCodes = Object.keys(FR).filter((k) => S.players.some((p) => p.team === k));
  const teamOpts = `<option value="all" ${selTeam === 'all' ? 'selected' : ''}>All teams (${S.players.length} players)</option>` + teamCodes.map((k) => `<option value="${k}" ${selTeam === k ? 'selected' : ''}>${esc(FR[k].name)} (${S.players.filter((p) => p.team === k).length})</option>`).join('') + `<option value="other" ${selTeam === 'other' ? 'selected' : ''}>Other players, no IPL 2024 or 2025 match (${S.players.filter((p) => !p.team).length})</option>`;
  const teamList = S.players.filter(inTeam), teamPicked = teamList.filter((p) => selDraft.has(p.id)).length;
  const list = S.players.filter((p) => inTeam(p) && (selTab === 'All' || (selTab === 'Wishlist' ? wishDraft.has(p.id) : p.type === selTab)) && p.name.toLowerCase().includes(q));
  const cnt = (t) => (t === 'Wishlist' ? wishDraft.size : S.players.filter((p) => selDraft.has(p.id) && (t === 'All' || p.type === t)).length);
  const tabs = ['All', ...POOLS, 'Wishlist'].map((t) => `<button class="tab ${selTab === t ? 'on' : ''}" data-act="tab" data-t="${t}">${t === 'Wishlist' ? '★ ' : ''}${t} ${cnt(t)}</button>`).join('');
  const shown = selShowAll || list.length <= 80 ? list : list.slice(0, 60);
  const cards = shown.map((p) => `<div class="pc ${selDraft.has(p.id) ? 'on' : ''} ${wishDraft.has(p.id) ? 'wished' : ''}" data-act="pick" data-id="${p.id}"><span class="n">${esc(p.name)}${tags(p)}</span><span class="t">${p.team && selTeam === 'all' ? `<b class="tm">${p.team}</b> ` : ''}${p.season === 2024 ? '<b class="tm old">2024</b> ' : ''}${p.type}, ${p.bat === 'L' ? 'left' : 'right'}-hand bat${p.bowl ? ', ' + BOWL[p.bowl].toLowerCase() : ''}</span><button class="star" data-act="wish" data-id="${p.id}" title="${wishDraft.has(p.id) ? 'Remove from wishlist' : 'Add to wishlist'}" aria-label="Wishlist">${wishDraft.has(p.id) ? '★' : '☆'}</button></div>`).join('') || '<p class="sub">No player matches your search.</p>';
  return `<div class="panel"><h2>Choose the players for the auction${closed ? '' : `<span class="pill" style="margin-left:auto">Time left <b id="selt">${Math.ceil(S.selection_remaining)}</b>s</span>`}</h2>
    <p class="sub" style="margin-bottom:12px">Tick every player you want to see in the auction. Everyone's picks are combined, and a player nobody picks stays out. Tap the star to wishlist a player: you'll get an alert the moment he comes up for bidding. Only you can see your wishlist. ${closed ? `<b style="color:var(--tx)">${S.pool_size} players will go under the hammer.</b>` : `<span id="savedmsg">${selSaved ? 'Your picks are saved.' : 'Saving…'}</span>`}</p>
    ${closed ? '' : `<div class="tabs">${tabs}</div><div class="row selbar"><label class="f">Team squad<select id="selteam">${teamOpts}</select></label><label class="f">Search players<input type="text" id="q" placeholder="Type a name" autocomplete="off" value="${esc(val('q', ''))}"></label>${selTeam !== 'all' ? `<button class="btn fit" data-act="teamall">${teamPicked === teamList.length ? 'Clear this team' : `Select all ${teamList.length}`}</button><span class="sub">${teamPicked} of ${teamList.length} picked</span>` : ''}</div><div class="plist">${cards}</div>${shown.length < list.length ? `<div class="row"><button class="btn fit" data-act="showall">Show all ${list.length} players</button><span class="sub">Showing ${shown.length}. Pick a team above or search to narrow the list.</span></div>` : ''}`}
    <div class="row" style="margin-top:18px">${host ? `<button class="btn fit" data-act="backlobby">← Back to waiting room</button>${closed ? '' : '<button class="btn fit" data-act="closesel">Close selection now</button>'}<button class="btn pri fit" data-act="startauc">Start the auction</button>` : '<span class="sub">The host will start the auction.</span>'}</div></div>`;
}

function bidState() {
  const c = S.current, t = T(me), s = S.settings;
  if (!c || !t) return { ok: false, why: '' };
  if (S.paused) return { ok: false, why: 'Auction is paused.' };
  if (c.holder_id === me) return { ok: false, why: 'You have the highest bid.' };
  if (t.squad.length >= s.squad_size) return { ok: false, why: 'Your squad is full.' };
  if (c.overseas && t.overseas >= s.max_overseas) return { ok: false, why: 'You have reached your overseas limit.' };
  return { ok: true };
}

function auctionHTML(host) {
  const c = S.current, s = S.settings, mine = T(me);
  const purses = S.teams.map((t) => `<div class="pur ${c && c.holder_id === t.id ? 'hi' : ''}" style="--c:${accentOf(t.color)}">${badge(t, 'sm')}<div class="nm"><b>${esc(t.team_name)}</b><span>${t.squad.length} of ${s.squad_size} players</span></div><div class="mn" data-key="p:${t.id}" data-roll="${t.purse}">${money(t.purse)}</div></div>`).join('');
  const feedHTML = feed.slice(0, 12).map((e) => `<div class="fd ${e.id > feedSeen ? 'new' : ''}" style="--c:${e.color}"><i></i><span>${e.html}</span></div>`).join('') || '<p class="sub">Bids and sales will show up here as they happen.</p>';
  const wl = S.my_wishlist.length ? `<div class="panel"><h2>My wishlist</h2>${S.my_wishlist.map((w) => {
    const st = w.status === 'live' ? '<b class="wlive">On stage now</b>' : w.status === 'sold' ? (w.team_id === me ? '<b class="wgot">You got him for ' + money(w.price) + '</b>' : 'Sold to ' + esc(w.team) + ' for ' + money(w.price)) : w.status === 'unsold' ? 'Unsold' : 'Still to come';
    return `<div class="wl"><span>★</span><div><b>${esc(w.name)}</b><small>${st}</small></div></div>`; }).join('')}</div>` : '';
  let main = '';
  if ((S.step === 'bidding' || S.step === 'result') && c) {
    const holder = c.holder_id ? T(c.holder_id) : null;
    const hc = holder ? accentOf(holder.color) : '';
    const r = S.step === 'result' ? S.result : null;
    let bottom;
    if (r) {
      bottom = `<div class="amtrow"><div class="amt"><small>${r.status === 'SOLD' ? 'Sold to ' + esc(r.team) : 'No bids'}</small>${r.status === 'SOLD' ? money(r.price) : 'Unsold'}</div></div>`;
    } else {
      const bs = bidState();
      const btns = !c.holder_id
        ? `<button class="bidbtn" data-act="bid" ${!bs.ok || mine.purse < s.base_price ? 'disabled' : ''}><b>${money(s.base_price)}</b><span>Bid the base price</span></button>`
        : s.increments.map((i) => `<button class="bidbtn" data-act="bid" data-inc="${i}" ${!bs.ok || locked() || mine.purse < c.bid + i ? 'disabled' : ''}><b>${money(c.bid + i)}</b><span>${incLabel(i)}</span></button>`).join('');
      const passed = c.not_interested.map((i) => T(i)).filter(Boolean);
      bottom = `<div class="amtrow">${holder ? badge(holder, 'lg') : ''}<div class="amt"><small>${holder ? 'Highest bid from ' + esc(holder.team_name) : 'No bids yet. Base price'}</small><span id="amtv" data-key="bid:${c.id}" data-roll="${holder ? c.bid : s.base_price}">${money(holder ? c.bid : s.base_price)}</span></div></div>
        <div class="bids">${btns}</div>
        <div class="cbid"><label class="f">Custom bid (Cr)<input type="text" inputmode="decimal" autocomplete="off" id="cb_amt" placeholder="e.g. 15" value="${esc(val('cb_amt', ''))}"></label><button class="btn pri fit" data-act="custombid" ${!bs.ok || locked() ? 'disabled' : ''}>Bid this amount</button><span class="sub">Type the total you want to bid, for example 15 for ₹15 Cr. Everyone gets an alert when the jump is big.</span></div>
        <p class="note">${bs.why ? `<b>${bs.why}</b> ` : ''}${passed.length ? 'Not interested: ' + passed.map((t) => esc(t.team_name)).join(', ') + '.' : 'Nobody has passed on this player yet.'}</p>`;
    }
    main = `<div class="lot ${S.step === 'bidding' && !S.paused ? 'live' : ''} ${c.wished ? 'wish' : ''}" id="lot" style="${hc ? `--hc:${hc}` : ''}">${S.paused ? '<span class="paused">Paused</span>' : ''}
      <div class="grid"><div class="pcol">${portrait(c)}${r ? '' : `<button class="btn pass" data-act="pass" ${c.holder_id === me ? 'disabled' : ''}>Not interested</button>`}</div><div style="min-width:0"><div class="meta"><span class="tag type">${c.type}</span>${c.overseas ? '<span class="tag os" style="margin-left:0">Overseas</span>' : ''}${c.wicketkeeper ? '<span class="tag wk" style="margin-left:0">Wicketkeeper</span>' : ''}${c.wished ? '<span class="tag star">★ On your wishlist</span>' : ''}<span class="sub" style="margin-left:4px">${S.queue_left} more to come</span></div>
        <div class="pname" id="pname">${esc(c.name)}</div>${abilities(c)}${bottom}</div>
        ${r ? '' : `<div class="ringwrap"><svg class="ring" viewBox="0 0 120 120"><circle class="rt" cx="60" cy="60" r="52"/><circle class="rp" id="ring" cx="60" cy="60" r="52" stroke-dasharray="326.73" stroke-dashoffset="0" transform="rotate(-90 60 60)"/></svg><div class="rn" id="tm">${Math.ceil(c.remaining)}</div></div>`}</div></div>`;
  } else if (S.step === 'pools_done') {
    main = `<div class="lot"><div class="pname" style="font-size:clamp(40px,6vw,72px)">All pools are done</div>
      <p class="sub" style="margin:6px 0 18px">${S.unsold.length ? `${S.unsold.length} unsold: ${S.unsold.map((p) => esc(p.name)).join(', ')}.` : 'Every player found a team.'}</p>
      ${host ? `<div class="row"><button class="btn pri fit" data-act="reauc" ${S.unsold.length ? '' : 'disabled'}>Re-auction the unsold players</button><button class="btn ${endArm ? 'armed' : 'danger'} fit" data-act="endauc">${endArm ? 'Click again to end' : 'End auction'}</button></div>` : '<p class="sub">Waiting for the host to continue.</p>'}</div>`;
  }
  const ctl = host && S.step === 'bidding' ? `<div style="margin-bottom:12px">${S.paused ? '<button class="btn ok sm" data-act="resume">Resume bidding</button>' : '<button class="btn sm" data-act="pause">Pause bidding</button>'}</div>` : '';
  const pools = `<div class="panel poolbar"><span class="sub">${s.mix ? 'Mixed order. Players left by type' : 'Pools left'}</span>${s.pool_order.map((p) => `<button class="pchip ${!s.mix && S.next_pool === p ? 'on' : ''}" data-act="nextpool" data-pool="${p}" ${!host || !S.pools_left[p] ? 'disabled' : ''}>${p}<b>${S.pools_left[p]}</b>${!s.mix && S.next_pool === p ? '<em>up next</em>' : ''}</button>`).join('')}
    ${host ? '<span class="sub">Tap a type to bring it forward. The player on stage is not interrupted.</span>' : ''}</div>`;
  return `<div class="panel" style="padding:14px 18px">${settingsSummary()}</div>${pools}
    <div class="stage"><div>${ctl}${S.step === 'bidding' && S.current ? teamBar(S.current, s) : ''}${main}</div><div class="rail"><div class="panel" style="margin-top:0"><h2>Purses</h2>${purses}</div>${wl}<div class="panel"><h2>Live activity</h2><div class="log feed">${feedHTML}</div></div></div></div>`;
}

// the final squad as a pitch: batting order in rows, then impact player and bench
function fieldHTML(t) {
  const by = (id) => t.squad.find((p) => p.id === id), c1 = t.color, c2 = '#ffffff', rows = [[0, 2], [2, 5], [5, 8], [8, 11]], names = ['Openers', 'Top and middle order', 'Lower middle order', 'Tail'];
  const one = (p, n) => `<div class="fp ${p.id === t.captain ? 'cap' : ''}"><i class="fn">${n}</i>${jersey(p, c1, c2, true)}<b>${esc(p.name.split(/\s+/).slice(-1)[0])}</b><small>${p.id === t.captain ? '<em>C</em>' : ''}${p.id === t.keeper ? '<em class="k">WK</em>' : ''}${p.overseas ? '<em class="o">OS</em>' : ''}</small></div>`;
  const xi = t.xi.map(by).filter(Boolean), imp = t.impact ? by(t.impact) : null, bench = t.squad.filter((p) => !t.xi.includes(p.id) && p.id !== t.impact);
  return `<div class="field">${rows.map(([a, b], r) => `<div class="frow" title="${names[r]}">${xi.slice(a, b).map((p, k) => one(p, a + k + 1)).join('')}</div>`).join('')}</div>
    <div class="fside">${imp ? `<div class="fim"><span>⚡ Impact</span>${jersey(imp, c1, c2, true)}<b>${esc(imp.name)}</b></div>` : ''}${bench.length ? `<div class="fbn"><span>Bench</span>${bench.map((p) => `<b>${esc(p.name)}</b>`).join('')}</div>` : ''}</div>`;
}
function rankHTML() {
  if (!S.ranking || !S.ranking.length) return '';
  const TL = { S: 'Elite', A: 'Strong', B: 'Average', C: 'Needs work' };
  const sec = (x, extra, tid, key) => `<div class="sec"><div class="sech"><b>${esc(x.label)}</b><span class="vd v${esc((x.verdict || '').replace(/\W/g, ''))}">${esc(x.verdict)} · ${x.score}</span></div>${extra ? `<small class="sub">${extra}</small>` : ''}
      <p>${esc(x.summary)}</p>
      <button class="btn rmore" data-act="rkmore" data-t="${esc(tid)}" data-k="${esc(key)}">Read more <span class="cnt">${x.pros.length} ${x.pros.length === 1 ? "pro" : "pros"}, ${x.cons.length} ${x.cons.length === 1 ? "con" : "cons"}</span></button></div>`;
  const cards = S.ranking.map((g) => {
    const t = T(g.team); if (!t) return '';
    const star = g.star && t.squad.find((p) => p.id === g.star.id);
    const imp = g.impact && { label: 'Impact player' + (g.impact.name ? ': ' + g.impact.name : ''), verdict: g.impact.verdict, score: g.impact.score, summary: g.impact.summary, pros: g.impact.pros.length ? g.impact.pros : ['None chosen.'], cons: g.impact.cons };
    const bn = g.bench && { label: 'Bench strength', verdict: g.bench.verdict, score: g.bench.score, summary: g.bench.summary, pros: g.bench.pros, cons: g.bench.cons };
    return `<div class="rk tier${g.tier}" style="--c:${accentOf(t.color)}"><div class="rkh"><span class="rkn">#${g.rank}</span>${badge(t)}<div class="nm"><b>${esc(t.team_name)}</b><div class="sub">${esc(t.name)}</div></div><div class="tier-b"><b>${g.tier}</b><small>${TL[g.tier]}</small></div></div>
      <div class="rks">Playing XI score <b>${g.score}</b> / 100${g.thin_data ? ' <span class="tag" title="Several of these players have limited public stats">limited data</span>' : ''}</div>
      <p class="rsum">${esc(g.summary)}</p>
      <div class="bars">${g.cats.map((c) => `<div class="bar"><span>${esc(c.label)}</span><i><u style="width:${Math.max(4, Math.min(100, c.score))}%"></u></i><b>${c.score}</b></div>`).join('')}</div>
      ${star && g.star.trump ? `<p class="sub"><b>${esc(star.name)}</b> is the match-winner of this XI (${esc(g.star.as)}). ${esc(g.star.trump)} Risk: ${esc(g.star.spot || 'none noted')}</p>` : ''}
      <div class="secs">${g.cats.map((c) => sec(c, '', g.team, c.key)).join('')}</div>
      ${imp || bn ? `<h3 class="rsub">Outside the XI score</h3><div class="secs">${imp ? sec(imp, 'Not counted in the XI score', g.team, 'impact') : ''}${bn ? sec(bn, 'Not counted in the XI score', g.team, 'bench') : ''}</div>` : ''}</div>`;
  }).join('');
  const cond = S.settings.conditions && S.settings.conditions !== NORMAL ? ` Conditions used: ${esc(S.settings.conditions)}.` : '';
  return `<div class="panel rankp"><h2>Team rankings <span class="pill" style="margin-left:auto">${esc(S.ranking[0] ? (T(S.ranking[0].team) || {}).team_name || '' : '')} wins</span></h2>
    <p class="counter">The playing XI is graded as you set it: each batter is rated for the slot he bats in, and the bowling is rated over by over for the powerplay, middle overs and death.${cond} The impact player and the bench are rated separately. Money spent and purse left do not count.</p><div class="rkg">${cards}</div></div>`;
}
function teamsHTML() {
  if (S.phase === 'lobby' || S.phase === 'selection') return '';
  const fin = S.all_saved, done = S.teams.filter((t) => t.saved).length;
  const one = (t, i) => { const p = t.squad.find((x) => x.id === i); return p ? `<li class="${p.id === t.captain ? 'cap' : ''}"><span>${roleIcon(p)} ${esc(p.name)}${tags(p)}${i === t.captain ? ' <em>C</em>' : ''}${i === t.keeper ? ' <em class="k">WK</em>' : ''}</span><span>${money(p.price)}</span></li>` : ''; };
  const cards = S.teams.map((t) => {
    const out = t.xi.length === 11 ? t.squad.filter((p) => !t.xi.includes(p.id)) : t.squad;
    const sav = `<span class="svb ${t.saved ? 'ok' : ''}">${t.saved ? '✓ Saved' : 'Not saved'}</span>`;
    return `<div class="tcard ${t.id === me ? 'me' : ''} ${t.saved ? 'sv' : ''}" style="--c:${accentOf(t.color)}"><header>${badge(t)}<div class="nm"><b>${esc(t.team_name)}</b>${t.is_host ? ' 👑' : ''}<div class="sub">${esc(t.name)}${t.connected ? '' : ', offline'}${t.id === me ? ', you' : ''}</div></div>
    <div class="pr"><span data-key="tp:${t.id}" data-roll="${t.purse}">${money(t.purse)}</span><small>${t.squad.length}/${S.settings.squad_size} players, ${t.overseas}/${S.settings.max_overseas} overseas</small></div></header>
    <div class="svrow">${t.removed ? '<span class="svb">Removed by host</span>' : sav} ${rmBtn(t)}</div>
    ${t.no_keeper_flag ? '<div class="flag">⚑ No wicketkeeper in this squad</div>' : ''}
    ${t.xi.length === 11 && fin ? fieldHTML(t) : t.xi.length === 11 ? `<h4 class="xh">Playing XI</h4><ul class="sq">${t.xi.map((i) => one(t, i)).join('')}</ul>${t.impact ? `<h4 class="xh">Impact player</h4><ul class="sq">${one(t, t.impact)}</ul>` : ''}` : ''}
    ${t.xi.length === 11 && fin ? '' : `<h4 class="xh">${t.xi.length === 11 ? 'Bench' : 'Squad'}</h4><ul class="sq">${out.filter((p) => p.id !== t.impact).map((p) => `<li><span>${roleIcon(p)} ${esc(p.name)}${tags(p)}</span><span>${money(p.price)}</span></li>`).join('') || '<li><span class="mut">No players</span></li>'}</ul>`}</div>`;
  }).join('');
  const head = fin ? `<div class="finalbar"><b>🏆 All teams are locked in</b><span>Final squads and playing XIs. A new trade unlocks the teams involved until they save again.</span></div>`
    : S.phase === 'finished' ? `<p class="counter">${done} of ${S.teams.length} teams saved. The final screen appears when everyone has saved.</p>` : '';
  return rankHTML() + `<div class="panel ${fin ? 'final' : ''}"><h2>${fin ? 'Final squads and playing XI' : 'Squads and playing XI'}</h2>${head}<div class="tgrid">${cards}</div></div>`;
}

// ---------- playing XI builder ----------
const ROLE_ORDER = (p) => (p.wicketkeeper ? 0 : { Batsman: 1, 'All-rounder': 2, Spinner: 3, Bowler: 4 }[p.type] ?? 5);
const roleIcon = (p) => (p.wicketkeeper ? '🧤' : p.type === 'Batsman' ? '🏏' : p.type === 'Spinner' ? '🌀' : p.type === 'Bowler' ? '⚡' : '✨');
const sortRole = (a, b) => ROLE_ORDER(a) - ROLE_ORDER(b) || a.name.localeCompare(b.name);

function lineupState(t) {
  const L = lineup, by = (id) => t.squad.find((p) => p.id === id);
  const xi = L.xi.map(by).filter(Boolean), imp = L.imp ? by(L.imp) : null;
  const bench = t.squad.filter((p) => !L.xi.includes(p.id) && p.id !== L.imp).sort(sortRole);
  const os = xi.filter((p) => p.overseas).length, keepersInXI = xi.filter((p) => p.wicketkeeper);
  const squadHasKeeper = t.squad.some((p) => p.wicketkeeper);
  const wk = L.wk && xi.some((p) => p.id === L.wk) ? L.wk : (keepersInXI.length === 1 ? keepersInXI[0].id : null);
  const cap = L.cap && xi.some((p) => p.id === L.cap) ? L.cap : null;
  const checks = [
    { ok: xi.length === 11, label: `${xi.length} of 11 picked`, hint: xi.length < 11 ? `Pick ${11 - xi.length} more for your XI` : '' },
    { ok: os <= 4, label: `${os} of 4 overseas`, hint: os > 4 ? 'Remove an overseas player: only 4 can play' : '' },
    { ok: !!cap, label: 'Captain', hint: 'Tap the C button on a player to make him captain' },
    { ok: !squadHasKeeper || !!wk, label: 'Wicketkeeper', hint: !wk && keepersInXI.length > 1 ? 'Tap the glove on one of your keepers' : 'Add a wicketkeeper to your XI' },
  ];
  const impBad = imp && imp.overseas && os >= 4;
  const valid = checks.every((c) => c.ok) && !impBad;
  const next = checks.find((c) => !c.ok);
  const saved = JSON.stringify([t.xi, t.impact || null, t.captain || null, t.keeper || null]);
  const cur = JSON.stringify([xi.map((p) => p.id), imp ? imp.id : null, cap, wk]);
  return { xi, imp, bench, os, wk, cap, checks, valid, impBad, next, dirty: saved !== cur, hasSaved: t.xi.length === 11 };
}

const POS = ['Opener', 'Opener', 'One down', 'Middle order', 'Middle order', 'Middle order', 'Lower order', 'Lower order', 'Tail', 'Tail', 'Tail'];
function xcard(p, ctx, st, i) {
  const pop = p.id === lastMoved ? 'pop' : '', sub = `${esc(roleLabel(p))} · ${money(p.price)}`;
  const tag = p.overseas ? '<span class="tag os">OS</span>' : '';
  let act = '';
  if (ctx === 'xi') act = `<button class="xbtn mv" data-act="xup" data-id="${p.id}" title="Move up the batting order" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>▲</button><button class="xbtn mv" data-act="xdn" data-id="${p.id}" title="Move down the batting order" aria-label="Move down" ${i === st.xi.length - 1 ? 'disabled' : ''}>▼</button>${p.wicketkeeper ? `<button class="xbtn k ${st.wk === p.id ? 'on' : ''}" data-act="xwk" data-id="${p.id}" title="Make wicketkeeper" aria-label="Make wicketkeeper">🧤</button>` : ''}
      <button class="xbtn c ${st.cap === p.id ? 'on' : ''}" data-act="xcap" data-id="${p.id}" title="Make captain" aria-label="Make captain">C</button>
      <button class="xbtn" data-act="xrm" data-id="${p.id}" title="Move to bench" aria-label="Move to bench">✕</button>`;
  else if (ctx === 'bench') act = `<button class="xbtn imp" data-act="ximp" data-id="${p.id}" title="Make impact player" aria-label="Make impact player">⚡</button>`;
  else act = `<button class="xbtn" data-act="ximprm" data-id="${p.id}" title="Move to bench" aria-label="Move to bench">✕</button>`;
  return `<div class="xc ${ctx} ${pop}" draggable="true" data-pid="${p.id}" ${ctx === 'bench' ? `data-act="xadd" data-id="${p.id}"` : ''}>
    ${ctx === 'xi' ? `<span class="xn">${i + 1}</span>` : `<span class="xico">${roleIcon(p)}</span>`}
    <div class="xm"><b>${esc(p.name)}${tag}</b><small>${ctx === 'xi' ? `<b class="xpos">${POS[i]}</b> ` + roleIcon(p) + ' ' : ''}${sub}</small></div>
    <div class="xa">${act}</div></div>`;
}

function xiHTML() {
  const t = T(me);
  if (!t || !['auction', 'finished'].includes(S.phase) || !t.squad.length) return '';
  const srvSig = JSON.stringify([t.xi, t.impact, t.captain, t.keeper]), inSquad = (i) => t.squad.some((p) => p.id === i);
  const fromServer = () => ({ xi: t.xi.filter(inSquad), imp: t.impact && inSquad(t.impact) ? t.impact : null, cap: t.captain || null, wk: t.keeper || null });
  const draftSig = () => JSON.stringify([lineup.xi, lineup.imp, lineup.cap, lineup.wk]);
  if (!lineup) {
    let kept = null; try { kept = JSON.parse(localStorage.getItem('iplxi:' + S.code + ':' + me) || 'null'); } catch {}
    lineup = kept && kept.xi ? { xi: kept.xi.filter(inSquad), imp: kept.imp && inSquad(kept.imp) ? kept.imp : null, cap: kept.cap, wk: kept.wk } : fromServer();
    xiSig = srvSig; xiBase = JSON.stringify([fromServer().xi, fromServer().imp, fromServer().cap, fromServer().wk]);
  } else if (srvSig !== xiSig) {                    // the server copy changed (you saved, or a trade removed someone)
    const justSaved = xiSaving && t.xi.length === 11, wasClean = draftSig() === xiBase;
    if (justSaved) toast('Playing XI saved.');
    xiSaving = false; xiSig = srvSig;
    if (wasClean || justSaved) lineup = fromServer();
    xiBase = JSON.stringify([fromServer().xi, fromServer().imp, fromServer().cap, fromServer().wk]);
  }
  // buying or losing players never resets your lineup: keep everyone who is still in the squad, new players just join the bench
  lineup.xi = lineup.xi.filter(inSquad); if (lineup.imp && !inSquad(lineup.imp)) lineup.imp = null;
  if (lineup.cap && !lineup.xi.includes(lineup.cap)) lineup.cap = null; if (lineup.wk && !lineup.xi.includes(lineup.wk)) lineup.wk = null;
  try { localStorage.setItem('iplxi:' + S.code + ':' + me, JSON.stringify(lineup)); } catch {}
  const st = lineupState(t);
  const slots = Array.from({ length: Math.max(0, 11 - st.xi.length) }, (_, k) => `<div class="slot"><span class="xn ghost">${st.xi.length + k + 1}</span>Tap a bench player or drag one here</div>`).join('');
  const chk = st.checks.map((c) => `<span class="chk ${c.ok ? 'ok' : ''}"><i>${c.ok ? '✓' : ''}</i>${c.label}</span>`).join('') +
    `<span class="chk ${st.imp ? 'ok' : 'opt'}"><i>${st.imp ? '✓' : ''}</i>${st.imp ? 'Impact set' : 'Impact (optional)'}</span>`;
  const note = st.impBad ? 'An overseas impact player is allowed only when your XI has 3 or fewer overseas players.' : st.next ? st.next.hint : st.dirty ? 'Looks good. Save to lock it in.' : 'Your team is saved. If you trade, you will need to save again.';
  const bench = st.bench.map((p) => xcard(p, 'bench', st)).join('') || '<p class="sub" style="padding:6px">Everyone is in the XI or the impact slot.</p>';
  return `<div class="panel xb"><h2>My playing XI <span class="pill ${!st.dirty && t.saved ? 'saved' : 'dirty'}" style="margin-left:auto">${st.dirty ? 'Unsaved changes' : t.saved ? 'Team saved ✓' : 'Not saved yet'}</span></h2>
    <div class="xbar">${chk}</div>
    ${t.squad.length < 11 ? `<p class="sub">You need 11 players to set a playing XI. You have ${t.squad.length}. You can still save your team as it is.</p><div class="row"><button class="btn pri fit" data-act="xsaveteam" ${t.saved ? 'disabled' : ''}>${t.saved ? 'Team saved ✓' : 'Save team as it is'}</button></div>` : ''}
    <div class="xlayout">
      <div class="xzone field" data-zone="xi"><div class="zh"><b>Playing XI</b><span class="sub">Tap C for captain, 🧤 for wicketkeeper</span></div>
        <div class="xgrid">${st.xi.map((p, i) => xcard(p, 'xi', st, i)).join('')}${slots}</div></div>
      <div class="xside">
        <div class="xzone imp" data-zone="imp"><div class="zh"><b>⚡ Impact player</b><span class="sub">Comes on during the match</span></div>
          ${st.imp ? xcard(st.imp, 'imp', st) : '<div class="slot">Tap ⚡ on a bench player or drag one here</div>'}</div>
        <div class="xzone bench" data-zone="bench"><div class="zh"><b>Bench</b><span class="sub">${st.bench.length} player${st.bench.length === 1 ? '' : 's'}. Tap to add to the XI</span></div><div class="xgrid one">${bench}</div></div>
      </div>
    </div>
    <div class="row" style="margin-top:18px;align-items:center"><button class="btn pri fit" data-act="xsave" ${st.valid && st.xi.length === 11 ? '' : 'disabled'}>Save team</button>
      <button class="btn fit" data-act="xauto">Suggest a balanced XI</button><button class="btn fit" data-act="xclear" ${lineup.xi.length || lineup.imp ? '' : 'disabled'}>Clear</button>
      <span class="sub" style="flex:1 1 220px">${esc(note)}</span></div></div>`;
}

function lineupMove(pid, to) {
  const t = T(me), p = t.squad.find((x) => x.id === pid); if (!p) return;
  const L = lineup, inXI = L.xi.includes(pid), st = lineupState(t);
  const free = () => { L.xi = L.xi.filter((i) => i !== pid); if (L.cap === pid) L.cap = null; if (L.wk === pid) L.wk = null; if (L.imp === pid) L.imp = null; };
  if (to === 'xi') {
    if (inXI) return;
    if (L.xi.length >= 11) return toast('Your XI is full. Move someone to the bench first.');
    if (p.overseas && st.os >= 4) return toast('Only 4 overseas players can be in the playing XI.');
    free(); L.xi.push(pid);
  } else if (to === 'imp') {
    if (p.overseas && !inXI && st.os >= 4) return toast('An overseas impact player needs 3 or fewer overseas players in the XI.');
    if (p.overseas && inXI && st.os - 1 >= 4) return toast('An overseas impact player needs 3 or fewer overseas players in the XI.');
    free(); L.imp = pid;
  } else free();
  lastMoved = pid; render(); setTimeout(() => { lastMoved = null; }, 600);
}

function lineupSwap(dragged, target) {
  const t = T(me), L = lineup; if (dragged === target || !t.squad.some((p) => p.id === dragged) || !t.squad.some((p) => p.id === target)) return;
  const A = L.xi.indexOf(dragged), B = L.xi.indexOf(target), pd = t.squad.find((p) => p.id === dragged), pt = t.squad.find((p) => p.id === target);
  const osAfter = (inIds) => inIds.map((i) => t.squad.find((p) => p.id === i)).filter((p) => p && p.overseas).length;
  if (A >= 0 && B >= 0) { [L.xi[A], L.xi[B]] = [L.xi[B], L.xi[A]]; }                                   // two XI players trade batting positions
  else if (A < 0 && B >= 0) {                                                                           // bench or impact player takes the slot
    const next = L.xi.slice(); next[B] = dragged;
    if (osAfter(next) > 4) return toast('Only 4 overseas players can be in the playing XI.');
    L.xi = next; if (L.imp === dragged) L.imp = target;                                                 // an impact player swaps places with the XI player
    if (L.cap === target) L.cap = null; if (L.wk === target) L.wk = null;
  } else if (A >= 0 && B < 0) {                                                                         // XI player swaps with a bench player
    const next = L.xi.slice(); next[A] = target;
    if (osAfter(next) > 4) return toast('Only 4 overseas players can be in the playing XI.');
    L.xi = next; if (L.cap === dragged) L.cap = null; if (L.wk === dragged) L.wk = null;
  } else return;
  lastMoved = dragged; render(); setTimeout(() => { lastMoved = null; }, 600);
}
function lineupShift(pid, d) {
  const L = lineup, i = L.xi.indexOf(pid), j = i + d; if (i < 0 || j < 0 || j >= L.xi.length) return;
  [L.xi[i], L.xi[j]] = [L.xi[j], L.xi[i]]; lastMoved = pid; render(); setTimeout(() => { lastMoved = null; }, 600);
}
function suggestXI(t) {
  const sq = t.squad.slice().sort((a, b) => b.price - a.price), pick = [], has = (p) => pick.includes(p);
  const add = (p) => { if (p && !has(p) && pick.length < 11 && !(p.overseas && pick.filter((x) => x.overseas).length >= 4)) pick.push(p); };
  const take = (n, f) => sq.filter((p) => !has(p) && f(p)).slice(0, n).forEach(add);
  take(1, (p) => p.wicketkeeper);
  take(3, (p) => p.type === 'Batsman'); take(3, (p) => p.type === 'All-rounder'); take(2, (p) => p.type === 'Bowler'); take(2, (p) => p.type === 'Spinner');
  sq.forEach((p) => { if (pick.length < 11) add(p); });
  const rest = sq.filter((p) => !has(p)), osIn = pick.filter((p) => p.overseas).length;
  const imp = rest.find((p) => !p.overseas || osIn <= 3) || null, keepers = pick.filter((p) => p.wicketkeeper);
  lineup = { xi: pick.map((p) => p.id), imp: imp ? imp.id : null, cap: (pick.slice().sort((a, b) => b.price - a.price)[0] || {}).id || null, wk: keepers.length ? keepers.sort((a, b) => b.price - a.price)[0].id : null };
}

function tradeHTML() {
  if (!['auction', 'finished'].includes(S.phase)) return '';
  const mine = T(me), others = S.teams.filter((t) => t.id !== me);
  if (!mine || !others.length) return '';
  const cashTxt = (t) => (t.cash > 0 ? `${esc(t.from_team)} adds ${money(t.cash)}` : t.cash < 0 ? `${esc(t.to_team)} adds ${money(-t.cash)}` : 'no cash');
  const names = (arr) => arr.map((p) => esc(p.name)).join(', ') || 'nobody';
  const list = S.trades.slice().reverse().map((t) => {
    const incoming = t.to === me, act = t.status === 'pending' ? (incoming
      ? `<button class="btn ok sm" data-act="tacc" data-id="${t.id}">Accept</button><button class="btn sm" data-act="tcnt" data-id="${t.id}">Counter</button><button class="btn danger sm" data-act="trej" data-id="${t.id}">Reject</button>`
      : t.from === me ? `<button class="btn danger sm" data-act="tcan" data-id="${t.id}">Cancel offer</button>` : '') : '';
    return `<div class="trade ${t.status === 'pending' && incoming ? 'inc' : ''}"><span class="st ${t.status}">${t.status}</span><span><b>${esc(t.from_team)}</b> gives ${names(t.give)} and gets ${names(t.get)} from <b>${esc(t.to_team)}</b>. Cash: ${cashTxt(t)}.</span><span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">${act}</span></div>`;
  }).join('') || '<p class="sub">No trades yet.</p>';
  const to = T(val('t_to', others[0].id)) || others[0];
  const chips = (arr, set, act) => arr.map((p) => `<span class="chip ${set.has(p.id) ? 'on' : ''}" data-act="${act}" data-id="${p.id}">${esc(p.name)}${tags(p)}</span>`).join('') || '<span class="sub">No players yet</span>';
  const cnt = counterOf ? S.trades.find((x) => x.id === counterOf && x.status === 'pending') : null;
  if (counterOf && !cnt) counterOf = null;
  const dir = val('t_dir', 'pay');
  return `<div class="panel" id="tradepanel"><h2>Trades <span class="pill" style="margin-left:auto">Open during the auction and after it</span></h2>${list}
    <h3 class="tnew">${cnt ? `Counter offer to ${esc(cnt.from_team)}` : 'New offer'}</h3>
    <p class="counter">Pick players both ways, add cash if you like, and send it. The other team can accept, reject or counter. Nothing moves until someone accepts.</p>
    <div class="row"><label class="f">Trade with<select id="t_to" ${cnt ? 'disabled' : ''}>${others.map((t) => `<option value="${t.id}" ${t.id === to.id ? 'selected' : ''}>${esc(t.team_name)}</option>`).join('')}</select></label></div>
    <p class="sub" style="margin:14px 0 8px">You give</p><div class="chips">${chips(mine.squad, tdraft.give, 'tg')}</div>
    <p class="sub" style="margin:14px 0 8px">You get from ${esc(to.team_name)}</p><div class="chips">${chips(to.squad, tdraft.get, 'tw')}</div>
    <div class="row" style="margin-top:16px;align-items:flex-end"><label class="f fit">Cash<select id="t_dir"><option value="pay" ${dir === 'pay' ? 'selected' : ''}>I pay</option><option value="recv" ${dir === 'recv' ? 'selected' : ''}>I receive</option></select></label>
      <label class="f fit">Amount in Cr<input type="number" min="0" step="0.25" id="t_cash" value="${esc(val('t_cash', '0'))}"></label>
      <button class="btn pri fit" data-act="${cnt ? 'tsendcnt' : 'propose'}">${cnt ? 'Send counter offer' : 'Send trade offer'}</button>${cnt ? '<button class="btn fit" data-act="tcntx">Cancel counter</button>' : ''}</div></div>`;
}
const tradeCash = () => Math.round((+el$('t_cash').value || 0) * 100) * (el$('t_dir').value === 'recv' ? -1 : 1);
const myInbox = () => (S && S.trades ? S.trades.filter((t) => t.status === 'pending' && t.to === me).length : 0);

// ---------- live timer ring (updated without re-render) ----------
function tickTimers() {
  if (!S) return;
  const c = S.current;
  if (S.step === 'bidding' && c) {
    const rem = S.paused ? c.remaining : Math.max(0, c.remaining - (Date.now() - lastRecv) / 1000);
    const tm = document.getElementById('tm'), ring = document.getElementById('ring'), lot = document.getElementById('lot');
    if (tm) tm.textContent = Math.ceil(rem);
    if (ring) ring.style.strokeDashoffset = 326.73 * (1 - Math.min(1, rem / S.settings.bid_timer));
    if (lot) lot.classList.toggle('low', rem <= 5 && !S.paused);
    document.body.classList.toggle('hot', rem <= 5 && !S.paused);
  } else document.body.classList.remove('hot');
  const st = document.getElementById('selt');
  if (st && S.phase === 'selection') st.textContent = Math.max(0, Math.ceil(S.selection_remaining - (Date.now() - lastRecv) / 1000));
}
setInterval(tickTimers, 200);

// ---------- live activity feed (built from state changes) ----------
function pushFeed(color, html) { feed.unshift({ id: ++feedSeq, color, html }); if (feed.length > 40) feed.pop(); }
function trackFeed() {
  if (!S || S.phase !== 'auction') return;
  const c = S.current, nm = (t) => `<b>${esc(t.team_name)}</b>`;
  if (!feedInit) {
    feedInit = true;
    S.sold_log.slice(-8).forEach((x) => { const t = T(x.team_id); pushFeed(t ? accentOf(t.color) : '#8b90a0', `<b>${esc(x.player.name)}</b> sold to ${esc(x.team)} for ${money(x.price)}`); });
    if (c && S.step === 'bidding') pushFeed('#8b90a0', `<b>${esc(c.name)}</b> is up for bidding`);
    fPrev.cur = c ? c.id : null; fPrev.holder = c ? c.holder_id : null; fPrev.bid = c ? c.bid : 0; fPrev.ni = c ? c.not_interested.length : 0;
    return;
  }
  if (c && S.step === 'bidding') {
    if (c.id !== fPrev.cur) { pushFeed('#8b90a0', `<b>${esc(c.name)}</b> is up for bidding`); fPrev.cur = c.id; fPrev.holder = c.holder_id; fPrev.bid = c.bid; fPrev.ni = c.not_interested.length; }
    else {
      if (c.holder_id && (c.holder_id !== fPrev.holder || c.bid !== fPrev.bid) && T(c.holder_id)) { const t = T(c.holder_id); pushFeed(accentOf(t.color), `${nm(t)} bid ${money(c.bid)}`); fPrev.holder = c.holder_id; fPrev.bid = c.bid; }
      if (c.not_interested.length > fPrev.ni) { const who = c.not_interested.map((i) => T(i)).filter(Boolean).pop(); if (who) pushFeed('#8b90a0', `${nm(who)} passed`); }
      fPrev.ni = c.not_interested.length;
    }
  }
  if (S.step === 'result' && S.result) {
    const key = [S.result.player.id, S.result.status, S.sold_log.length, S.unsold.length].join(':');
    if (key !== fPrev.res) {
      fPrev.res = key; const r = S.result, t = r.team_id ? T(r.team_id) : null;
      pushFeed(t ? accentOf(t.color) : '#ef6a5e', r.status === 'SOLD' ? `<b>${esc(r.player.name)}</b> sold to ${esc(r.team)} for ${money(r.price)}` : `<b>${esc(r.player.name)}</b> went unsold`);
    }
  }
}

// ---------- numbers that roll instead of jump ----------
const rollRaf = {};
function rollAll() {
  document.querySelectorAll('[data-roll]').forEach((el) => {
    const k = el.dataset.key, to = +el.dataset.roll, from = prevVals[k];
    prevVals[k] = to;
    if (from === undefined || from === to || reduce()) return;
    cancelAnimationFrame(rollRaf[k]);
    const t0 = performance.now(), d = 700;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3);
      el.textContent = money(Math.round(from + (to - from) * e));
      if (p < 1) rollRaf[k] = requestAnimationFrame(step);
    };
    rollRaf[k] = requestAnimationFrame(step);
  });
}

// ---------- wishlist alert ----------
function chime() {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const ac = audio, t = ac.currentTime;
    [523, 659, 784, 1047].forEach((f, k) => { const o = ac.createOscillator(), g = ac.createGain(), at = t + k * 0.09; o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.2, at + .02); g.gain.exponentialRampToValueAtTime(.0001, at + .5); o.connect(g).connect(ac.destination); o.start(at); o.stop(at + .55); });
  } catch {}
}
function showWishFx(c) {
  const w = $('#wishfx'), t = T(me), can = t && t.squad.length < S.settings.squad_size && t.purse >= S.settings.base_price && !(c.overseas && t.overseas >= S.settings.max_overseas);
  w.innerHTML = `<div class="wf-star">★<i></i><i></i><i></i><i></i><i></i><i></i></div><div class="wf-t"><small>On your wishlist</small><b>${esc(c.name)}</b><span>is up for bidding right now</span></div>
    ${can ? `<button class="btn pri" data-act="bid">Bid ${money(S.settings.base_price)}</button>` : ''}<button class="iconbtn wf-x" data-act="wishx" aria-label="Dismiss">✕</button>`;
  w.classList.remove('on'); void w.offsetWidth; w.classList.add('on');
  clearTimeout(showWishFx.t); showWishFx.t = setTimeout(() => w.classList.remove('on'), 7000);
  chime();
}
const hideWishFx = () => $('#wishfx').classList.remove('on');

// ---------- ambient floodlights + drifting dust ----------
function startDust() {
  const cv = $('#dust'); if (!cv || reduce()) return;
  const x = cv.getContext('2d'); let W = 0, H = 0, col = '124,140,255';
  const P = Array.from({ length: Math.min(46, (navigator.hardwareConcurrency || 4) <= 4 ? 18 : 30) }, () => ({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 1.8, v: .015 + Math.random() * .05, ph: Math.random() * 6.28, a: .12 + Math.random() * .28 }));
  const size = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
  size(); addEventListener('resize', size);
  setInterval(() => { const a = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim(); if (/^#/.test(a)) { const n = parseInt(a.slice(1), 16); col = [n >> 16, (n >> 8) & 255, n & 255].join(','); } }, 1500);
  let last = performance.now();
  (function loop(now) {
    requestAnimationFrame(loop);
    if (now - last < 33) return;                       // about 30 frames a second is plenty for drifting dust
    const dt = Math.min(80, now - last) / 1000; last = now;
    if (!document.hidden) {
      x.clearRect(0, 0, W, H);
      const hot = document.body.classList.contains('hot'), live = document.body.classList.contains('live');
      for (const p of P) {
        p.y -= p.v * dt * (hot ? 3 : live ? 1.6 : 1); p.x += Math.sin(now / 3000 + p.ph) * .00012; if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
        const tw = .55 + .45 * Math.sin(now / 900 + p.ph);
        x.fillStyle = `rgba(${hot ? '239,106,94' : col},${(p.a * tw).toFixed(3)})`; x.beginPath(); x.arc(p.x * W, p.y * H, p.r, 0, 6.283); x.fill();
      }
    }
  })(last);
}

// ---------- motion: lot reveal, price bump, gavel ----------
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function motion() {
  const c = S.current;
  if (c && S.step === 'bidding') {
    if (lastCur !== c.id) {
      lastCur = c.id; lastBid = c.bid; if (c.big_bid) lastBigId = c.big_bid.id;
      if (c.wished) showWishFx(c); else hideWishFx();
      const n = document.getElementById('pname'), pc = document.getElementById('pcard'), ab = document.querySelector('#lot .abil');
      if (!reduce()) {
        if (pc) pc.animate([{ transform: 'perspective(900px) rotateY(-95deg)', opacity: 0 }, { transform: 'perspective(900px) rotateY(8deg)', opacity: 1, offset: .7 }, { transform: 'perspective(900px) rotateY(0)', opacity: 1 }], { duration: 750, easing: 'cubic-bezier(.2,.8,.2,1)' });
        if (n) n.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 160, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
        if (ab) ab.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 330, easing: 'ease-out', fill: 'backwards' });
      }
    } else if (lastBid !== c.bid) {
      lastBid = c.bid;
      if (c.big_bid && c.big_bid.id !== lastBigId && T(c.big_bid.team)) { lastBigId = c.big_bid.id; showBigBid(c.big_bid); hideWishFx(); }
      else if (c.holder_id && T(c.holder_id)) { showBidFx(T(c.holder_id), c.bid); hideWishFx(); }
      const a = document.getElementById('amtv');
      if (a && !reduce()) { a.parentElement.classList.remove('bump'); void a.offsetWidth; a.parentElement.classList.add('bump'); }
    }
  }
  if (S.step === 'result' && S.result) {
    const key = [S.result.player.id, S.result.status, S.sold_log.length, S.unsold.length].join(':');
    if (key !== lastFx) { lastFx = key; fireHammer(S.result); hideWishFx(); }
  }
}

function showBigBid(bb) {
  const t = T(bb.team), el = $('#bigfx'), col = accentOf(t.color), lock = Math.max(1, bb.lock_remaining || 3);
  bigLockUntil = Date.now() + lock * 1000; clearTimeout(bigT); bigT = setTimeout(() => { bigLockUntil = 0; if (S) render(); }, lock * 1000 + 50);
  el.style.setProperty('--bc', col); el.style.setProperty('--bink', ink(col)); el.style.setProperty('--lock', lock + 's');
  el.innerHTML = `<canvas id="rain"></canvas><div class="bb"><div class="bbt">${badge(t, 'lg')}<span>${t.id === me ? 'You made a big bid' : esc(t.team_name) + ' made a big bid'}</span></div>
    <div class="bbk">NEW BID</div><div class="bba">${money(bb.to)}</div>
    <div class="bbd">was ${money(bb.from)}<i>→</i>now ${money(bb.to)}<em>+${money(bb.to - bb.from)}</em></div></div>
    <div class="bbw"><span>Price jumped. Check before you bid.</span><u></u></div>`;
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  clearTimeout(showBigBid.t); showBigBid.t = setTimeout(() => { el.classList.remove('go'); el.innerHTML = ''; }, lock * 1000 + 600);
  render(); coins(); thud(false);
  if (!reduce()) moneyRain($('#rain'), lock * 1000 + 400);
}
function moneyRain(cv, ms) {
  if (!cv) return;
  const x = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight, N = innerWidth < 700 ? 28 : 46;
  const P = Array.from({ length: N }, (_, i) => ({ x: Math.random() * W, y: -Math.random() * H * .8 - 30, v: 260 + Math.random() * 330, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 6,
    note: i % 3 !== 0, s: 0.8 + Math.random() * 0.7, sw: Math.random() * 6.28 }));
  const t0 = performance.now(); let last = t0;
  (function frame(now) {
    const dt = Math.min(50, now - last) / 1000; last = now; x.clearRect(0, 0, W, H);
    for (const p of P) {
      p.y += p.v * dt; p.rot += p.vr * dt; p.sw += dt * 3; const px = p.x + Math.sin(p.sw) * 22;
      x.save(); x.translate(px, p.y); x.rotate(p.rot);
      if (p.note) {
        const w = 56 * p.s, h = 28 * p.s; x.fillStyle = '#3f9d57'; x.fillRect(-w / 2, -h / 2, w, h); x.strokeStyle = '#b8f0c2'; x.lineWidth = 2; x.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
        x.fillStyle = '#d7ffe0'; x.font = `800 ${14 * p.s}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('₹', 0, 1);
      } else { const r = 14 * p.s; x.fillStyle = '#f2c14e'; x.beginPath(); x.ellipse(0, 0, r, r * Math.abs(Math.cos(p.sw)) + 2, 0, 0, 6.283); x.fill(); x.strokeStyle = '#fff3b0'; x.lineWidth = 2; x.stroke(); }
      x.restore();
    }
    if (now - t0 < ms && document.getElementById('rain') === cv) requestAnimationFrame(frame); else x.clearRect(0, 0, W, H);
  })(t0);
}
function coins() {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const ac = audio, t = ac.currentTime;
    for (let k = 0; k < 9; k++) { const o = ac.createOscillator(), g = ac.createGain(), at = t + 0.05 + k * 0.11 + Math.random() * 0.04;
      o.type = 'square'; o.frequency.setValueAtTime(1800 + Math.random() * 900, at); g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.07, at + .006); g.gain.exponentialRampToValueAtTime(.0001, at + .16);
      o.connect(g).connect(ac.destination); o.start(at); o.stop(at + .18); }
  } catch {}
}
function showBidFx(t, amt) {
  const b = $('#bidfx'), col = accentOf(t.color);
  b.style.setProperty('--bc', col); b.style.setProperty('--bink', ink(col));
  b.innerHTML = `${badge(t)}<div><b>${esc(t.team_name)}</b><span>${t.id === me ? 'You bid' : 'bids'} ${money(amt)}</span></div>`;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  clearTimeout(showBidFx.t); showBidFx.t = setTimeout(() => b.classList.remove('go'), 1900);
  const lot = document.getElementById('lot');
  if (lot && !reduce()) lot.animate([{ boxShadow: `0 0 0 0 ${col}` }, { boxShadow: `0 0 0 22px transparent` }], { duration: 720, easing: 'ease-out' });
  blip(t);
}
function blip(t) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const ac = audio, now = ac.currentTime, f = 520 + (S.teams.indexOf(t) % 6) * 70, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 1.5, now + .09);
    g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(.22, now + .015); g.gain.exponentialRampToValueAtTime(.0001, now + .2);
    o.connect(g).connect(ac.destination); o.start(now); o.stop(now + .22);
  } catch {}
}

const GAVEL = `<svg viewBox="0 0 400 300" aria-hidden="true"><defs>
<linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6a56a"/><stop offset="1" stop-color="#8d6234"/></linearGradient>
<linearGradient id="gh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a5128"/><stop offset=".45" stop-color="#e0b077"/><stop offset="1" stop-color="#7a5128"/></linearGradient></defs>
<ellipse cx="155" cy="288" rx="125" ry="8" fill="rgba(0,0,0,.5)"/><rect x="60" y="255" width="190" height="28" rx="9" fill="url(#gw)"/>
<g class="fx-hammer"><rect x="150" y="207" width="190" height="16" rx="8" fill="url(#gw)"/><rect x="118" y="172" width="46" height="83" rx="9" fill="url(#gh)"/>
<rect x="114" y="186" width="54" height="9" rx="3" fill="#5a3a1a"/><rect x="114" y="232" width="54" height="9" rx="3" fill="#5a3a1a"/></g></svg>`;

function thud(sold) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const ac = audio, t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(sold ? 180 : 120, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.22);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.34);
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ac.createBufferSource(), g2 = ac.createGain(); g2.gain.value = 0.45; s.buffer = b; s.connect(g2).connect(ac.destination); s.start(t);
    if (sold) [659, 880].forEach((f, k) => { const q = ac.createOscillator(), h = ac.createGain(), at = t + 0.14 + k * 0.1; q.type = 'triangle'; q.frequency.value = f;
      h.gain.setValueAtTime(0.0001, at); h.gain.exponentialRampToValueAtTime(0.22, at + 0.02); h.gain.exponentialRampToValueAtTime(0.0001, at + 0.35); q.connect(h).connect(ac.destination); q.start(at); q.stop(at + 0.4); });
  } catch {}
}

function fireHammer(r) {
  const tm = r.status === 'SOLD' ? T(r.team_id) : null;
  if (tm && tm.franchise && FR[tm.franchise] && !reduce()) return fireFranchise(r, tm);
  const sold = r.status === 'SOLD', t = sold ? T(r.team_id) : null, col = t ? accentOf(t.color) : '#9aa0b4', fx = $('#fx'), rm = reduce();
  clearTimeout(fireHammer.a); clearTimeout(fireHammer.b); clearTimeout(fireHammer.c);
  fx.className = sold ? '' : 'unsold';
  fx.innerHTML = `<div class="fx-stage" style="--fc:${col}"><div class="fx-stamp"><div class="w">${sold ? 'Sold' : 'Unsold'}</div><div class="n">${esc(r.player.name)}</div>
    ${sold && t ? `<div class="p">${badge(t, 'sm')}<span>${esc(r.team)} for ${money(r.price)}</span></div>` : ''}</div>
    <div class="fx-g" id="fxg">${GAVEL}<div class="fx-ring" id="fxr"></div></div></div>`;
  fx.classList.add('on');
  fireHammer.a = setTimeout(() => {
    thud(sold);
    if (rm) return;
    const g = document.getElementById('fxg'); if (!g) return;
    g.classList.add('shake'); document.getElementById('fxr').classList.add('go');
    if (sold) for (let i = 0; i < 38; i++) {
      const p = document.createElement('i'), ang = (-170 + Math.random() * 160) * Math.PI / 180, dist = 110 + Math.random() * 230;
      p.className = 'fx-p'; p.style.background = [col, col, '#ecebe4', '#c19257'][i % 4];
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px'); p.style.setProperty('--dy', Math.sin(ang) * dist + 60 * Math.random() + 'px'); p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.animationDelay = Math.random() * 0.06 + 's'; g.appendChild(p);
    }
  }, rm ? 0 : 780);
  fireHammer.b = setTimeout(() => fx.classList.add('out'), 2650);
  fireHammer.c = setTimeout(() => { fx.className = ''; fx.innerHTML = ''; }, 3000);
}

// ---------- read more popup for ranking sections ----------
function openRk(tid, key) {
  const g = (S.ranking || []).find((x) => x.team === tid), t = T(tid); if (!g || !t) return;
  const x = key === 'impact' ? g.impact && { label: 'Impact player' + (g.impact.name ? ': ' + g.impact.name : ''), ...g.impact }
    : key === 'bench' ? g.bench && { label: 'Bench strength', ...g.bench } : g.cats.find((c) => c.key === key);
  if (!x) return;
  closeRk();
  const d = document.createElement('div'); d.id = 'rkpop'; d.className = 'rkpop';
  d.innerHTML = `<div class="rkbox" role="dialog" aria-modal="true"><button class="rkx" data-act="rkclose" aria-label="Close">×</button>
    <div class="sub">${esc(t.team_name)}${key === 'impact' || key === 'bench' ? ' · not counted in the XI score' : ''}</div>
    <h3>${esc(x.label)} <span class="vd v${esc((x.verdict || '').replace(/\W/g, ''))}">${esc(x.verdict)} · ${x.score}</span></h3>
    <p>${esc(x.summary)}</p>
    <h4>Strengths</h4><ul class="pcl">${x.pros.map((l) => `<li class="up">▲ ${esc(l)}</li>`).join('')}</ul>
    <h4>Concerns</h4><ul class="pcl">${x.cons.map((l) => `<li class="dn">▼ ${esc(l)}</li>`).join('')}</ul></div>`;
  d.addEventListener('click', (e) => { if (e.target === d) closeRk(); });
  document.body.appendChild(d);
}
const closeRk = () => { const d = document.getElementById('rkpop'); if (d) d.remove(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRk(); });

// ---------- franchise sold animation: flag, wall breaks, jersey and SOLD ----------
let frRaf = 0;
function fireFranchise(r, t) {
  const fx = $('#fx'), f = FR[t.franchise], c1 = f.c1, c2 = f.c2, col = accentOf(t.color);
  cancelAnimationFrame(frRaf); clearTimeout(fireHammer.a); clearTimeout(fireHammer.b); clearTimeout(fireHammer.c);
  const flag = f.flag ? `<div class="frflag img" style="background-image:url(${f.flag})"></div>`
    : `<div class="frflag" style="background:linear-gradient(135deg,${c1},${c2})">${f.logo ? `<img class="frmark" src="${f.logo}" alt="">` : `<b class="frmark">${esc(t.franchise)}</b>`}</div>`;
  fx.className = 'fr';
  fx.innerHTML = `<div class="frx" style="--fc:${col}">${flag}<div class="frsheen"></div><canvas id="frc"></canvas>
    <div class="frcard"><div class="frj">${jersey(r.player, c1, c2)}</div>
      <div class="frst"><div class="w">Sold</div><div class="n">${esc(r.player.name)}</div>
      <div class="p">${badge(t, 'sm')}<span>${esc(r.team)} for ${money(r.price)}</span></div></div></div></div>`;
  fx.classList.add('on');
  const cv = document.getElementById('frc'), W = innerWidth, H = innerHeight, small = W < 700;
  cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const bw = small ? 110 : 96, bh = small ? 52 : 44, bricks = [], cx = W / 2, cy = H / 2;
  for (let y = 0, row = 0; y < H + bh; y += bh, row++) for (let x = -(row % 2) * bw / 2; x < W; x += bw) {
    const mx = x + bw / 2 - cx, my = y + bh / 2 - cy, d = Math.hypot(mx, my) || 1;
    bricks.push({ x, y, d, vx: mx / d * (5 + Math.random() * 7), vy: my / d * (5 + Math.random() * 7) - 4, vr: (Math.random() - .5) * .35, r: 0, sh: 0.8 + Math.random() * 0.35 });
  }
  const conf = []; const cols = [col, c1, c2, '#ffffff'];
  const BREAK = 600, T0 = performance.now();
  const crack = [...Array(9)].map((_, i) => { const a = i / 9 * Math.PI * 2 + Math.random() * .4; const pts = [[cx, cy]]; let x = cx, y = cy; for (let k = 0; k < 7; k++) { x += Math.cos(a + (Math.random() - .5) * .7) * (40 + Math.random() * 60); y += Math.sin(a + (Math.random() - .5) * .7) * (40 + Math.random() * 60); pts.push([x, y]); } return pts; });
  let crashed = false, confetti = false;
  const maxD = Math.hypot(cx, cy);
  function frame(now) {
    const t = now - T0; g.clearRect(0, 0, W, H);
    if (t < BREAK) {
      const shake = t > 300 ? (Math.random() - .5) * 5 : 0; g.save(); g.translate(shake, shake);
      for (const b of bricks) { g.fillStyle = `hsl(${(parseInt(c1.slice(1), 16) % 40) + 10},18%,${(16 * b.sh) | 0}%)`; g.fillRect(b.x + 1, b.y + 1, bw - 2, bh - 2); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(b.x + 1, b.y + 1, bw - 2, 3); }
      const prog = Math.min(1, Math.max(0, (t - 180) / 380)); g.strokeStyle = '#05060a'; g.lineWidth = 3; g.lineCap = 'round';
      for (const pts of crack) { g.beginPath(); const n = Math.max(1, Math.floor(prog * pts.length)); g.moveTo(...pts[0]); for (let i = 1; i < n; i++) g.lineTo(...pts[i]); g.stroke(); }
      g.restore();
    } else {
      if (!crashed) { crashed = true; thud(true); crash(); }
      const k = (t - BREAK) / 16.7; let live = 0;
      for (const b of bricks) {
        const x = b.x + b.vx * k * 2.4, y = b.y + b.vy * k * 2.4 + 0.5 * 0.5 * k * k * 0.5, a = Math.max(0, 1 - (t - BREAK) / 900);
        if (a <= 0) continue; live++;
        g.save(); g.globalAlpha = a; g.translate(x + bw / 2, y + bh / 2); g.rotate(b.vr * k); g.fillStyle = `hsl(${(parseInt(c1.slice(1), 16) % 40) + 10},18%,${(16 * b.sh) | 0}%)`; g.fillRect(-bw / 2, -bh / 2, bw - 2, bh - 2); g.restore();
      }
      if (t > 1250 && !confetti) { confetti = true; for (let i = 0; i < (small ? 46 : 90); i++) conf.push({ x: Math.random() * W, y: -20 - Math.random() * H * .4, vy: 2 + Math.random() * 3.5, vx: (Math.random() - .5) * 2, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[i % 4], w: 6 + Math.random() * 6 }); }
      for (const q of conf) { q.x += q.vx; q.y += q.vy; q.r += q.vr; g.save(); g.translate(q.x, q.y); g.rotate(q.r); g.fillStyle = q.c; g.fillRect(-q.w / 2, -2, q.w, 4); g.restore(); }
    }
    if (t < 3500) frRaf = requestAnimationFrame(frame);
  }
  frRaf = requestAnimationFrame(frame);
  fireHammer.b = setTimeout(() => fx.classList.add('out'), 3250);
  fireHammer.c = setTimeout(() => { cancelAnimationFrame(frRaf); fx.className = ''; fx.innerHTML = ''; }, 3600);
}
function crash() {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const ac = audio, t = ac.currentTime, b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.6), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const s = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1400; g.gain.value = 0.7; s.buffer = b; s.connect(fl).connect(g).connect(ac.destination); s.start(t);
  } catch {}
}

// ---------- input handling ----------
document.addEventListener('input', (e) => {
  const id = e.target.id; if (!id) return;
  if (id === 'cb_amt') { const v = e.target.value.replace(/[^0-9.,]/g, ''); if (v !== e.target.value) e.target.value = v; }
  draft[id] = e.target.value;
  if (id === 'q') { cache.stage = null; render(); }
});
document.addEventListener('change', (e) => {
  const id = e.target.id; if (!id) return;
  draft[id] = e.target.value;
  if (id === 's_mix') { cache.stage = null; render(); }
  if (id === 's_st') { draft.s_g = ''; cache.stage = null; render(); }
  if (id === 'selteam') { selTeam = e.target.value; selShowAll = false; cache.stage = null; render(); }
  if (id === 't_to') { tdraft.get.clear(); render(); }
  if (id === 'e_color') { entry.color = e.target.value; setHTML('entry', entryHTML()); }
});
function saveSelectionSoon() {
  selSaved = false; clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { send({ action: 'select_players', ids: [...selDraft], wish: [...wishDraft] }); selSaved = true; const m = $('#savedmsg'); if (m) m.textContent = 'Your picks are saved.'; }, 350);
}
const el$ = (id) => document.getElementById(id);
const toggle = (set, id) => (set.has(id) ? set.delete(id) : set.add(id));
function readSettings() {
  return { purse: Math.round(parseFloat(el$('s_purse').value) * 100), base_price: Math.round(parseFloat(el$('s_base').value) * 100), bid_timer: +el$('s_timer').value,
    increments: el$('s_inc').value.split(',').map((x) => +x.trim()).filter((x) => x > 0), squad_size: +el$('s_sq').value, max_overseas: +el$('s_os').value,
    selection_window: +el$('s_win').value, mix: el$('s_mix').value === '1', pool_order: [0, 1, 2, 3].map((i) => el$('p' + i).value), state: el$('s_st').value, ground: el$('s_g').value, conditions: el$('s_cond').value };
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = +el.dataset.id;
  if (act === 'home') e.preventDefault();
  switch (act) {
    case 'mode': entry.mode = el.dataset.m; return setHTML('entry', entryHTML());
    case 'pickfr': entry.fr = el.dataset.fr; return setHTML('entry', entryHTML());
    case 'create': case 'join': {
      const name = el$('e_name').value, team = entryTeamName(), code = el$('e_code')?.value || '';
      if (!name.trim() || !team) return toast('Enter your name and choose a team.');
      return connect({ action: act, name, team_name: team, code, color: entry.color });
    }
    case 'copylink': {
      const url = inviteUrl(S.code);
      const done = () => toast('Invite link copied. Send it to your friends.');
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(url).then(done, () => toast(url)); return; }
      const i = document.querySelector('.invite input'); if (i) { i.select(); try { document.execCommand('copy'); return done(); } catch {} } return toast(url);
    }
    case 'home': {                                       // back to the start screen; your team stays saved so you can rejoin
      if (!S) return;
      if (!confirm('Go to the home screen? Your team stays in the room and you can rejoin from the home screen.')) return;
      wasLeft = true; try { sessionStorage.setItem('iplhome', '1'); } catch {}
      clearTimeout(retryT); if (ws) ws.close();
      S = null; me = null; for (const k of ['topr', 'stage', 'teams', 'xi', 'trade']) { cache[k] = null; document.getElementById(k).innerHTML = ''; }
      document.body.classList.remove('live', 'hot'); setHTML('entry', entryHTML()); $('#entry').hidden = false; window.scrollTo(0, 0); return;
    }
    case 'rejoin': {
      wasLeft = false; try { sessionStorage.removeItem('iplhome'); } catch {} const s = store.get('ipl'); return connect({ action: 'rejoin', code: s.code, token: s.token }); }
    case 'custombid': {
      const cr = parseFloat(String(el$('cb_amt').value).replace(',', '.')); if (!(cr > 0)) return toast('Type an amount in Cr, for example 15.');
      send({ action: 'bid', amount: Math.round(cr * 100) }); draft.cb_amt = ''; el$('cb_amt').value = ''; return;
    }
    case 'sound': soundOn = !soundOn; store.set('iplsound', soundOn); if (soundOn) thud(false); return render();
    case 'savesettings': return send({ action: 'update_settings', settings: readSettings() });
    case 'startsel': send({ action: 'update_settings', settings: readSettings() }); return setTimeout(() => send({ action: 'start_selection' }), 150);
    case 'tab': selTab = el.dataset.t; cache.stage = null; return render();
    case 'pick': toggle(selDraft, id); if (!selDraft.has(id)) wishDraft.delete(id); saveSelectionSoon(); cache.stage = null; return render();
    case 'wish': if (wishDraft.has(id)) wishDraft.delete(id); else { wishDraft.add(id); selDraft.add(id); } saveSelectionSoon(); cache.stage = null; return render();
    case 'showall': selShowAll = true; cache.stage = null; return render();
    case 'teamall': {
      const ids = S.players.filter((p) => selTeam === 'other' ? !p.team : p.team === selTeam).map((p) => p.id), all = ids.every((i) => selDraft.has(i));
      ids.forEach((i) => { if (all) { selDraft.delete(i); wishDraft.delete(i); } else selDraft.add(i); });
      saveSelectionSoon(); cache.stage = null; return render();
    }
    case 'wishx': return hideWishFx();
    case 'backlobby': selDraft = null; wishDraft = null; cache.stage = null; return send({ action: 'back_to_lobby' });
    case 'closesel': return send({ action: 'close_selection' });
    case 'startauc': return send({ action: 'start_auction' });
    case 'rkmore': return openRk(el.dataset.t, el.dataset.k);
    case 'rkclose': return closeRk();
    case 'nextpool': return send({ action: 'next_pool', pool: el.dataset.pool });
    case 'pause': case 'resume': return send({ action: act });
    case 'reauc': return send({ action: 'reauction' });
    case 'endauc':
      if (!endArm) { endArm = true; clearTimeout(endT); endT = setTimeout(() => { endArm = false; if (S) render(); }, 4000); return render(); }
      endArm = false; clearTimeout(endT); return send({ action: 'end_auction' });
    case 'bid': return send({ action: 'bid', increment: el.dataset.inc ? +el.dataset.inc : null });
    case 'pass': return send({ action: 'not_interested' });
    case 'xup': return lineupShift(id, -1);
    case 'xdn': return lineupShift(id, 1);
    case 'xadd': return lineupMove(id, 'xi');
    case 'xrm': return lineupMove(id, 'bench');
    case 'ximp': return lineupMove(id, 'imp');
    case 'ximprm': return lineupMove(id, 'bench');
    case 'xcap': lineup.cap = lineup.cap === id ? null : id; return render();
    case 'xwk': lineup.wk = lineup.wk === id ? null : id; return render();
    case 'xclear': lineup = { xi: [], imp: null, cap: null, wk: null }; return render();
    case 'xauto': suggestXI(T(me)); lastMoved = null; return render();
    case 'xsave': { const st = lineupState(T(me)); xiSaving = true; return send({ action: 'set_xi', xi: st.xi.map((p) => p.id), impact: st.imp ? st.imp.id : null, captain: st.cap, keeper: st.wk }); }
    case 'tg': toggle(tdraft.give, id); return render();
    case 'tw': toggle(tdraft.get, id); return render();
    case 'propose':
      send({ action: 'propose_trade', to: el$('t_to').value, give: [...tdraft.give], get: [...tdraft.get], cash: tradeCash() });
      tdraft = { give: new Set(), get: new Set() }; draft.t_cash = '0'; return setTimeout(render, 50);
    case 'tcnt': {
      const tr = S.trades.find((x) => x.id === id); if (!tr) return;
      counterOf = id; draft.t_to = tr.from; tdraft = { give: new Set(tr.get.map((p) => p.id)), get: new Set(tr.give.map((p) => p.id)) };
      draft.t_dir = tr.cash > 0 ? 'recv' : 'pay'; draft.t_cash = String(Math.abs(tr.cash) / 100); render();
      const tp = document.getElementById('tradepanel'); return tp && tp.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    case 'tsendcnt':
      send({ action: 'counter_trade', trade_id: counterOf, give: [...tdraft.give], get: [...tdraft.get], cash: tradeCash() });
      counterOf = null; tdraft = { give: new Set(), get: new Set() }; draft.t_cash = '0'; draft.t_dir = 'pay'; return setTimeout(render, 50);
    case 'tcntx': counterOf = null; tdraft = { give: new Set(), get: new Set() }; draft.t_cash = '0'; return render();
    case 'rmteam': {
      const tid = el.dataset.tid;
      if (rmArm !== tid) { rmArm = tid; clearTimeout(rmT); rmT = setTimeout(() => { rmArm = null; if (S) render(); }, 4000); cache.stage = null; return render(); }
      rmArm = null; clearTimeout(rmT); cache.stage = null; return send({ action: 'remove_team', team: tid });
    }
    case 'tgo': { const tp = document.getElementById('tradepanel'); return tp && tp.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    case 'xsaveteam': xiSaving = true; return send({ action: 'save_team' });
    case 'tacc': return send({ action: 'respond_trade', trade_id: id, accept: true });
    case 'trej': return send({ action: 'respond_trade', trade_id: id, accept: false });
    case 'tcan': return send({ action: 'cancel_trade', trade_id: id });
  }
});

fetch('/api/meta').then((r) => r.json()).then((f) => { FR = f; setHTML('entry', entryHTML()); });
{ let atHome = false; try { atHome = sessionStorage.getItem('iplhome') === '1'; } catch {}
  const sv = store.get('ipl'); if (sv && !atHome && (!inviteCode || inviteCode === sv.code)) connect({ action: 'rejoin', code: sv.code, token: sv.token }); }   // reload keeps you in your room
startDust();

// ---------- drag and drop for the XI builder ----------
let dragId = null;
document.addEventListener('dragstart', (e) => { const c = e.target.closest && e.target.closest('.xc'); if (!c) return; dragId = +c.dataset.pid; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', String(dragId)); e.dataTransfer.effectAllowed = 'move'; } catch {} });
document.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.dragging,.over').forEach((x) => x.classList.remove('dragging', 'over')); });
document.addEventListener('dragover', (e) => { const z = e.target.closest && e.target.closest('.xzone'); if (!z || dragId == null) return; e.preventDefault(); document.querySelectorAll('.xzone.over').forEach((x) => x !== z && x.classList.remove('over')); z.classList.add('over'); });
document.addEventListener('drop', (e) => {
  const z = e.target.closest && e.target.closest('.xzone'); if (!z || dragId == null) return; e.preventDefault();
  const id = dragId; dragId = null; document.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
  const card = e.target.closest('.xc');
  if (card && +card.dataset.pid !== id && (z.dataset.zone === 'xi' || card.classList.contains('bench') || card.classList.contains('imp'))) return lineupSwap(id, +card.dataset.pid);
  lineupMove(id, z.dataset.zone);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'cb_amt') { e.preventDefault(); const b = document.querySelector('[data-act="custombid"]'); if (b && !b.disabled) b.click(); }
});
