// หน้าเว็บ บิดไปสมาชิก v2.0 — state เดียว S, render() สร้างหน้าใหม่จาก state ทุกครั้ง
// อ้างหัวข้อ 10 ของ spec v2.0 · ข้อมูลลับมาตามสิทธิ์จาก server เท่านั้น
(function () {
  'use strict';
  const CFG = window.BNRL_CONFIG;
  const KEY = 'bnrl-session';
  const socket = io();
  const S = {
    st: null, session: null, spectating: null, connected: false, everConnected: false,
    cards: new Map(), cardsReady: false, offset: 0, drafts: {}, confirmLeave: false,
    ui: { remain: false, hist: false, histTab: 'auction', histA: null, menu: false, modal: null, modelTab: 'animal', score: true, allIn: false, kick: null },
    models: [], firstTurnSeen: {}, chipsSeen: {}, banner: null, flipped: {}
  };

  // ---------- util ----------
  const $ = sel => document.querySelector(sel);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* */ } }
  };
  let toastT = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const reqId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  function send(ev, data, cb) {
    socket.emit(ev, data || {}, res => {
      if (!res) return;
      if (!res.ok && res.code !== 'DUPLICATE_REQUEST') toast(res.error || 'เกิดข้อผิดพลาด');
      cb && cb(res);
    });
  }
  let busy = false;
  const act = (type, extra) => send('action', { type, requestId: reqId(), ...(extra || {}) }, () => { busy = false; });
  const card = id => S.cards.get(id) || { id, name: id, power: 0 };
  const P = id => (S.st && S.st.players.find(p => p.id === id)) || { name: '?', seat: 0 };
  const color = pid => CFG.PLAYER_COLORS[(P(pid).seat || 0) % CFG.PLAYER_COLORS.length];
  const artUrl = id => `/cards/art/${encodeURIComponent(id)}.webp?v=${(window.CardKit && CardKit.version()) || ''}`;
  const thumbUrl = id => `/models/thumbs/${encodeURIComponent(id)}.webp`;
  const digits = v => String(v == null ? '' : v).replace(/\D/g, '').slice(0, 4);
  const roomFromUrl = () => { try { return digits(new URLSearchParams(location.search).get('room')); } catch (e) { return ''; } };
  const now = () => Date.now() + S.offset;
  const Snd = window.Sound || { play() {}, engine() {}, bgm() {}, vibrate() {}, get: () => null, set() {}, unlock() {} };
  const vib = p => Snd.vibrate(p);

  const MODE = {
    classic: { n: 'Classic', d: 'ผู้ชนะจ่ายคนเดียว ได้คันแรงสุด ที่เหลือแจกตามที่นั่งถัดไป (ฟรี)' },
    chaos: { n: 'Chaos', d: 'ทุกคนจ่ายเท่าที่ bid ไป · ลงมากได้คันแรงกว่า · คนลง 0 ใคร pass ก่อนได้คันอ่อนกว่า' },
    shadow: { n: 'Shadow Auction', d: 'ใส่ราคาลับพร้อมกันครั้งเดียว · ทุกคนจ่ายตามที่ใส่ · ราคาสูงได้คันแรง' }
  };
  const TOG = {
    nitro: { n: 'Nitro', d: `เอา Coins ที่เหลือเติม Power ตอนแข่ง (1 Coin = +${CFG.NITRO_POWER_PER_COIN} สูงสุด ${CFG.NITRO_MAX_COINS})` },
    refund: { n: 'Refund', d: `คนไม่ชนะได้คืนครึ่งของที่ลง · คันอ่อนสุด +${CFG.REFUND_BONUS_LAST} · รองสุดท้าย +${CFG.REFUND_BONUS_SECOND_LAST}` },
    campaign: { n: 'Grand Campaign', d: 'บาง Race มีเหตุการณ์พิเศษ เปิดเผยก่อนเลือกรถ' },
    mystery: { n: 'Mystery Car', d: 'คว่ำรถ 1 คันต่อชุด เปิดตอนประกาศผลประมูล' },
    suddenDeath: { n: 'Sudden Death', d: 'คะแนนเสมอตอนจบ → แข่งตัดสินอีก 1 Race' }
  };
  const EV = {
    reverse: { n: 'Reverse', i: '⇄', d: 'Power รวมต่ำสุดชนะ · Nitro กลายเป็นลบ' },
    double: { n: 'Double Prize', i: '×2', d: `Prize ×${CFG.DOUBLE_PRIZE_MULT} ทุกอันดับ` },
    rain: { n: 'Rain', i: '☂', d: `รถ Power เดิม ${CFG.RAIN_THRESHOLD} ขึ้นไปถูกลด −${CFG.RAIN_PENALTY}` },
    frenzy: { n: 'Nitro Frenzy', i: '⚡', d: `Nitro แรง ×${CFG.FRENZY_MULT} (+${CFG.NITRO_POWER_PER_COIN * CFG.FRENZY_MULT} ต่อ Coin)` },
    ban: { n: 'Nitro Ban', i: '⛔', d: 'ห้ามใช้ Nitro ใน Race นี้' },
    wta: { n: 'Winner Takes All', i: '🏆', d: 'ที่ 1 ได้ Prize รวมทั้งหมด คนอื่นได้ 0' },
    fog: { n: 'Fog', i: '☁', d: 'ไม่เห็น Prize จนกว่าจะเปิดผล' },
    lucky: { n: 'Lucky Boost', i: '🎲', d: `ทุกคันได้ +${CFG.LUCKY_MIN}–${CFG.LUCKY_MAX} แบบสุ่มลับ` },
    underdog: { n: 'Underdog', i: '⬆', d: `คันที่ Power เดิมต่ำสุดในสนามได้ +${CFG.UNDERDOG_BONUS}` }
  };
  const SCENE = { night: 'กลางคืน', desert: 'ทะเลทราย', snow: 'หิมะ', neon: 'นีออน' };

  // ---------- การ์ด / โมเดล ----------
  CardKit.load().then(d => { d.cards.forEach(c => S.cards.set(c.id, c)); S.cardsReady = true; render(); })
    .catch(() => { S.cardsReady = true; render(); });
  fetch('/api/models').then(r => r.json()).then(d => { S.models = d.models || []; window.Race3D && Race3D.setCatalog(d); render(); }).catch(() => {});
  const modelMeta = id => S.models.find(m => m.id === id) || { id, name: id || '-', tab: 'vehicle' };
  const cardEls = new Map();
  function cardBox(id, where, w, extra) {
    const c = card(id), x = extra || {};
    const cap = id === 'mystery' ? '<div class="cap"><b>?</b> Mystery Car</div>' : `<div class="cap" title="${esc(c.name)} · ${esc(c.power)}"><b>${esc(c.power)}</b> ${esc(c.name)}</div>`;
    return `<div class="cardbox ${w ? 'w' + w : 'fill'} ${x.cls || ''}" ${x.attrs || ''}><div class="cslot" data-card="${esc(id)}" data-where="${esc(where)}"></div>` +
      (x.cap === false ? '' : cap) + `${x.after || ''}</div>`;
  }
  function placeCards() {
    document.querySelectorAll('.cslot[data-card]').forEach(slot => {
      const key = slot.dataset.where + ':' + slot.dataset.card;
      let el = cardEls.get(key);
      const fresh = !el;
      if (!el) { el = slot.dataset.card === 'mystery' ? CardKit.back() : CardKit.render(card(slot.dataset.card)); cardEls.set(key, el); }
      slot.appendChild(el);
      if (!fresh && el.querySelector('[data-fit-pending]')) CardKit.fitAll(el);
    });
    if (cardEls.size > 600) cardEls.clear();
  }

  // ---------- socket ----------
  socket.on('connect', () => {
    S.connected = true; S.everConnected = true;
    const s = store.get();
    if (s && s.code && s.playerId) {
      send('resume', s, res => { if (!res.ok) { store.clear(); S.session = null; S.st = null; render(); } else S.session = s; });
    } else if (S.spectating) send('spectate', { code: S.spectating });
    render();
  });
  socket.on('disconnect', () => { S.connected = false; render(); });
  socket.on('kicked', d => { // R-7-74
    toast(d && d.lobby ? 'เจ้าของห้องเอาคุณออกจากห้อง' : 'เจ้าของห้องให้คุณออกจากเกม — ระบบเล่นแทนจนจบ');
    if (d && d.lobby) { store.clear(); S.session = null; S.st = null; history.replaceState(null, '', '/'); render(); }
  });
  socket.on('state', st => {
    const prev = S.st;
    S.st = st; S.offset = st.serverNow - Date.now();
    if (st.phase === 'gameOver' || st.phase === 'cancelled') S.lastOver = st;
    else if (st.phase !== 'lobby') S.lastOver = null;
    if (st.phase !== 'auction') { delete S.drafts.bid; delete S.drafts.bidSeq; S.ui.allIn = false; }
    if (st.phase !== 'shadowBid') delete S.drafts.shadow;
    try { onTransition(prev, st); } catch (e) { /* เสียง/ป้ายไม่ควรทำให้หน้าพัง */ }
    busy = false; render();
  });

  // ---------- เสียง / ป้ายแจ้งเตือนตามการเปลี่ยน state ----------
  function showBanner(text, cls) {
    S.banner = { text, cls, until: Date.now() + 1500 };
    setTimeout(() => { if (S.banner && Date.now() >= S.banner.until) { S.banner = null; render(); } }, 1550);
  }
  function onTransition(prev, st) {
    const me = st.me, a = st.auction, pa = prev && prev.auction;
    // BGM ตามช่วง
    Snd.bgm(st.phase === 'lobby' ? 'lobby' : ['gameOver', 'cancelled'].includes(st.phase) ? 'podium' : PH[st.phase] === 1 ? 'auction' : 'race');
    if (!prev) return;
    // bid / pass ของคนอื่น
    if (a && pa && a.no === pa.no && a.log && pa.log && a.log.length > pa.log.length) {
      const e = a.log[a.log.length - 1];
      if (e.kind === 'raise') { Snd.play('bid'); setTimeout(() => Snd.play('chip'), 380); } else Snd.play('pass');
    }
    // ถึงตาคุณ (R-10-14)
    const myTurn = st.phase === 'auction' && a && a.turnId && a.turnId === me && !st.myLeft && !st.paused;
    const wasMyTurn = prev.phase === 'auction' && pa && pa.turnId === me && pa.seq === (a && a.seq);
    if (myTurn && !wasMyTurn) { Snd.play('turn'); vib([80, 60, 80]); showBanner('ถึงตาคุณแล้ว!', 'turn'); }
    if (st.phase === 'shadowBid' && !st.intro && (prev.phase !== 'shadowBid' || prev.intro) && me && !st.myLeft) { Snd.play('turn'); vib([80, 60, 80]); showBanner('ใส่ราคาลับได้แล้ว!', 'turn'); }
    if (st.phase === 'racePick' && !st.intro && (prev.phase !== 'racePick' || prev.intro) && me && !st.myLeft && !st.myConfirmed) {
      Snd.play('pick'); vib([60, 40, 60]); showBanner(st.race && st.race.nitroOnly ? 'ใส่ Nitro ได้แล้ว' : 'เลือกรถได้แล้ว', 'pick');
    }
    if (st.phase === 'auctionResult' && prev.phase !== 'auctionResult') {
      Snd.play('gavel'); setTimeout(() => Snd.play('sold'), 250);
      const res = st.auctionHistory[st.auctionHistory.length - 1];
      if (res && me && res.refund && res.refund[me]) setTimeout(() => Snd.play('refund'), 700);
    }
    if (st.phase === 'gameOver' && prev.phase !== 'gameOver') { Snd.play('fanfare'); vib([60, 40, 120]); }
    if (st.paused && !prev.paused) toast('เจ้าของห้องหยุดเกมชั่วคราว');
    if (!st.paused && prev.paused) toast('เล่นต่อแล้ว');
    if (prev.hostId !== st.hostId && st.hostId === me) toast('คุณเป็นเจ้าของห้องแล้ว');
  }

  // ---------- ตัวจับคลิกตัวเดียว ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    Snd.unlock();
    const a = b.dataset.act, st = S.st;
    const name = () => ($('#in-name') ? $('#in-name').value : '').trim();
    const code = () => digits($('#in-code') ? $('#in-code').value : '');
    const settings = data => act('lobby:settings', data);
    if (st && st.paused && /^(raise|pass|bid-|allin-|sh-|pick|nitro|confirm)/.test(a)) { toast('เกมหยุดชั่วคราวอยู่ — รอเจ้าของห้องกดเล่นต่อ'); return; }
    switch (a) {
      case 'create':
        if (!name()) return toast('ใส่ชื่อก่อน');
        send('create', { name: name() }, res => { if (res.ok) { S.session = { code: res.code, playerId: res.playerId, token: res.token }; store.set(S.session); history.replaceState(null, '', '?room=' + res.code); } });
        break;
      case 'join':
        if (!name() || !code()) return toast('ใส่ชื่อและรหัสห้อง');
        send('join', { name: name(), code: code() }, res => {
          if (!res.ok) return;
          history.replaceState(null, '', '?room=' + res.code);
          if (res.spectator) { S.spectating = res.code; toast(res.reason === 'ROOM_FULL' ? 'ห้องเต็มแล้ว — เข้าเป็นผู้ชม' : 'ห้องนี้กำลังเล่นอยู่ — เข้าเป็นผู้ชม'); }
          else { S.session = { code: res.code, playerId: res.playerId, token: res.token }; store.set(S.session); }
        });
        break;
      case 'fold': S.ui[b.dataset.key] = !S.ui[b.dataset.key]; render(); break;
      case 'tab': S.ui.histTab = b.dataset.tab; render(); break;
      case 'hist-a': S.ui.histA = Number(b.dataset.no); render(); break;
      case 'start': act('game:start'); break;
      case 'rounds-dec': case 'rounds-inc': {
        const v = st.rounds + (a === 'rounds-inc' ? 1 : -1);
        if (v >= CFG.ROUNDS_MIN && v <= st.roundsMax) act('lobby:rounds', { rounds: v });
        break;
      }
      case 'rounds-auto': act('lobby:rounds', { rounds: null }); break;
      case 'mode': settings({ mode: b.dataset.mode }); break;
      case 'toggle': settings({ toggles: { [b.dataset.key]: !st.settings.toggles[b.dataset.key] } }); break;
      case 'camp-all': settings({ campaignAll: !st.settings.campaignAll }); break;
      case 'coins-dec': case 'coins-inc': {
        const v = Math.max(CFG.COINS_OVERRIDE_MIN, Math.min(CFG.COINS_OVERRIDE_MAX, st.startCoins + (a === 'coins-inc' ? 1 : -1)));
        settings({ coinsOverride: v }); break;
      }
      case 'coins-reset': settings({ coinsOverride: null }); break;
      case 'scene': settings({ sceneLock: b.dataset.scene || null }); break;
      case 'model-tab': S.ui.modelTab = b.dataset.tab; render(); break;
      case 'model': act('lobby:model', { modelId: b.dataset.id }); Snd.play('click'); break;
      case 'model-rand': {
        const list = S.models.filter(m => m.tab === S.ui.modelTab); if (!list.length) break;
        act('lobby:model', { modelId: list[Math.floor(Math.random() * list.length)].id }); Snd.play('click'); break;
      }
      case 'kick': S.ui.kick = b.dataset.pid; render(); break;
      case 'kick-yes': act('host:kick', { target: S.ui.kick }); S.ui.kick = null; render(); break;
      case 'kick-no': S.ui.kick = null; render(); break;
      case 'host-to': act('host:transfer', { target: b.dataset.pid }); break;
      case 'pause': act('host:pause'); break;
      case 'resume': act('host:resume'); break;
      case 'skip': act('host:skip'); break;
      case 'to-lobby': {
        const live = S.st;
        if (live && (live.phase === 'gameOver' || live.phase === 'cancelled')) send('lobby', {});
        S.lastOver = null; render(); break;
      }
      case 'join-lobby': {
        if (!name()) return toast('ใส่ชื่อก่อน');
        send('join', { name: name(), code: st.code }, res => {
          if (res.ok && !res.spectator) { S.session = { code: res.code, playerId: res.playerId, token: res.token }; store.set(S.session); S.spectating = null; }
          else if (res.ok) toast('ห้องเต็มแล้ว');
        });
        break;
      }
      case 'copy': {
        const url = location.origin + '/?room=' + st.code;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('คัดลอกลิงก์แล้ว'), () => toast(url));
        break;
      }
      case 'menu': S.ui.menu = !S.ui.menu; render(); break;
      case 'menu-close': S.ui.menu = false; render(); break;
      case 'modal': S.ui.modal = b.dataset.m; S.ui.menu = false; render(); break;
      case 'modal-close': S.ui.modal = null; render(); break;
      case 'snd-toggle': Snd.set(b.dataset.key, !Snd.get(b.dataset.key)); render(); break;
      case 'fullscreen': {
        const d = document.documentElement;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else if (d.requestFullscreen) d.requestFullscreen().catch(() => toast('เบราว์เซอร์นี้เปิดเต็มจอไม่ได้'));
        else toast('เบราว์เซอร์นี้เปิดเต็มจอไม่ได้');
        break;
      }
      case 'leave':
        S.ui.menu = false;
        if (!S.confirmLeave && st && st.phase !== 'lobby' && !['gameOver', 'cancelled'].includes(st.phase) && !st.myLeft && st.me) { S.confirmLeave = true; render(); return; }
        send('leave', {}, () => {
          const lobby = !st || st.phase === 'lobby' || ['gameOver', 'cancelled'].includes(st.phase) || !st.me;
          if (lobby) { store.clear(); S.session = null; S.spectating = null; S.st = null; history.replaceState(null, '', '/'); }
          S.confirmLeave = false; render();
        });
        break;
      case 'leave-cancel': S.confirmLeave = false; render(); break;
      case 'home': S.ui.menu = false; S.lastOver = null; store.clear(); S.session = null; S.spectating = null; S.st = null; send('leave', {}); history.replaceState(null, '', '/'); render(); break;
      // ---- ประมูล ----
      case 'bid-dec': case 'bid-inc': {
        const a2 = st.auction, max = bidMax(st);
        const cur = $('#in-bid') ? Number($('#in-bid').value) : a2.minBid;
        const v = (Number.isFinite(cur) ? cur : a2.minBid) + (a === 'bid-inc' ? 1 : -1);
        S.drafts.bid = Math.max(a2.minBid, Math.min(max, v)); S.drafts.bidSeq = a2.seq; render(); break;
      }
      case 'bid-quick': { // F-19 +1/+2/+5/All-in
        const a2 = st.auction, max = bidMax(st);
        if (b.dataset.v === 'all') { S.ui.allIn = true; render(); break; }
        S.drafts.bid = Math.max(a2.minBid, Math.min(max, a2.currentBid + Number(b.dataset.v))); S.drafts.bidSeq = a2.seq; render(); break;
      }
      case 'allin-yes': if (busy) return; busy = true; S.ui.allIn = false; act('auction:raise', { amount: bidMax(st), auctionNo: st.auction.no, stateVersion: st.auction.seq }); break;
      case 'allin-no': S.ui.allIn = false; render(); break;
      case 'raise': {
        if (busy) return;
        const v = Number($('#in-bid') ? $('#in-bid').value : S.drafts.bid);
        busy = true; act('auction:raise', { amount: Math.floor(v), auctionNo: st.auction.no, stateVersion: st.auction.seq }); break;
      }
      case 'pass': if (busy) return; busy = true; act('auction:pass', { auctionNo: st.auction.no, stateVersion: st.auction.seq }); break;
      // ---- Shadow ----
      case 'sh-dec': case 'sh-inc': case 'sh-max': {
        const me = P(st.me); const cur = shadowDraft(st);
        const v = a === 'sh-max' ? me.coins : cur + (a === 'sh-inc' ? 1 : -1);
        S.drafts.shadow = Math.max(CFG.SHADOW_MIN_BID, Math.min(me.coins, v)); render(); break;
      }
      case 'sh-confirm': {
        if (busy) return; busy = true;
        const v = Number($('#in-shadow') ? $('#in-shadow').value : shadowDraft(st));
        send('action', { type: 'shadow:bid', amount: Math.floor(v), auctionNo: st.auction.no, requestId: reqId() }, res => {
          if (res.ok) act('shadow:confirm', { auctionNo: st.auction.no }); else busy = false;
        });
        break;
      }
      // ---- เลือกรถ + Nitro ----
      case 'pick': act('race:select', { cardId: b.dataset.card, raceNo: st.race.no }); Snd.play('click'); break;
      case 'nitro': act('race:select', { nitro: Number(b.dataset.v), raceNo: st.race.no, ...(st.myPick ? {} : {}) }); Snd.play('click'); break;
      case 'confirm': if (busy) return; busy = true; act('race:confirm', { raceNo: st.race.no }); break;
    }
  });
  document.addEventListener('keydown', e => {
    const t = e.target.closest && e.target.closest('[role="button"][data-act]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); }
    if (e.key === 'Escape' && (S.ui.menu || S.ui.modal)) { S.ui.menu = false; S.ui.modal = null; render(); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'in-bid') { S.drafts.bid = e.target.value; S.drafts.bidSeq = S.st && S.st.auction ? S.st.auction.seq : null; }
    if (e.target.id === 'in-shadow') S.drafts.shadow = Number(e.target.value);
    if (e.target.id === 'in-name') S.drafts.name = e.target.value;
    if (e.target.id === 'in-code') S.drafts.code = e.target.value;
    if (e.target.dataset && e.target.dataset.vol) { Snd.set(e.target.dataset.vol, Number(e.target.value) / 100); }
  });
  const bidMax = st => { const me = P(st.me), a = st.auction; return st.settings.mode === 'chaos' ? me.coins + (a.committed[st.me] || 0) : me.coins; };
  const shadowDraft = st => { const me = P(st.me); const d = S.drafts.shadow != null ? S.drafts.shadow : st.myBid != null ? st.myBid : CFG.SHADOW_MIN_BID; return Math.max(CFG.SHADOW_MIN_BID, Math.min(me.coins, Number(d) || CFG.SHADOW_MIN_BID)); };

  // ---------- เวลา (คำนวณจาก endsAt ของ server — R-10-02) ----------
  function remainMs() { return S.st && S.st.endsAt && !introStep() && !['raceRun'].includes(S.st.phase) ? Math.max(0, S.st.endsAt - now()) : null; }
  function remain() { const m = remainMs(); return m == null ? null : Math.ceil(m / 1000); }
  const phaseTotal = st => ({ auction: CFG.BID_TURN_SECONDS, shadowBid: CFG.SHADOW_BID_SECONDS, racePick: CFG.PICK_SECONDS })[st.phase] || null;
  let tickKey = '', lastTickSec = null;
  setInterval(() => {
    const st = S.st;
    const s = introStep();
    let k = s ? s.kind + s.no + (s.kind === 'lot' ? ':' + lotIndex(s) : '') : '';
    if (st && st.phase === 'raceResult') k += ':f' + podiumCount(st);
    if (st && st.phase === 'shadowReveal') k += ':g' + revealCount(st);
    if (S.banner && Date.now() >= S.banner.until) { S.banner = null; k += ':b'; }
    if (k !== tickKey) { const old = tickKey; tickKey = k; onTick(old, k, s); render(); }
    const r = remain();
    document.querySelectorAll('.js-timer').forEach(el => { el.textContent = r == null ? '' : r; el.classList.toggle('low', r != null && r <= CFG.WARNING_SECONDS); });
    document.querySelectorAll('[data-ring]').forEach(el => {
      const tot = phaseTotal(st || {}), ms = remainMs();
      const f = tot && ms != null ? Math.max(0, Math.min(1, ms / (tot * 1000))) : 0;
      el.style.setProperty('--f', f.toFixed(3));
    });
    updateWarn(r);
    if (r != null && r <= CFG.WARNING_SECONDS && r > 0 && r !== lastTickSec && needsMe(st)) { lastTickSec = r; Snd.play('tick'); }
  }, 250);
  function onTick(old, k, s) {
    if (!s) return;
    if (s.kind === 'campaign' && !old.startsWith('campaign')) { Snd.play('campaign-' + s.event); vib(80); }
    if (s.kind === 'lot' && old !== k) Snd.play('flip');
    if (s.kind === 'sudden' && !old.startsWith('sudden')) { Snd.play('campaign-wta'); }
  }
  // ผู้เล่นคนนี้ต้องทำอะไรตอนนี้ไหม (ใช้กับเสียงติ๊กและป๊อปอัป)
  function needsMe(st) {
    if (!st || !st.me || st.myLeft || st.paused) return false;
    if (st.phase === 'auction') return st.auction && st.auction.turnId === st.me;
    if (st.phase === 'shadowBid') return !st.myBidConfirmed && !(st.auction.broke || []).includes(st.me);
    if (st.phase === 'racePick') return st.race && (!st.race.participants || st.race.participants.includes(st.me)) && !st.myConfirmed && (!(st.race.last || st.race.sudden) || st.race.nitroOnly);
    return false;
  }

  // ---------- ป๊อปอัปเตือนเวลา — ไม่บังการกด ----------
  const warnEl = document.createElement('div');
  warnEl.className = 'warn'; warnEl.hidden = true; warnEl.setAttribute('aria-live', 'polite');
  warnEl.innerHTML = '<div class="wn"></div><div class="wm"></div>';
  document.body.appendChild(warnEl);
  let warnNum = null;
  function updateWarn(r) {
    const st = S.st; let num = null, msg = '';
    if (st && r != null && r > 0 && needsMe(st)) {
      if (r <= CFG.WARNING_SECONDS) num = r;
      if (st.phase === 'racePick' && r <= CFG.PICK_REMIND_SECONDS) msg = st.race.nitroOnly ? 'อย่าลืมกดยืนยัน Nitro' : st.myPick ? 'อย่าลืมกดยืนยันรถ' : 'ยังไม่ได้เลือกรถ! แตะการ์ดเพื่อเลือก';
      if (st.phase === 'shadowBid' && r <= CFG.PICK_REMIND_SECONDS) msg = 'ยังไม่ได้ยืนยันราคา! หมดเวลาจะส่ง 1 ให้อัตโนมัติ';
    }
    const wn = warnEl.firstChild, wm = warnEl.lastChild;
    if (num !== warnNum) { warnNum = num; wn.textContent = num == null ? '' : num; wn.classList.remove('beat'); void wn.offsetWidth; if (num != null) wn.classList.add('beat'); }
    wn.hidden = num == null; wm.textContent = msg; wm.hidden = !msg;
    warnEl.hidden = num == null && !msg;
  }

  // ---------- views ----------
  const of = (a, b) => `${a} / ${b}`;
  const PH = { auction: 1, shadowBid: 1, shadowReveal: 1, auctionResult: 1, racePick: 2, raceRun: 2, raceResult: 2 };
  const phaseLabel = { auction: 'PHASE 1 · ประมูล', shadowBid: 'PHASE 1 · ราคาลับ', shadowReveal: 'PHASE 1 · เปิดราคา', auctionResult: 'PHASE 1 · ผลประมูล', racePick: 'PHASE 2 · เลือกรถ', raceRun: 'PHASE 2 · RACE START', raceResult: 'PHASE 2 · ผล Race', gameOver: 'จบเกม', cancelled: 'ยกเลิก' };
  const nm = pid => esc(P(pid).name) + (S.st && pid === S.st.me ? ' <span class="you">คุณ</span>' : '');
  const dot = pid => `<i class="pdot" style="--c:${color(pid)}"></i>`;
  const badges = pid => { const st = S.st, p = P(pid); return (st && st.crownId === pid ? '<span class="crownb" title="แชมป์ Race ล่าสุด" data-act="modal" data-m="help-crown" role="button">♛</span>' : '') + (p.streak >= 2 ? `<span class="streak" title="ชนะติดกัน ${p.streak} Race">🔥${p.streak}</span>` : ''); };
  const statusChip = p => p.left ? '<span class="chip">ออกแล้ว</span>' : p.connected ? '<span class="online" title="ออนไลน์"></span>' : '<span class="chip bad">หลุด</span>'; // F-15
  const evBadge = ev => ev ? `<button class="evbadge" data-act="modal" data-m="ev-${ev}" title="${esc(EV[ev].d)}"><span class="ei">${EV[ev].i}</span> ${esc(EV[ev].n)}</button>` : '';

  function topBar(st, extra) {
    const isHost = st && st.me === st.hostId && !st.myLeft;
    const pausable = st && isHost && ['auction', 'shadowBid', 'racePick'].includes(st.phase) && !st.intro;
    const hostBtns = pausable ? `<div class="hostbtns">${st.paused ? '<button class="ib" data-act="resume" aria-label="เล่นต่อ" title="เล่นต่อ">▶</button>' : '<button class="ib" data-act="pause" aria-label="หยุดชั่วคราว" title="หยุดชั่วคราว">❚❚</button>'}<button class="ib" data-act="skip" aria-label="ข้าม" title="ข้ามคนที่ยังไม่เสร็จ (ระบบเลือกให้)">⏭</button></div>` : '';
    return `<div class="top">${extra || ''}<div class="row tright">${hostBtns}<div class="timer js-timer"></div><button class="ib menu-b" data-act="menu" aria-label="เมนู" aria-expanded="${S.ui.menu}">⋮</button></div></div>`;
  }
  function tipLine(text) { return Snd.get('tips') === false || !text ? '' : `<div class="tip">${text}</div>`; } // F-45

  function viewHome() {
    const code = S.drafts.code != null ? S.drafts.code : roomFromUrl();
    return `<div class="top"><span></span><button class="ib menu-b" data-act="menu" aria-label="เมนู">⋮</button></div>
    <h1>บิดไปสมาชิก<span class="en">BID NOW, RACE LATER</span></h1><div class="stripe"></div>
    <div class="panel stack">
      <label class="small muted" for="in-name">ชื่อของคุณ</label>
      <input id="in-name" maxlength="${CFG.NAME_MAX_CHARS}" autocomplete="nickname" value="${esc(S.drafts.name || '')}">
      ${code ? '' : `<button class="primary" data-act="create">สร้างห้องใหม่</button><div class="small muted center">หรือเข้าห้องเพื่อน</div>`}
      <label class="small muted" for="in-code">รหัสห้อง</label>
      <input id="in-code" maxlength="4" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="เช่น 4827" value="${esc(code)}" style="letter-spacing:.2em">
      <button class="join" data-act="join">เข้าร่วม</button>
      <div class="small muted center">ถ้าเกมในห้องเริ่มไปแล้ว จะเข้าเป็นผู้ชมให้อัตโนมัติ</div>
    </div>
    <div class="panel small muted">ประมูลรถด้วย Coins ที่มีจำกัด แล้วนำรถมาแข่ง 3D ทีละคันเพื่อเก็บ Prize · ผู้เล่น 2–7 คน · 3 โหมด</div>`;
  }

  // ---------- Lobby ----------
  function viewLobby(st) {
    const isHost = st.me === st.hostId, n = st.players.length, s = st.settings;
    const canStart = n >= CFG.PLAYERS_MIN && n <= CFG.PLAYERS_MAX;
    const players = `<div class="panel"><h2>ผู้เล่น ${of(n, CFG.PLAYERS_MAX)}</h2>
      ${st.players.map(p => `<div class="row player ${p.id === st.me ? 'me' : ''}">${dot(p.id)}<img class="mthumb" alt="" src="${thumbUrl(p.modelId)}" onerror="this.style.visibility='hidden'"><span class="pname grow ell">${esc(p.name)}${p.id === st.me ? ' <span class="you">คุณ</span>' : ''}<span class="small muted mname"> ${esc(modelMeta(p.modelId).name)}</span></span>${p.id === st.hostId ? '<span class="chip hot">เจ้าของห้อง</span>' : ''}${statusChip(p)}
        ${isHost && p.id !== st.me ? `<button class="ib sm" data-act="host-to" data-pid="${p.id}" title="ให้เป็นเจ้าของห้อง" aria-label="ให้ ${esc(p.name)} เป็นเจ้าของห้อง">♛</button><button class="ib sm" data-act="kick" data-pid="${p.id}" title="เอาออกจากห้อง" aria-label="เอา ${esc(p.name)} ออก">✕</button>` : ''}</div>`).join('')}
      ${S.ui.kick ? `<div class="confirm row"><span class="grow">เอา <b>${esc(P(S.ui.kick).name)}</b> ออกจากห้อง?</span><button class="danger" data-act="kick-yes">เอาออก</button><button data-act="kick-no">ยกเลิก</button></div>` : ''}
    </div>`;
    const me = st.me ? P(st.me) : null;
    const tab = S.ui.modelTab, list = S.models.filter(m => m.tab === tab);
    const models = me ? `<div class="panel"><div class="row"><h2 class="grow" style="margin:0">รถ 3D ของคุณ</h2><button class="ib" data-act="model-rand" title="สุ่มโมเดล" aria-label="สุ่มโมเดล">🎲</button></div>
      <div class="mview-wrap"><div id="mview" class="mview"></div><div class="mview-name">${esc(modelMeta(me.modelId).name)}</div></div>
      <div class="tabs" style="margin:8px 0"><button class="${tab === 'animal' ? 'on' : ''}" data-act="model-tab" data-tab="animal">สัตว์ (${S.models.filter(m => m.tab === 'animal').length})</button><button class="${tab === 'vehicle' ? 'on' : ''}" data-act="model-tab" data-tab="vehicle">รถแข่ง (${S.models.filter(m => m.tab === 'vehicle').length})</button></div>
      <div class="mgrid">${list.map(m => `<button class="mcell ${m.id === me.modelId ? 'on' : ''}" data-act="model" data-id="${esc(m.id)}" aria-pressed="${m.id === me.modelId}"><img alt="" loading="lazy" src="${thumbUrl(m.id)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'mfb',textContent:'${esc(m.name).slice(0, 2)}'}))"><span class="ell">${esc(m.name)}</span></button>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">หน้าตารถไม่มีผลต่อกติกา · เลือกซ้ำกับคนอื่นได้</div></div>` : '';
    const dis = isHost ? '' : 'disabled';
    const settings = `<div class="panel stack"><div class="row"><h2 class="grow" style="margin:0">ตั้งค่าเกม</h2><button class="ghost sm" data-act="modal" data-m="rules">กติกาห้องนี้</button></div>
      <div class="modes">${CFG.MODES.map(m => `<button class="mode ${s.mode === m ? 'on' : ''}" data-act="mode" data-mode="${m}" ${dis} aria-pressed="${s.mode === m}"><b>${MODE[m].n}</b><span>${MODE[m].d}</span></button>`).join('')}</div>
      <div class="toggles">${CFG.TOGGLES.map(k => `<div class="tg"><button class="sw ${s.toggles[k] ? 'on' : ''}" data-act="toggle" data-key="${k}" ${dis} role="switch" aria-checked="${!!s.toggles[k]}" aria-label="${TOG[k].n}"><i></i></button><div class="grow"><b>${TOG[k].n}</b><div class="small muted">${TOG[k].d}</div>
        ${k === 'campaign' && s.toggles.campaign ? `<label class="small sub"><button class="sw xs ${s.campaignAll ? 'on' : ''}" data-act="camp-all" ${dis} role="switch" aria-checked="${s.campaignAll}" aria-label="ทุก Race"><i></i></button> มีเหตุการณ์ทุก Race (ค่าเริ่มต้น: ครึ่งหนึ่ง + Race สุดท้าย)</label>` : ''}</div></div>`).join('')}</div>
      <div class="row"><span class="grow">จำนวนรอบ<div class="small muted">ประมูล = แข่ง = รถต่อคน · ${CFG.ROUNDS_MIN}–${st.roundsMax} รอบ</div></span>
        ${isHost ? `<div class="stepper"><button data-act="rounds-dec" aria-label="ลดรอบ" ${st.rounds <= CFG.ROUNDS_MIN ? 'disabled' : ''}>−</button><span class="rounds-v">${st.rounds}</span><button data-act="rounds-inc" aria-label="เพิ่มรอบ" ${st.rounds >= st.roundsMax ? 'disabled' : ''}>+</button></div>` : `<b class="rounds-v">${st.rounds}</b>`}</div>
      ${isHost && !st.roundsAuto ? '<button class="linkbtn" data-act="rounds-auto">ใช้ค่าเริ่มต้น (= จำนวนผู้เล่น)</button>' : ''}
      <div class="row"><span class="grow">Coins เริ่มต้น<div class="small muted">${s.coinsOverride == null ? 'ค่าแนะนำตามโหมดและจำนวนรอบ' : `ค่าแนะนำ ${st.recommendedCoins}`}</div></span>
        ${isHost ? `<div class="stepper"><button data-act="coins-dec" aria-label="ลด Coins">−</button><span class="rounds-v coins">${st.startCoins}</span><button data-act="coins-inc" aria-label="เพิ่ม Coins">+</button></div>` : `<b class="coins">🪙 ${st.startCoins}</b>`}</div>
      ${isHost && s.coinsOverride != null ? `<button class="linkbtn" data-act="coins-reset">ใช้ค่าแนะนำ (${st.recommendedCoins})</button>` : ''}
      <div><div class="small muted" style="margin-bottom:4px">ฉากสนาม</div><div class="rchips"><button class="${!s.sceneLock ? 'on' : ''}" data-act="scene" data-scene="" ${dis}>สุ่มทุก Race</button>${CFG.SCENES.map(sc => `<button class="${s.sceneLock === sc ? 'on' : ''}" data-act="scene" data-scene="${sc}" ${dis}>${SCENE[sc]}</button>`).join('')}</div></div>
      ${isHost ? '' : '<div class="small muted">เจ้าของห้องเป็นคนตั้งค่า</div>'}</div>`;
    const joinBox = !st.me && n < CFG.PLAYERS_MAX ? `<div class="panel stack"><div class="pname">ห้องยังว่าง — เข้าร่วมเป็นผู้เล่นได้</div>
      <input id="in-name" maxlength="${CFG.NAME_MAX_CHARS}" autocomplete="nickname" placeholder="ชื่อของคุณ" value="${esc(S.drafts.name || '')}"><button class="join" data-act="join-lobby">เข้าร่วมเป็นผู้เล่น</button></div>` : '';
    return `${topBar(st, `<div><span class="muted small">ห้อง</span> <span class="code">${esc(st.code)}</span> <button class="ghost sm" data-act="copy">คัดลอกลิงก์</button></div>`)}
    ${players}${models}${settings}${joinBox}
    ${tipLine(st.me ? (isHost ? 'ตั้งค่าเกม แล้วกด "เริ่มเกม"' : 'เลือกรถ 3D ของคุณ แล้วรอเจ้าของห้องเริ่มเกม') : '')}
    ${st.me ? (isHost ? `<button class="primary" style="width:100%" data-act="start" ${canStart ? '' : 'disabled'}>เริ่มเกม</button>${canStart ? '' : '<div class="small muted center" style="margin-top:6px">ต้องมีผู้เล่น 2–7 คน</div>'}` : '<div class="panel muted">รอเจ้าของห้องกดเริ่มเกม…</div>') : '<div class="panel muted">กำลังชม รอเกมเริ่ม…</div>'}`;
  }

  // ---------- ป้ายประกาศ ----------
  function introStep() {
    const st = S.st; if (!st || !st.intro) return null;
    const t = now();
    return st.intro.steps.find(s => s.endsAt > t) || null;
  }
  const stepStart = s => { const st = S.st, i = st.intro.steps.indexOf(s); return i > 0 ? st.intro.steps[i - 1].endsAt : s.endsAt - (s.kind === 'lot' ? lotN() * CFG.LOT_REVEAL_STEP_SECONDS * 1000 : CFG.INTRO_SECONDS * 1000); };
  const lotN = () => (S.st && S.st.auction ? S.st.auction.set.length : 1);
  function lotIndex(s) { return Math.min(lotN() - 1, Math.max(0, Math.floor((now() - stepStart(s)) / (CFG.LOT_REVEAL_STEP_SECONDS * 1000)))); }
  function lotOrder(set) { // เปิดทีละคันแบบกระจาย (ไม่เรียงตามแรง) แล้วจัดเรียงทีหลัง · Mystery เปิดท้ายสุดเป็นด้านหลัง
    const known = set.filter(id => id !== 'mystery'), h = id => [...id].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
    return known.slice().sort((a, b) => h(a) - h(b)).concat(set.includes('mystery') ? ['mystery'] : []);
  }
  function viewIntro(st, s) {
    const p = ['phase', 'rules'].includes(s.kind) ? (s.kind === 'rules' ? 1 : s.no) : (['auction', 'lot'].includes(s.kind) ? 1 : 2);
    let inner;
    if (s.kind === 'rules') {
      const set = st.settings, on = CFG.TOGGLES.filter(k => set.toggles[k]);
      inner = `<div class="lbl">กติกาห้องนี้</div><div class="ttl">${MODE[set.mode].n}</div><div class="bar"></div><div class="sub">${MODE[set.mode].d}</div>
        <div class="rulechips">${on.length ? on.map(k => `<span class="chip ok">${TOG[k].n}</span>`).join('') : '<span class="chip">ไม่มีปุ่มเสริม</span>'}</div>
        <div class="sub small">${st.x} รอบ · คนละ ${st.startCoins} Coins</div>`;
    } else if (s.kind === 'phase') {
      const sub = s.no === 1 ? `ประมูล ${st.x} รอบ · คนละ ${st.startCoins || '-'} Coins` : `แข่ง ${st.x} Race · ใช้รถได้คันละครั้ง`;
      inner = `<div class="lbl">PHASE ${s.no}</div><div class="ttl">${s.no === 1 ? 'ประมูล' : 'แข่งขัน'}</div><div class="bar"></div><div class="sub">${sub}</div>`;
    } else if (s.kind === 'auction') {
      const a = st.auction, open = a && a.log && a.log[0];
      inner = `<div class="rnd-a">AUCTION</div><div class="rnd-n">${of(s.no, st.x)}</div>` +
        (a ? `<div class="sub">${a.mode === 'shadow' ? `ใส่ราคาลับพร้อมกัน · เท่ากันเรียงตามที่นั่งจาก ${esc(P(a.openerId).name)}` : `ผู้เปิด ${esc(P(a.openerId).name)} · bid เปิด ${open ? open.amount : 0} Coin`}</div>` : '');
    } else if (s.kind === 'lot') {
      return viewLot(st, s);
    } else if (s.kind === 'campaign') {
      const e = EV[s.event] || { n: s.event, i: '!', d: '' };
      inner = `<div class="lbl">GRAND CAMPAIGN</div><div class="evicon">${e.i}</div><div class="ttl">${esc(e.n)}</div><div class="bar"></div><div class="sub">${esc(e.d)}</div>`;
    } else if (s.kind === 'sudden') {
      const ids = st.race && st.race.participants || [];
      inner = `<div class="rnd-a">SUDDEN DEATH</div><div class="sub">คะแนนเสมอ — ${ids.map(id => esc(P(id).name)).join(' vs ')}</div><div class="sub small">รถลับคันใหม่คนละ 1 คัน${st.settings.toggles.nitro ? ' · ใส่ Nitro ได้ด้วย Coins ที่เหลือ' : ''}</div>`;
    } else {
      const r = st.race;
      const ev = r && r.event ? `<div class="sub">${EV[r.event].i} ${esc(EV[r.event].n)}</div>` : '';
      inner = `<div class="rnd-a">RACE</div><div class="rnd-n">${of(s.no, st.x)}</div>` +
        (r ? `<div class="sub">${r.last ? (r.nitroOnly ? 'Race สุดท้าย — รถเลือกให้อัตโนมัติ ใส่ Nitro ได้' : 'Race สุดท้าย — ระบบเลือกรถให้อัตโนมัติ') : r.prizes ? `Prize อันดับ 1 = ${r.prizes[0]} · เลือกรถภายใน ${CFG.PICK_SECONDS} วิ` : `Prize ซ่อนอยู่ · เลือกรถภายใน ${CFG.PICK_SECONDS} วิ`}</div>` : '') + ev;
    }
    return `<div class="intro p${p} k-${s.kind}" role="status" aria-live="polite">${inner}</div>`;
  }
  // เปิดรถทีละคัน ภาพใหญ่กลางจอ แล้วแทรกตามความแรง (D2-35)
  function viewLot(st, s) {
    const a = st.auction, order = lotOrder(a.set), i = lotIndex(s);
    const shown = order.slice(0, i), cur = order[i];
    const sorted = a.set.filter(id => shown.includes(id)); // set เรียงแรง→อ่อน (mystery ท้าย)
    return `<div class="intro p1 k-lot" role="status" aria-live="polite"><div class="lbl">AUCTION ${of(a.no, st.x)} · ชุดรถรอบนี้</div>
      <div class="lotbig" data-k="${esc(cur)}">${cardBox(cur, 'lotbig', 0, {})}</div>
      <div class="lotrow">${a.set.map((id, j) => shown.includes(id) ? `<div class="lotslot" data-flip="lot:${esc(id)}" data-slot="${sorted.indexOf(id)}">${cardBox(id, 'lotrow', 0, { cap: false })}</div>` : '').join('')}${Array.from({ length: a.set.length - shown.length }, () => '<div class="lotslot empty"></div>').join('')}</div>
      <div class="sub small">เรียงจากแรงไปอ่อน${a.hasMystery ? ' · Mystery Car อยู่ช่องท้ายเสมอ' : ''}</div></div>`;
  }

  // ---------- Phase 1: ประมูล ----------
  function bidLog(st) {
    const a = st.auction;
    let curIdx = -1; a.log.forEach((e, i) => { if (e.kind === 'open' || e.kind === 'raise') curIdx = i; });
    const rows = a.log.map((e, i) => {
      const isBid = e.kind === 'open' || e.kind === 'raise';
      const note = e.kind === 'open' ? 'เปิดอัตโนมัติ' : e.kind === 'out' ? 'Coins ไม่พอ' : e.reason === 'timeout' ? 'หมดเวลา' : e.reason === 'skip' ? 'host ข้าม' : e.reason === 'left' ? 'ออกแล้ว' : '';
      const v = isBid ? e.amount : e.kind === 'out' ? 'ออก' : 'Pass';
      return `<div class="bl ${isBid ? '' : 'pass'} ${i === curIdx ? 'cur' : ''}"><span class="n">${i + 1}</span><span class="who">${nm(e.pid)}</span><span class="note">${note}</span><span class="v">${v}</span></div>`;
    }).reverse().join('');
    return `<div class="bidlog"><div class="row"><b class="grow">ประวัติ bid รอบนี้</b><span class="small muted">ล่าสุดอยู่บน</span></div><div class="bidlog-list">${rows}</div></div>`;
  }
  // "ถ้าจบตอนนี้" ใครได้คันไหน ตามกติกาของโหมด (หัวข้อ 10.3)
  function ifEndsNow(st) {
    const a = st.auction, n = st.n || st.players.length;
    if (st.settings.mode === 'chaos') {
      const o = P(a.openerId).seat, rel = p => (p.seat - o + n) % n;
      const others = st.players.filter(p => p.id !== a.highBidderId);
      const pos = others.filter(p => a.committed[p.id] > 0).sort((p, q) => a.committed[q.id] - a.committed[p.id]);
      const stillIn = others.filter(p => !a.committed[p.id] && !a.out[p.id]).sort((p, q) => rel(p) - rel(q));
      const passed = a.passOrder.slice().reverse().filter(id => !a.committed[id] && id !== a.highBidderId).map(id => P(id));
      return [P(a.highBidderId), ...pos, ...stillIn, ...passed].map(p => p.id);
    }
    const hs = P(a.highBidderId).seat;
    return Array.from({ length: n }, (_, i) => (st.players.find(q => q.seat === (hs + i) % n) || {}).id);
  }
  // กองชิป: ชิปใหม่ร่วงลงกอง (F-10) · pass = ชิปจาง + PASS แดง
  function pile(st, pid, amount, key) {
    const k = `${key}:${pid}`, seen = S.chipsSeen[k] || 0, show = Math.min(amount, 12);
    S.chipsSeen[k] = show;
    let html = '';
    for (let i = 0; i < show; i++) html += `<i class="${i >= seen ? 'drop' : ''}" style="bottom:${i * 5}px;--d:${(i - seen) * 60}ms;background:${color(pid)}"></i>`;
    return `<div class="pile">${html}</div>`;
  }
  function seatGrid(st, opt) {
    const a = st.auction, mode = st.settings.mode, x = st.n || st.players.length;
    const o = P(a.openerId).seat;
    const list = st.players.slice().sort((p, q) => ((p.seat - o + x) % x) - ((q.seat - o + x) % x));
    return `<div class="seats">${list.map(p => {
      const out = mode !== 'shadow' && a.out && a.out[p.id];
      const turn = mode !== 'shadow' ? a.turnId === p.id : st.phase === 'shadowBid' && !(a.submitted || []).includes(p.id) && !(a.broke || []).includes(p.id);
      const amt = opt.amount(p);
      const cars = p.cars.map(id => `<img alt="${esc(card(id).name)}" title="${esc(card(id).name)} · ${card(id).power}" src="${artUrl(id)}" onerror="this.style.visibility='hidden'">`).join('');
      return `<div class="seat ${out ? 'out' : ''} ${turn ? 'turn' : ''} ${p.id === st.me ? 'mine' : ''}" style="--c:${color(p.id)}">
        <div class="av ${turn ? 'ring' : ''}" ${turn ? 'data-ring' : ''}><span>${esc([...p.name][0] || '?')}</span></div>
        <div class="snm ell">${esc(p.name)}${p.id === st.me ? ' <span class="you">คุณ</span>' : ''}</div>
        <div class="scoin">🪙 ${p.coins}</div>${statusChip(p)}
        ${opt.pile ? pile(st, p.id, amt || 0, `${a.no}`) : ''}
        <div class="samt">${opt.label(p, amt)}</div>
        ${out ? '<div class="stamp">PASS</div>' : ''}
        <div class="scars">${cars}</div></div>`;
    }).join('')}</div>`;
  }
  function viewAuction(st) {
    const a = st.auction, mode = st.settings.mode;
    const head = `<div class="row"><h2 class="grow" style="margin:0">Auction ${of(a.no, st.x)} <span class="chip">${MODE[mode].n}</span></h2><span class="small muted">${mode === 'shadow' ? 'เท่ากัน: เรียงจาก' : 'ผู้เปิด'} ${esc(P(a.openerId).name)}</span></div>`;
    if (st.phase === 'auctionResult') return viewAuctionResult(st, head);
    if (mode === 'shadow') return viewShadow(st, head);
    const me = st.me ? P(st.me) : null;
    const myTurn = a.turnId && a.turnId === st.me && !st.myLeft && !st.paused;
    const owners = ifEndsNow(st);
    const mysteryIdx = a.set.indexOf('mystery');
    let html = `<div class="panel">${head}<div class="small muted" style="margin-top:4px">ถ้าจบตอนนี้ — ชื่อใต้การ์ดคือคนที่จะได้คันนั้น</div>
      <div class="grid g${Math.min(4, Math.max(3, a.set.length > 4 ? 4 : 3))} lotgrid" style="margin-top:8px">${a.set.map((id, i) => { const oid = owners[i] || '';
        const lbl = i === mysteryIdx ? '→ ?' : `→ ${nm(oid)}`;
        return cardBox(id, 'set', 0, { after: `<div class="owner ${a.out[oid] ? 'out' : ''} ${i === 0 ? 'first' : ''}" data-flip="own:${a.no}:${esc(oid)}" data-slot="${i}">${lbl}${i === 0 ? ` <span class="hib">🪙${a.currentBid}</span>` : ''}</div>` }); }).join('')}</div>
      <div class="price"><span class="small muted">ราคาปัจจุบัน</span><b>${a.currentBid}</b><span class="small">${a.turnId ? `ถึงตา <b style="color:${color(a.turnId)}">${esc(P(a.turnId).name)}</b>` : ''}</span></div>
      ${seatGrid(st, { pile: true, amount: p => a.committed[p.id] || 0, label: (p, v) => `${mode === 'chaos' ? 'ลงแล้ว' : 'bid'} <b>${v}</b>` })}`;
    if (myTurn) {
      const max = bidMax(st);
      const draft = S.drafts.bidSeq === a.seq ? Number(S.drafts.bid) : a.minBid;
      const v = Math.max(a.minBid, Math.min(max, Number.isFinite(draft) ? draft : a.minBid));
      const first = !S.firstTurnSeen[st.code]; if (first) setTimeout(() => { S.firstTurnSeen[st.code] = true; }, 4000);
      html += `<div class="panel stack myturn ${first ? 'hint' : ''}">${tipLine('ถึงตาคุณ: Bid เพิ่ม หรือ Pass')}
        <div class="pname">มี ${me.coins} Coins${mode === 'chaos' ? ` · ลงไปแล้ว ${a.committed[st.me] || 0} (bid ได้ถึง ${max})` : ''}</div>
        <div class="quick">${[1, 2, 5].map(d => `<button data-act="bid-quick" data-v="${d}" ${a.currentBid + d > max ? 'disabled' : ''}>+${d}</button>`).join('')}<button class="allin" data-act="bid-quick" data-v="all" ${max < a.minBid ? 'disabled' : ''}>All-in</button></div>
        ${S.ui.allIn ? `<div class="confirm stack"><div>All-in ${max} Coins?${mode === 'chaos' ? ' (เสียจริงแม้ไม่ชนะ)' : ''}</div><div class="row"><button class="bid grow" data-act="allin-yes">ยืนยัน All-in</button><button class="grow" data-act="allin-no">ยกเลิก</button></div></div>` : ''}
        <div class="stepper"><button data-act="bid-dec" aria-label="ลด">−</button><input id="in-bid" type="number" inputmode="numeric" min="${a.minBid}" max="${max}" value="${v}" aria-label="จำนวน bid"><button data-act="bid-inc" aria-label="เพิ่ม">+</button>
        <span class="small muted">ขั้นต่ำ ${a.minBid}</span></div>
        <div class="row"><button class="bid grow" data-act="raise">Bid</button><button class="pass grow" data-act="pass">Pass</button></div></div>`;
    } else if (st.me && !st.myLeft) html += tipLine(a.turnId ? `รอ ${esc(P(a.turnId).name)} ตัดสินใจ…` : '');
    return html + bidLog(st) + '</div>';
  }
  function viewShadow(st, head) {
    const a = st.auction, me = st.me && !st.myLeft ? P(st.me) : null;
    let body = '';
    if (st.phase === 'shadowReveal') {
      const rv = a.reveal, k = revealCount(st);
      const shownIds = new Set([].concat(...rv.flipGroups.slice(0, k)));
      const bidOf = pid => rv.bids.find(b => b.pid === pid) || {};
      body = seatGrid(st, { pile: true, amount: p => shownIds.has(p.id) ? bidOf(p.id).amount || 0 : 0,
        label: (p, v) => bidOf(p.id).broke ? 'Coins หมด' : shownIds.has(p.id) ? `<span class="flipin">ราคา <b>${v}</b>${bidOf(p.id).auto ? ' (อัตโนมัติ)' : ''}</span>` : '<span class="muted">? ? ?</span>' });
      if (k >= rv.flipGroups.length) body += `<div class="small muted center">อันดับ: ${rv.ranking.map((pid, i) => `${i + 1}. ${esc(P(pid).name)}`).join(' · ')}</div>`;
    } else {
      body = seatGrid(st, { pile: false, amount: () => 0, label: p => (a.broke || []).includes(p.id) ? 'Coins หมด' : (a.submitted || []).includes(p.id) ? '<span class="ok">ส่งแล้ว ✓</span>' : '<span class="muted">กำลังคิด…</span>' });
      if (me && !st.intro) {
        if ((a.broke || []).includes(me.id)) body += tipLine('Coins หมด — ได้คันท้ายรอบนี้ รอดูผล');
        else if (st.myBidConfirmed) body += `<div class="panel" style="background:var(--panel2)">ส่งราคาแล้ว: <b class="big">${st.myBid}</b><div class="small muted">รอคนอื่น… (ราคาเปิดพร้อมกันตอนครบ)</div></div>`;
        else {
          const v = shadowDraft(st);
          body += `<div class="panel stack myturn">${tipLine(`ใส่ราคาลับ แล้วกดยืนยัน (ขั้นต่ำ ${CFG.SHADOW_MIN_BID} · หมดเวลาส่ง ${CFG.SHADOW_MIN_BID} ให้)`)}
            <div class="pname">มี ${me.coins} Coins · ทุกคนจ่ายตามราคาที่ใส่</div>
            <div class="stepper"><button data-act="sh-dec" aria-label="ลด">−</button><input id="in-shadow" type="number" inputmode="numeric" min="${CFG.SHADOW_MIN_BID}" max="${me.coins}" value="${v}" aria-label="ราคาลับ"><button data-act="sh-inc" aria-label="เพิ่ม">+</button><button data-act="sh-max">สูงสุด</button></div>
            <button class="bid" data-act="sh-confirm">ยืนยันราคา</button></div>`;
        }
      }
    }
    return `<div class="panel">${head}<div class="grid g${a.set.length > 4 ? 4 : 3} lotgrid" style="margin-top:8px">${a.set.map(id => cardBox(id, 'set', 0, {})).join('')}</div>${body}</div>`;
  }
  function revealCount(st) {
    const a = st.auction; if (!a || !a.reveal || !st.endsAt) return 0;
    const start = st.endsAt - CFG.SHADOW_REVEAL_SECONDS * 1000, groups = a.reveal.flipGroups.length || 1;
    const step = (CFG.SHADOW_REVEAL_SECONDS * 1000 - 1200) / groups;
    return Math.max(0, Math.min(groups, Math.floor((now() - start - 400) / step) + 1));
  }
  function allocGrid(st, res, where) {
    const rows = Object.entries(res.allocation).sort((x, y) => card(y[1]).power - card(x[1]).power);
    return `<div class="grid g2">${rows.map(([pid, cid]) => cardBox(cid, where, 0, { cap: false,
      after: `<div class="got"><span class="small muted">ได้โดย</span> <b style="color:${color(pid)}">${esc(P(pid).name)}</b>${pid === S.st.me ? ' <span class="you">คุณ</span>' : ''}${res.refund && res.refund[pid] ? ` <span class="refund">+${res.refund[pid]} คืน</span>` : ''}</div>` })).join('')}</div>`;
  }
  function viewAuctionResult(st, head) {
    const res = st.auctionHistory[st.auctionHistory.length - 1];
    const back = res.mode === 'classic';
    const piles = `<div class="seats small">${st.players.map(p => { const amt = (res.ranking.find(r => r.pid === p.id) || {}).amount || 0;
      const isW = p.id === res.winnerId;
      return `<div class="seat ${back && !isW ? 'back' : ''}" style="--c:${color(p.id)}"><div class="snm ell">${esc(p.name)}</div>${pile(st, p.id, amt, 'res' + res.no)}<div class="samt">${back ? (isW ? `จ่าย <b>${res.price}</b>` : 'ไม่ต้องจ่าย') : `จ่าย <b>${res.paid[p.id] || 0}</b>`}</div></div>`; }).join('')}</div>`;
    return `<div class="panel">${head}<div class="sold">ขายแล้ว!</div>
      <div class="winner" style="margin-bottom:10px">${esc(P(res.winnerId).name)} ชนะ ${res.price} Coins${res.mysteryId ? ` · Mystery = ${esc(card(res.mysteryId).name)} (${card(res.mysteryId).power})` : ''}</div>
      ${piles}${allocGrid(st, res, 'ares')}</div>`;
  }

  // ---------- Phase 2: แข่งขัน ----------
  const medal = rk => (rk === 1 ? 'm1' : rk === 2 ? 'm2' : rk === 3 ? 'm3' : '');
  function scoreBoard(st) { // F-14
    const open = S.ui.score;
    const list = st.players.slice().sort((a, b) => b.prizeTotal - a.prizeTotal || b.firstPlaces - a.firstPlaces || a.seat - b.seat);
    return `<div class="panel"><button class="fold" data-act="fold" data-key="score" aria-expanded="${open}"><span>${open ? '▾' : '▸'} คะแนนสด</span><span class="small muted">${open ? '' : esc(P(list[0].id).name) + ' นำ'}</span></button>
      ${open ? `<div class="score">${list.map((p, i) => `<div class="srow ${p.id === st.me ? 'mine' : ''}"><span class="rk">${i + 1}</span>${dot(p.id)}<span class="grow ell">${esc(p.name)} ${badges(p.id)}</span><span class="coins small">🪙${p.coins}</span><b class="pt">${p.prizeTotal}</b></div>`).join('')}</div>` : ''}</div>`;
  }
  function remainingBox(st) {
    const open = S.ui.remain, r = st.race;
    return `<div class="panel"><button class="fold" data-act="fold" data-key="remain" aria-expanded="${open}"><span>${open ? '▾' : '▸'} รถที่เหลือของผู้เล่นแต่ละคน</span><span class="small muted">${open ? 'กดเพื่อยุบ' : 'กดเพื่อเปิด'}</span></button>
      ${open ? st.players.map(p => `<div class="pl"><div class="l"><span class="pname">${nm(p.id)}</span>
        <span class="small muted">${p.left ? 'ออกแล้ว' : r.confirmed.includes(p.id) ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}</span></div>
        <div class="chips">${p.cars.map(id => `<span class="carchip"><b>${card(id).power}</b> ${esc(card(id).name)}</span>`).join('') || '<span class="muted small">ไม่มีรถเหลือ</span>'}</div></div>`).join('') : ''}
    </div>`;
  }
  const COIN = '<svg class="coin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7"/><circle cx="8" cy="8" r="3.6" class="in"/></svg>';
  function prizeTickets(r) {
    if (!r.prizes) return `<div class="ptitle">🏆 เงินรางวัลรอบนี้</div><div class="fogbox">☁ ??? — Fog: Prize เปิดตอนผล</div>`;
    let p = r.prizes.slice(), note = '';
    if (r.event === 'double') { p = p.map(v => v * CFG.DOUBLE_PRIZE_MULT); note = ` <span class="chip warn">×${CFG.DOUBLE_PRIZE_MULT}</span>`; }
    if (r.event === 'wta') { const sum = p.reduce((s, v) => s + v, 0); return `<div class="ptitle">🏆 Winner Takes All</div><div class="grid g4 tickets"><div class="ticket m1" style="grid-column:span 4"><div class="tk-rk">อันดับ 1 ได้ทั้งหมด</div><div class="tk-v">${COIN}<span>${sum}</span></div></div></div>`; }
    return `<div class="ptitle">🏆 เงินรางวัลรอบนี้${note}</div><div class="grid g4 tickets">${p.map((v, i) =>
      `<div class="ticket ${medal(i + 1) || 'mx'} ${r.event === 'double' ? 'pop' : ''}"><div class="tk-rk">อันดับ ${i + 1}</div><div class="tk-v">${COIN}<span>${v}</span></div></div>`).join('')}</div>`;
  }
  function nitroBar(st, me) { // F-21 ปุ่มด่วน 0/3/5 + แถบ 0…5
    const r = st.race, allowed = r.nitroAllowed, max = Math.min(CFG.NITRO_MAX_COINS, me.coins);
    if (!st.settings.toggles.nitro) return '';
    if (!allowed) return `<div class="nitro ban"><b>⛔ Nitro Ban</b> <span class="small muted">ห้ามใช้ Nitro ใน Race นี้</span></div>`;
    const rate = CFG.NITRO_POWER_PER_COIN * (r.event === 'frenzy' ? CFG.FRENZY_MULT : 1) * (r.event === 'reverse' ? -1 : 1);
    const cur = st.myNitro || 0;
    return `<div class="nitro ${r.event === 'reverse' ? 'rev' : r.event === 'frenzy' ? 'frz' : ''}"><div class="row"><b class="grow">🔥 Nitro <span class="small muted">(ลับ · ${rate > 0 ? '+' : ''}${rate} ต่อ Coin · มี ${me.coins})</span></b><span class="nv">${cur ? `${rate > 0 ? '+' : ''}${(cur * rate).toFixed(1).replace('.0', '')}` : '0'}</span></div>
      <div class="flames">${Array.from({ length: CFG.NITRO_MAX_COINS + 1 }, (_, i) => `<button class="${i === cur ? 'on' : ''} ${i <= cur && i ? 'lit' : ''}" data-act="nitro" data-v="${i}" ${i > max || st.myConfirmed ? 'disabled' : ''} aria-label="Nitro ${i}">${i ? '🔥'.repeat(1) + i : '0'}</button>`).join('')}</div>
      <div class="quick">${CFG.NITRO_QUICK.map(v => `<button data-act="nitro" data-v="${Math.min(v, max)}" ${st.myConfirmed ? 'disabled' : ''}>${v === 0 ? 'ไม่ใช้' : v === CFG.NITRO_MAX_COINS ? 'เต็ม ' + Math.min(v, max) : Math.min(v, max)}</button>`).join('')}</div></div>`;
  }
  function viewRace(st) {
    const r = st.race;
    if (st.phase === 'raceRun') return `<div class="runwrap"><div class="runhead"><span class="rstart">${r.sudden ? 'SUDDEN DEATH' : 'RACE ' + of(r.no, st.x)}</span>${evBadge(r.event)}<span class="small muted">${SCENE[r.scene] || ''}</span></div><div id="runhost" class="runhost"></div></div>`;
    if (st.phase === 'raceResult') return viewPodium(st);
    const me = st.me && !st.myLeft ? P(st.me) : null;
    const inIt = me && (!r.participants || r.participants.includes(me.id));
    let body = '';
    if ((r.last || r.sudden) && !r.nitroOnly) body = `<div class="banner">${r.sudden ? 'Sudden Death — รถลับคันใหม่ เลือกให้อัตโนมัติ' : 'Race สุดท้าย — ทุกคนเหลือรถคันเดียว ระบบเลือกให้อัตโนมัติ'}</div>`;
    else if (inIt && !st.intro) {
      const tip = r.nitroOnly ? 'ใส่ Nitro (ไม่ใส่ก็ได้) แล้วกดยืนยัน' : `เลือกรถ 1 คัน${st.settings.toggles.nitro && r.nitroAllowed ? ' แล้วใส่ Nitro (ไม่ใส่ก็ได้)' : ''} แล้วกดยืนยัน`;
      if (st.myConfirmed) body = `<div class="panel" style="background:var(--panel2)">ยืนยันแล้ว: <b>${esc(card(st.myPick).name)} · ${card(st.myPick).power}</b>${st.myNitro ? ` · 🔥${st.myNitro}` : ''}<div class="small muted">รอคนอื่นเลือก…</div></div>`;
      else if (r.nitroOnly) body = `${tipLine(tip)}<div class="row" style="margin-top:8px">${cardBox(st.myPick, 'pickfix', 110, {})}<div class="grow small muted">รถคันนี้ถูกเลือกให้อัตโนมัติ</div></div>${nitroBar(st, me)}
        <button class="primary" style="width:100%;margin-top:12px" data-act="confirm">ยืนยัน</button>`;
      else body = `${tipLine(tip)}<div class="grid g3 pickgrid" style="margin-top:8px">${me.cars.map(id => cardBox(id, 'pick', 0, { cls: 'pickable' + (st.myPick === id ? ' sel' : ''),
          attrs: `data-act="pick" data-card="${esc(id)}" role="button" tabindex="0" aria-pressed="${st.myPick === id}"` })).join('')}</div>
        ${nitroBar(st, me)}
        <button class="primary ${!S.firstTurnSeen[st.code + 'p'] ? 'hint' : ''}" style="width:100%;margin-top:12px" data-act="confirm" ${st.myPick ? '' : 'disabled'}>ยืนยันรถ</button>`;
      if (!st.myConfirmed) setTimeout(() => { S.firstTurnSeen[st.code + 'p'] = true; }, 4000);
    } else if (r.participants && !inIt) body = '<div class="banner">Sudden Death — กำลังรอคนที่คะแนนเสมอ</div>';
    const pool = r.participants ? st.players.filter(p => r.participants.includes(p.id)) : st.players;
    const waiting = pool.filter(p => !r.confirmed.includes(p.id));
    body += `<div class="waitrow">${pool.map(p => `<span class="wchip ${r.confirmed.includes(p.id) ? 'ok' : ''}" style="--c:${color(p.id)}"><span class="av sm ${r.confirmed.includes(p.id) ? '' : 'ring'}" ${r.confirmed.includes(p.id) ? '' : 'data-ring'}><span>${esc([...p.name][0] || '?')}</span></span>${esc(p.name)}${r.confirmed.includes(p.id) ? ' ✓' : ''}</span>`).join('')}</div>
      <div class="small muted">${waiting.length ? 'ยังไม่ยืนยัน: ' + waiting.map(p => esc(p.name)).join(', ') : 'ทุกคนยืนยันแล้ว'}</div>`;
    const evRow = r.event ? `<div class="evrow">${evBadge(r.event)}<span class="small">${esc(EV[r.event].d)}</span></div>` : '';
    return `<div class="panel"><div class="row"><h2 class="grow" style="margin:0">${r.sudden ? 'Sudden Death' : 'Race ' + of(r.no, st.x)}</h2><span class="small muted">ฉาก${SCENE[r.scene] || ''}</span></div>${evRow}
      ${r.sudden ? '' : prizeTickets(r)}${body}</div>${scoreBoard(st)}${remainingBox(st)}`;
  }
  // แท่นรับรางวัล: พลิกการ์ดทีละใบจากอันดับท้ายขึ้นไปที่ 1 (F-8) + พลุ
  function podiumCount(st) {
    const res = st.race && st.race.result; if (!res || !st.endsAt) return 0;
    const start = st.endsAt - CFG.RACE_RESULT_SECONDS * 1000;
    return Math.max(0, Math.min(res.rows.length, Math.floor((now() - start - 500) / 650) + 1));
  }
  function formula(row, ev) {
    const parts = [`<span>${row.base}</span>`];
    if (row.eventDelta) parts.push(`<span class="evd">${row.eventDelta > 0 ? '+' : '−'}${Math.abs(row.eventDelta)}</span>`);
    if (row.lucky) parts.push(`<span class="evd">+🎲${row.lucky}</span>`);
    if (row.nitro) parts.push(`<span class="nit">${ev === 'reverse' ? '−' : '+'}🔥${row.nitro}</span>`);
    return parts.join(' ') + (parts.length > 1 ? ` <span>= ${String(row.total).replace(/\.0$/, '')}</span>` : '');
  }
  function viewPodium(st) {
    const res = st.race.result, rows = res.rows, n = rows.length, k = podiumCount(st);
    const flippedRank = rk => k >= n - rk + 1; // พลิกจากท้าย
    const key = `${st.code}:${res.no}`;
    if (!S.flipped[key]) S.flipped[key] = 0;
    if (k > S.flipped[key]) { S.flipped[key] = k; Snd.play('flip'); if (k >= n) { setTimeout(() => { Snd.play('fanfare'); Snd.play('cheer'); vib([60, 40, 120]); }, 120); confetti(); } }
    const cardOf = row => `<div class="pcard ${flippedRank(row.rank) ? 'on' : ''}" style="--c:${color(row.playerId)}"><div class="in"><div class="back">#${row.rank}</div><div class="face">
      <img alt="" src="${artUrl(row.cardId)}" onerror="this.style.visibility='hidden'"><div class="meta"><span class="who ell">${esc(P(row.playerId).name)}${row.playerId === st.me ? ' <span class="you">คุณ</span>' : ''}</span><span class="car ell">${esc(card(row.cardId).name)}</span>
      <span class="pw">${formula(row, res.event)}</span>${res.sudden ? '' : `<span class="prize">+${row.prize} Prize</span>`}${row.auto ? '<span class="small muted">ระบบเลือกให้</span>' : ''}</div></div></div></div>`;
    const top = [rows[1], rows[0], rows[2]];
    const ud = res.event === 'underdog' ? rows.find(r => r.eventDelta > 0) : null;
    return `<div class="panel"><div class="row"><h2 class="grow" style="margin:0">${res.sudden ? 'ผล Sudden Death' : 'ผล Race ' + of(res.no, st.x)}</h2>${evBadge(res.event)}</div>
      ${res.event === 'fog' ? `<div class="small muted">Prize ที่ซ่อนอยู่: ${res.basePrizes.join(' · ')}</div>` : ''}
      ${ud && k >= n - ud.rank + 1 ? `<div class="banner">⬆ Underdog: ${esc(P(ud.playerId).name)} ได้ +${CFG.UNDERDOG_BONUS}</div>` : ''}
      <div class="pod">${top.map((row, i) => row ? `<div class="pslot r${row.rank}">${cardOf(row)}<div class="block b${row.rank}">${row.rank}</div></div>` : '<div class="pslot"></div>').join('')}</div>
      <div class="podrest">${rows.slice(3).map(cardOf).join('')}</div></div>
      ${res.sudden ? '' : `<div class="panel"><h2>สรุปทุกรอบ</h2>${summaryTable(st)}</div>`}`;
  }
  function summaryTable(st) {
    const n = st.x, hs = st.raceHistory;
    const order = st.players.slice().sort((a, b) => b.prizeTotal - a.prizeTotal || a.seat - b.seat);
    return `<div class="tscroll"><table class="sum"><tr><th class="nm">ชื่อ</th>${Array.from({ length: n }, (_, i) => `<th>R${i + 1}${hs[i] && hs[i].event ? `<span class="evs">${EV[hs[i].event].i}</span>` : ''}</th>`).join('')}<th class="tot">Total</th></tr>
      ${order.map(p => `<tr><td class="nm">${nm(p.id)}</td>${Array.from({ length: n }, (_, i) => {
        const row = hs[i] && hs[i].rows.find(x => x.playerId === p.id);
        return row ? `<td class="${medal(row.rank)}">${row.prize}</td>` : '<td class="dash">–</td>';
      }).join('')}<td class="tot">${p.prizeTotal}</td></tr>`).join('')}</table></div>`;
  }
  const CROWN = c => `<svg class="crown ${c}" viewBox="0 0 24 17" aria-hidden="true"><path d="M2 15 L3.5 4 L8.5 9 L12 1.5 L15.5 9 L20.5 4 L22 15 Z"/><rect x="2" y="14" width="20" height="2.6" rx="1"/></svg>`;
  function podium(items) {
    const col = it => !it ? '<div class="pcol"></div>' : `<div class="pcol r${Math.min(it.rank, 3)}">${CROWN(medal(it.rank))}
      <div class="pname ell">${nm(it.pid)}</div>${it.sub ? `<div class="psub ell">${it.sub}</div>` : ''}
      <div class="step ${medal(it.rank)}"><div class="prk">${it.rank}</div><div class="pval">${it.value}</div></div></div>`;
    return `<div class="podium">${col(items[1])}${col(items[0])}${col(items[2])}</div>`;
  }
  function restList(items) {
    return items.length ? `<div class="rest">${items.map(it => `<div class="rrow"><span class="rk">${it.rank}</span><span class="grow ell">${nm(it.pid)} <span class="small muted">${it.sub || ''}</span></span><span class="rv">${it.value}</span></div>`).join('')}</div>` : '';
  }
  function viewOver(st) {
    const n = st.x, hs = st.raceHistory, S2 = st.standings;
    const it = s => ({ rank: s.rank, pid: s.playerId, value: s.prizeTotal, sub: `ได้ที่ 1 × ${s.firstPlaces}${s.left ? ' · ออกแล้ว' : ''}` });
    const why = { prize: 'ตัดสินด้วย Prize รวม', firstPlaces: 'Prize เท่ากัน — ตัดสินด้วยจำนวนครั้งที่ได้ที่ 1', shared: 'Prize และจำนวนที่ 1 เท่ากัน — ชนะร่วม', suddenDeath: 'คะแนนเสมอ — ตัดสินด้วย Sudden Death' }[st.tieBreak] || '';
    return `<div class="panel"><div class="center"><div class="winlbl">WINNER</div><div class="small muted">${why}</div></div>
      ${podium(S2.slice(0, 3).map(it))}${restList(S2.slice(3).map(it))}</div>
      <div class="panel"><h2>Prize แต่ละรอบ</h2><div class="tscroll"><table class="sum"><tr><th>#</th><th class="nm">ชื่อ</th>${Array.from({ length: n }, (_, i) => `<th>R${i + 1}</th>`).join('')}<th class="tot">Total</th></tr>
      ${S2.map(s => `<tr><td class="${medal(s.rank)}">${s.rank}</td><td class="nm">${nm(s.playerId)}</td>${Array.from({ length: n }, (_, i) => {
        const row = hs[i] && hs[i].rows.find(x => x.playerId === s.playerId);
        return row ? `<td class="${medal(row.rank)}">${row.prize}</td>` : '<td class="dash">–</td>';
      }).join('')}<td class="tot">${s.prizeTotal}</td></tr>`).join('')}</table></div>
      ${overButtons()}</div>`;
  }
  const overButtons = () => `<button class="primary" style="width:100%;margin-top:12px" data-act="to-lobby">กลับสู่ Lobby</button>
      <button class="ghost" style="width:100%;margin-top:8px" data-act="home">กลับหน้าแรก</button>`;

  // ---------- กล่องผลที่ผ่านมา ----------
  function viewHistory(st) {
    if (!st.auctionHistory.length) return '';
    const open = S.ui.hist;
    let inner = '';
    if (open) {
      const tab = S.ui.histTab;
      inner = `<div class="tabs"><button class="${tab === 'auction' ? 'on' : ''}" data-act="tab" data-tab="auction">ผลประมูล</button><button class="${tab === 'race' ? 'on' : ''}" data-act="tab" data-tab="race">ผลการแข่ง</button></div>`;
      if (tab === 'auction') {
        const hs = st.auctionHistory, k = S.ui.histA != null && hs.some(h => h.no === S.ui.histA) ? S.ui.histA : hs[hs.length - 1].no;
        const res = hs.find(h => h.no === k);
        inner += `<div class="rchips">${hs.map(h => `<button class="${h.no === k ? 'on' : ''}" data-act="hist-a" data-no="${h.no}">A${h.no}</button>`).join('')}</div>
          <div class="small muted">Auction ${of(res.no, st.x)} · ${esc(P(res.openerId).name)} เปิด · <span style="color:var(--ink)">${esc(P(res.winnerId).name)} ชนะ ${res.price} Coins</span></div>${allocGrid(st, res, 'hist')}`;
      } else inner += st.raceHistory.length ? summaryTable(st) : '<div class="small muted">ยังไม่มีผลการแข่ง</div>';
    }
    return `<div class="panel stack"><button class="fold" data-act="fold" data-key="hist" aria-expanded="${open}"><span>${open ? '▾' : '▸'} ผลการแข่งและการประมูลที่ผ่านมา</span><span class="small muted">${open ? 'กดเพื่อยุบ' : ''}</span></button>${inner}</div>`;
  }

  function viewGame(st) {
    const watching = !st.me || st.myLeft;
    let main = '';
    if (st.phase === 'cancelled') main = `<div class="panel"><div class="winner">เกมถูกยกเลิก</div><div class="muted">ผู้เล่นทุกคนออกจากเกม</div>${overButtons()}</div>`;
    else if (st.phase === 'gameOver') main = viewOver(st);
    else if (st.auction) main = viewAuction(st);
    else if (st.race) main = viewRace(st);
    const leaveBar = S.confirmLeave
      ? `<div class="panel stack"><div>ออกจากเกม? ระบบจะเล่นแทนคุณจนจบ คะแนนยังนับ (ยังมีสิทธิ์ชนะ) และกลับมาเป็นผู้เล่นไม่ได้</div><div class="row"><button class="danger grow" data-act="leave">ยืนยันออก</button><button class="grow" data-act="leave-cancel">เล่นต่อ</button></div></div>` : '';
    const step = introStep();
    return `${topBar(st, `<div class="row"><span class="code">${esc(st.code)}</span> <span class="pill">${phaseLabel[st.phase] || ''}</span></div>`)}
      ${st.paused ? `<div class="pausebar">❚❚ หยุดชั่วคราวโดยเจ้าของห้อง${st.me === st.hostId ? ' — กด ▶ เพื่อเล่นต่อ' : ''}</div>` : ''}
      ${watching ? `<div class="banner">${st.myLeft ? 'คุณออกจากเกมแล้ว — กำลังชม' : 'กำลังชม'} · ผู้ชม ${st.spectators} คน</div>` : ''}
      ${main}${['gameOver', 'cancelled', 'raceRun'].includes(st.phase) ? '' : viewHistory(st)}${leaveBar}${step ? viewIntro(st, step) : ''}`;
  }

  // ---------- เมนู ⋮ และหน้าต่าง ----------
  function viewMenu(st) {
    if (!S.ui.menu) return '';
    const vol = k => Math.round((Snd.get(k) || 0) * 100);
    const inGame = st && st.phase !== 'lobby' && !['gameOver', 'cancelled'].includes(st.phase) && st.me && !st.myLeft;
    const sw = (k, label) => `<div class="tg"><button class="sw ${Snd.get(k) ? 'on' : ''}" data-act="snd-toggle" data-key="${k}" role="switch" aria-checked="${!!Snd.get(k)}" aria-label="${label}"><i></i></button><span class="grow">${label}</span></div>`;
    return `<div class="sheet-bg" data-act="menu-close"></div><div class="sheet menu" role="dialog" aria-label="เมนู">
      <div class="row"><b class="grow">เมนู</b><button class="ib" data-act="menu-close" aria-label="ปิด">✕</button></div>
      <div class="vol"><label for="v-music">เพลง</label><input id="v-music" type="range" min="0" max="100" value="${vol('music')}" data-vol="music"></div>
      <div class="vol"><label for="v-sfx">เสียงเอฟเฟกต์</label><input id="v-sfx" type="range" min="0" max="100" value="${vol('sfx')}" data-vol="sfx"></div>
      <div class="vol"><label for="v-engine">เสียงเครื่องยนต์</label><input id="v-engine" type="range" min="0" max="100" value="${vol('engine')}" data-vol="engine"></div>
      ${sw('muted', 'ปิดเสียงทั้งหมด')}${sw('vibrate', 'สั่น (Android)')}${sw('tips', 'ข้อความช่วย')}
      <button data-act="fullscreen">เต็มจอ</button>
      <button data-act="modal" data-m="rules">วิธีเล่น / กติกาห้องนี้</button>
      <button data-act="modal" data-m="gallery">ดูรถทั้ง ${S.cards.size || 50} คัน</button>
      ${st ? (inGame ? '<button class="danger" data-act="leave">ออกจากเกม</button>' : st.phase === 'lobby' && st.me ? '<button class="danger" data-act="leave">ออกจากห้อง</button>' : '<button class="danger" data-act="home">กลับหน้าแรก</button>') : ''}
    </div>`;
  }
  function viewModal(st) {
    const m = S.ui.modal; if (!m) return '';
    let title = '', body = '';
    if (m === 'rules') {
      const s = st ? st.settings : { mode: 'classic', toggles: {} };
      title = 'วิธีเล่น';
      body = `${st ? `<div class="panel2"><b>ห้องนี้: ${MODE[s.mode].n}</b><div class="small">${MODE[s.mode].d}</div>${CFG.TOGGLES.filter(k => s.toggles[k]).map(k => `<div class="small"><b>${TOG[k].n}</b> — ${TOG[k].d}</div>`).join('')}</div>` : ''}
        <ol class="small rules">
          <li>ผู้เล่น 2–7 คน ประมูลรถ x รอบ แต่ละคนได้รถรอบละ 1 คัน</li>
          <li><b>Classic</b>: ผลัดกัน bid ผู้ชนะจ่ายคนเดียว ได้คันแรงสุด ที่เหลือแจกตามที่นั่งถัดไป</li>
          <li><b>Chaos</b>: ทุกคนจ่ายเท่ายอด bid สูงสุดของตัวเอง ลงมากได้คันแรงกว่า</li>
          <li><b>Shadow Auction</b>: ใส่ราคาลับพร้อมกัน ทุกคนจ่ายตามที่ใส่ ราคาเท่ากันเรียงตามที่นั่ง</li>
          <li>ช่วงแข่ง: ทุก Race เลือกรถลับ 1 คัน Power สูงกว่าได้ Prize มากกว่า ใช้แล้วใช้ซ้ำไม่ได้</li>
          <li>ระหว่างวิ่ง ความเร็วสุ่ม — ผลจริงเปิดตอนเข้าเส้นชัยและบนแท่นรับรางวัล</li>
          <li>Prize รวมมากสุดชนะ · เท่ากันดูจำนวนครั้งที่ได้ที่ 1 · Coins ที่เหลือไม่นับคะแนน</li>
          <li>Grand Campaign: ${Object.values(EV).map(e => `${e.i} ${e.n}`).join(' · ')}</li>
        </ol><div class="small muted">โมเดลรถ Kenney Car Kit (CC0) · kenney.nl</div>`;
    } else if (m === 'gallery') {
      title = `รถทั้ง ${S.cards.size} คัน`;
      body = `<div class="grid g3">${[...S.cards.values()].sort((a, b) => b.power - a.power).map(c => cardBox(c.id, 'gal', 0, {})).join('')}</div>`;
    } else if (m.startsWith('ev-')) { const e = EV[m.slice(3)] || {}; title = `${e.i || ''} ${e.n || ''}`; body = `<p>${esc(e.d || '')}</p>`; }
    else if (m === 'help-crown') { title = '♛ มงกุฎ'; body = '<p>แชมป์ของ Race ล่าสุด · 🔥 ตัวเลข = ชนะติดกันกี่ Race</p>'; }
    return `<div class="sheet-bg" data-act="modal-close"></div><div class="sheet modal" role="dialog" aria-label="${esc(title)}"><div class="row"><b class="grow">${esc(title)}</b><button class="ib" data-act="modal-close" aria-label="ปิด">✕</button></div><div class="mbody">${body}</div></div>`;
  }

  // FLIP สำหรับชื่อใต้การ์ด / การ์ดที่แทรกตามความแรง
  function flip(before) {
    if (!before.size || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    document.querySelectorAll('[data-flip]').forEach(el => {
      const b0 = before.get(el.dataset.flip); if (!b0 || b0.slot === el.dataset.slot) return;
      const r0 = b0.r, r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = 'none'; el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect();
      el.style.transition = 'transform .55s cubic-bezier(.2,.8,.2,1)'; el.style.transform = '';
      el.classList.add('moved'); setTimeout(() => el.classList.remove('moved'), 700);
    });
  }

  // ---------- พลุกระดาษ ----------
  const cfx = document.createElement('canvas'); cfx.className = 'confetti'; document.body.appendChild(cfx);
  let conf = [], confRaf = null;
  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const k = window.devicePixelRatio || 1; cfx.width = innerWidth * k; cfx.height = innerHeight * k;
    const cs = ['#ffd24a', '#38e1ff', '#ff5a5a', '#2fd27b', '#b77bff', '#ffffff'];
    for (let i = 0; i < 160; i++) conf.push({ x: cfx.width / 2 + (Math.random() - .5) * cfx.width * .4, y: cfx.height * .3, vx: (Math.random() - .5) * 9 * k, vy: (-Math.random() * 9 - 3) * k, s: (4 + Math.random() * 6) * k, c: cs[i % cs.length], r: Math.random() * 6, vr: (Math.random() - .5) * .3, life: 3.5 });
    if (!confRaf) { let last = performance.now(); const loop = t => { const dt = Math.min(.05, (t - last) / 1000); last = t; const g = cfx.getContext('2d'); g.clearRect(0, 0, cfx.width, cfx.height);
      conf = conf.filter(c => c.life > 0); conf.forEach(c => { c.life -= dt; c.vy += 14 * k * dt * 2; c.x += c.vx; c.y += c.vy; c.r += c.vr; g.save(); g.translate(c.x, c.y); g.rotate(c.r); g.globalAlpha = Math.min(1, c.life); g.fillStyle = c.c; g.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2); g.restore(); });
      confRaf = conf.length ? requestAnimationFrame(loop) : null; }; const k = window.devicePixelRatio || 1; confRaf = requestAnimationFrame(loop); }
  }

  // ---------- หน้าแข่ง 3D (mount แบบคง element ไว้ข้าม render) ----------
  let run = null;
  function mountRun() {
    const host = document.getElementById('runhost'), st = S.st;
    if (!host || !st || st.phase !== 'raceRun' || !st.race || !st.race.run) { if (run) { run.ctl && run.ctl.destroy(); run = null; } return; }
    const key = st.code + ':' + st.race.no + ':' + st.race.run.runSeed;
    if (!run || run.key !== key) {
      if (run && run.ctl) run.ctl.destroy();
      const players = new Map(st.players.map(p => [p.id, { name: p.name, color: color(p.id), crown: st.crownId === p.id, streak: p.streak }]));
      run = { key, ctl: null, fail: false };
      const ctx = {
        me: st.me && !st.myLeft ? st.me : null, players, artUrl, runAt: st.race.runAt, now,
        sound: (n, o) => Snd.play(n, o), vibrate: vib, engine: lvl => Snd.engine(lvl),
        onFail: () => { run.fail = true; }
      };
      run.ctl = window.Race3D ? Race3D.race(host, st.race.run, ctx) : null;
      if (!run.ctl) run.fail = true;
    }
    if (run.ctl && run.ctl.el.parentNode !== host) host.appendChild(run.ctl.el);
    if (run.fail) { // R-16-03 ไม่มี WebGL → แสดงลำดับเป็นข้อความ
      host.innerHTML = `<div class="nogl"><div class="small muted">เครื่องนี้แสดง 3D ไม่ได้ — ลำดับเข้าเส้นชัย</div>${st.race.run.order.map((pid, i) => `<div class="rrow"><span class="rk">${i + 1}</span>${dot(pid)}<span class="grow">${esc(P(pid).name)}</span></div>`).join('')}</div>`;
    }
  }
  function mountViewer() {
    const host = document.getElementById('mview'), st = S.st;
    if (!host || !st || !st.me || !window.Race3D || !Race3D.hasGL) return;
    Race3D.viewer(host, P(st.me).modelId);
  }
  // โหลดล่วงหน้าโมเดลที่ผู้เล่นในห้องเลือก (F-41)
  let preKey = '';
  function preload(st) { if (!st || !window.Race3D) return; const ids = st.players.map(p => p.modelId); const k = ids.join(','); if (k !== preKey) { preKey = k; Race3D.preload(ids); } }

  // ---------- กันจอดับ (F-31) ----------
  let wake = null;
  async function wakeLock(on) {
    try {
      if (on && !wake && navigator.wakeLock && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { wake = null; }
  }
  document.addEventListener('visibilitychange', () => { const st = S.st; wakeLock(!!(st && st.phase !== 'lobby' && !['gameOver', 'cancelled'].includes(st.phase))); });

  // ---------- render ----------
  function render() {
    const app = $('#app');
    const f = document.activeElement && document.activeElement.id;
    const sel = f && document.activeElement.selectionStart;
    const scroll = window.scrollY;
    const st = S.st;
    document.body.className = st && PH[st.phase] ? 'p' + PH[st.phase] : '';
    let html = '';
    if (S.everConnected && !S.connected) html += '<div class="banner">กำลังเชื่อมต่อใหม่…</div>'; // F-38
    if (!st) html += viewHome();
    else if (st.phase === 'lobby' && S.lastOver && S.lastOver.code === st.code && S.cardsReady) {
      const live = S.st; S.st = S.lastOver; html += viewGame(S.lastOver); S.st = live;
      document.body.className = '';
    } else if (st.phase === 'lobby') html += viewLobby(st);
    else html += S.cardsReady ? viewGame(st) : '<div class="panel muted">กำลังโหลดการ์ด…</div>';
    if (S.banner && Date.now() < S.banner.until) html += `<div class="turnbanner ${S.banner.cls || ''}" role="status">${esc(S.banner.text)}</div>`;
    html += viewMenu(st) + viewModal(st);
    const before = new Map();
    app.querySelectorAll('[data-flip]').forEach(el => before.set(el.dataset.flip, { r: el.getBoundingClientRect(), slot: el.dataset.slot }));
    // เก็บ element 3D ไว้ก่อนเขียน HTML ใหม่
    const keep = [...app.querySelectorAll('.r3d, .mv')]; keep.forEach(el => el.remove());
    app.innerHTML = html;
    placeCards();
    flip(before);
    mountRun();
    mountViewer();
    preload(st);
    wakeLock(!!(st && st.phase !== 'lobby' && !['gameOver', 'cancelled'].includes(st.phase)));
    if (f && document.getElementById(f)) {
      const el = document.getElementById(f); el.focus({ preventScroll: true });
      try { if (sel != null && el.setSelectionRange && el.type !== 'number' && el.type !== 'range') el.setSelectionRange(sel, sel); } catch (e) { /* */ }
    }
    if (Math.abs(window.scrollY - scroll) > 2) window.scrollTo(0, scroll);
    const r = remain();
    document.querySelectorAll('.js-timer').forEach(el => { el.textContent = r == null ? '' : r; });
  }
  render();
})();
