// กติกาทั้งหมดของ บิดไปสมาชิก (Bid Now, Race Later) v2.0 — อ้างรหัสกติกาจาก spec.md v2.0
// ไม่ import express / socket.io เพื่อให้ทดสอบได้โดยไม่เปิดเซิร์ฟเวอร์
'use strict';
const crypto = require('crypto');
const CFG = require('./shared/config');

class GameError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const MSG = {
  NOT_ENOUGH_PLAYERS: 'ต้องมีผู้เล่นอย่างน้อย 2 คน',
  ROOM_FULL: 'ห้องเต็มแล้ว',
  GAME_STARTED: 'เกมเริ่มไปแล้ว เข้าได้เฉพาะผู้ชม',
  BAD_NAME: `ชื่อต้องยาว 1–${CFG.NAME_MAX_CHARS} ตัวอักษร`,
  NOT_HOST: 'เฉพาะเจ้าของห้องเท่านั้น',
  WRONG_PHASE: 'ทำแบบนี้ตอนนี้ไม่ได้',
  NOT_YOUR_TURN: 'ยังไม่ถึงตาของคุณ',
  STALE_STATE: 'มีคน bid ก่อนคุณ ลองใหม่อีกครั้ง',
  BAD_AMOUNT: 'จำนวน Coins ต้องเป็นจำนวนเต็ม',
  BID_TOO_LOW: 'bid ต่ำเกินไป',
  BID_OVER_COINS: 'Coins ไม่พอ',
  CAR_NOT_OWNED: 'คุณไม่มีรถคันนี้ หรือใช้ไปแล้ว',
  NO_SELECTION: 'เลือกก่อน',
  ALREADY_CONFIRMED: 'ยืนยันไปแล้ว',
  SPECTATOR_ONLY: 'ผู้ชมทำแบบนี้ไม่ได้',
  DUPLICATE_REQUEST: 'คำสั่งนี้ทำไปแล้ว',
  UNKNOWN_PLAYER: 'ไม่พบผู้เล่น',
  BAD_ROUNDS: 'จำนวนรอบไม่ถูกต้อง',
  BAD_SETTING: 'ค่าการตั้งค่าไม่ถูกต้อง',
  BAD_MODEL: 'ไม่พบโมเดลรถนี้',
  BAD_TARGET: 'เลือกผู้เล่นไม่ถูกต้อง',
  BAD_NITRO: 'จำนวน Nitro ไม่ถูกต้อง',
  CANNOT_SKIP: 'ข้ามตอนนี้ไม่ได้',
  CANNOT_PAUSE: 'หยุดตอนนี้ไม่ได้',
  PAUSED: 'เกมหยุดชั่วคราวอยู่'
};
const err = (code, extra) => new GameError(code, MSG[code] + (extra ? ` (${extra})` : ''));

// R-7-20 สุ่ม Prize ตามน้ำหนัก
function drawPrize(rand) {
  const total = CFG.PRIZE_TABLE.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of CFG.PRIZE_TABLE) { if ((r -= w) < 0) return v; }
  return CFG.PRIZE_TABLE[CFG.PRIZE_TABLE.length - 1][0];
}
function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const newId = () => crypto.randomBytes(8).toString('hex');
const newToken = () => crypto.randomBytes(16).toString('hex');
const isInt = v => typeof v === 'number' && Number.isInteger(v);
const defaultToggles = mode => ({ nitro: false, refund: mode !== 'classic', campaign: false, mystery: false, suddenDeath: false });

class Room {
  /**
   * @param {string} code
   * @param {{cards:Array<{id,name,power}>, models?:string[], onChange?:Function, onEvent?:Function, rand?:Function, log?:Function, now?:Function, introSeconds?:number}} opts
   */
  constructor(code, opts = {}) {
    this.code = code;
    this.catalog = new Map((opts.cards || []).map(c => [c.id, c]));
    this.modelIds = (opts.models || []).slice();
    this.onChange = opts.onChange || (() => {});
    this.onEvent = opts.onEvent || (() => {});
    this.rand = opts.rand || Math.random;
    this.log = opts.log || (() => {});
    this.now = opts.now || Date.now;
    this.introSeconds = opts.introSeconds != null ? opts.introSeconds : CFG.INTRO_SECONDS; // test ส่ง 0 ได้ (ข้ามป้ายทั้งหมด)
    this.players = []; // ลำดับ = ลำดับที่เข้าห้อง (ก่อนเริ่ม) / ที่นั่ง (หลังเริ่ม)
    this.hostId = null;
    this.phase = 'lobby';
    this.version = 0;
    this.timer = null; this.endsAt = null; this.onTimer = null; this.paused = null;
    this.spectators = 0;
    this.roundsSet = null; // null = ใช้ค่าเริ่มต้น (= จำนวนผู้เล่น)
    this.settings = { mode: CFG.DEFAULT_MODE, toggles: defaultToggles(CFG.DEFAULT_MODE), campaignAll: false, coinsOverride: null, sceneLock: null };
    this.lastActivity = this.now();
    this.resetMatch();
  }

  resetMatch() {
    this.x = 0; this.n = 0; this.startCoins = 0;
    this.carSets = []; this.mystery = []; this.campaign = [];
    this.auction = null; this.auctionNo = 0; this.auctionHistory = [];
    this.race = null; this.raceNo = 0; this.raceHistory = []; this.sudden = null;
    this.standings = null; this.tieBreak = null; this.cancelReason = null;
    this.intro = null; this.paused = null; this.crownId = null;
    this.events = [];
  }

  // ---------- util ----------
  player(pid) { const p = this.players.find(q => q.id === pid); if (!p) throw err('UNKNOWN_PLAYER'); return p; }
  bySeat(seat) { return this.players.find(p => p.seat === seat); }
  bump() { this.version++; this.lastActivity = this.now(); this.onChange(this); }
  emit(type, data) { this.onEvent(this, type, data); }
  logEvent(type, data) { // R-12-11
    const e = { t: this.now(), type, ...data };
    this.events.push(e);
    this.log(`[room ${this.code}] ${JSON.stringify(e)}`);
  }
  card(id) { return this.catalog.get(id); }
  sortCars(ids) { return ids.slice().sort((a, b) => this.card(b).power - this.card(a).power); } // R-4-03
  get mode() { return this.settings.mode; }
  tog(k) { return !!this.settings.toggles[k]; }
  randomModel() { return this.modelIds.length ? this.modelIds[Math.floor(this.rand() * this.modelIds.length)] : null; }

  setTimer(seconds, fn) { this.setTimerMs(seconds * 1000, fn); }
  setTimerMs(ms, fn) {
    this.clearTimer();
    this.endsAt = this.now() + ms;
    this.onTimer = fn;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { const f = this.onTimer; this.onTimer = null; this.endsAt = null; f && f(); }
      catch (e) { this.log(`[room ${this.code}] timer error: ${e.stack || e}`); }
      this.bump();
    }, Math.max(0, ms));
    if (this.timer.unref) this.timer.unref();
  }
  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.endsAt = null; this.onTimer = null; }
  // ป้ายประกาศ: แสดงทีละป้าย (ป้ายละ sec หรือ introSeconds) แล้วจึงเรียก then() ซึ่งเริ่มนับเวลาของเฟส — R-10-07
  runIntro(steps, then) {
    if (!this.introSeconds || !steps.length) { this.intro = null; then(); return; }
    let t = this.now();
    this.intro = { steps: steps.map(s => { t += (s.sec != null ? s.sec : this.introSeconds) * 1000; const o = { ...s, endsAt: t }; delete o.sec; return o; }) };
    this.setTimerMs(t - this.now(), () => { this.intro = null; then(); });
  }
  // ให้ test เรียกแทนรอเวลาจริง
  endPhaseNow() { if (this.paused) this.resumeTimer(); const f = this.onTimer; this.clearTimer(); if (f) f(); this.bump(); }
  destroy() { this.clearTimer(); }

  // ---------- lobby ----------
  cleanName(name) {
    const n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (!n || [...n].length > CFG.NAME_MAX_CHARS) throw err('BAD_NAME');
    let out = n, k = 2;
    while (this.players.some(p => p.name === out)) out = `${n} (${k++})`;
    return out;
  }
  join(name) {
    if (this.phase !== 'lobby') throw err('GAME_STARTED');
    if (this.players.length >= CFG.PLAYERS_MAX) throw err('ROOM_FULL');
    const p = {
      id: newId(), token: newToken(), name: this.cleanName(name), seat: this.players.length,
      connected: true, left: false, disconnectedAt: null, coins: 0, cars: [], prizeTotal: 0, firstPlaces: 0,
      modelId: this.randomModel(), streak: 0, reqIds: [] // R-7-73 ค่าเริ่มต้นสุ่มตอนเข้าห้อง
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.bump();
    return p;
  }
  resume(pid, token) {
    const p = this.players.find(q => q.id === pid);
    if (!p || p.token !== token) return null;
    return p;
  }
  setConnected(pid, on) {
    const p = this.players.find(q => q.id === pid); if (!p) return;
    p.connected = on; p.disconnectedAt = on ? null : this.now();
    this.bump();
  }
  removeFromLobby(p) {
    this.players = this.players.filter(q => q !== p);
    this.players.forEach((q, i) => { q.seat = i; });
    if (this.hostId === p.id) this.hostId = this.players[0] ? this.players[0].id : null;
  }
  // R-7-75 สิทธิ์ host ไปที่นั่งถัดไปที่เชื่อมต่ออยู่และยังไม่ออก
  passHost(fromSeat) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const q = this.players.find(p => p.seat === (fromSeat + i) % n);
      if (q && q.connected && !q.left && q.id !== this.hostId) { this.hostId = q.id; this.emit('host:changed', { hostId: q.id }); return true; }
    }
    return false;
  }
  leave(pid) {
    const p = this.players.find(q => q.id === pid); if (!p) return;
    if (this.phase === 'lobby') { this.removeFromLobby(p); this.bump(); return; }
    if (p.left) return;
    p.left = true; // R-12-06
    this.logEvent('leave', { pid: p.id });
    if (this.hostId === p.id) this.passHost(p.seat);
    if (['gameOver', 'cancelled'].includes(this.phase)) { this.bump(); return; }
    if (this.players.every(q => q.left)) { this.cancel('all_left'); return; } // R-12-08
    if (this.phase === 'auction' && this.auction && this.auction.turnId === p.id && !this.paused) this.doPass(p.id, 'left');
    if (this.phase === 'shadowBid' && this.auction && !this.auction.confirmed.has(p.id) && !this.auction.broke.has(p.id)) {
      this.shadowAuto(p, true); this.checkShadowEarly();
    }
    if (this.phase === 'racePick' && this.race && this.inRace(p) && !this.race.confirmed.has(p.id)) {
      this.autoPick(p, true); // R-7-23
      this.checkRaceEarly();
    }
    this.bump();
  }
  cancel(reason) {
    this.clearTimer();
    this.intro = null; this.paused = null;
    this.phase = 'cancelled'; this.cancelReason = reason;
    this.logEvent('cancelled', { reason });
    this.emit('game:cancelled', { reason });
    this.bump();
  }
  // lobby: host หลุดเกิน maxAwayMs · ระหว่างเกม: host หลุดเกิน gameAwayMs → ส่งต่อ (R-7-75)
  transferHostIfNeeded(maxAwayMs = 60000, gameAwayMs = 15000) {
    const h = this.players.find(p => p.id === this.hostId);
    const limit = this.phase === 'lobby' ? maxAwayMs : gameAwayMs;
    if (h && !h.connected && h.disconnectedAt && this.now() - h.disconnectedAt > limit) {
      if (this.phase === 'lobby') { const next = this.players.find(p => p.connected); if (next) { this.hostId = next.id; this.bump(); } }
      else if (this.passHost(h.seat)) this.bump();
    }
  }

  dedupe(p, requestId) { // R-12-07
    if (requestId == null) return;
    const id = String(requestId).slice(0, 64);
    if (p.reqIds.includes(id)) throw err('DUPLICATE_REQUEST');
    p.reqIds.push(id); if (p.reqIds.length > 100) p.reqIds.shift();
  }

  // ---------- จำนวนรอบ / เงินเริ่มต้น / การตั้งค่า (7.0) ----------
  roundsMax(n = this.players.length) { return Math.floor(this.catalog.size / Math.max(1, n)); }
  effectiveRounds(n = this.players.length) {
    const r = this.roundsSet != null ? this.roundsSet : Math.max(CFG.ROUNDS_MIN, n);
    return Math.max(CFG.ROUNDS_MIN, Math.min(this.roundsMax(n), r));
  }
  // R-5-03 Classic = ⌈ตาราง[n] × รอบ ÷ n⌉ · Chaos/Shadow คูณ CHAOS_COIN_MULT
  startCoinsFor(n, rounds, mode = this.mode) {
    const base = CFG.STARTING_COINS[n]; if (!base) return 0;
    const mult = mode === 'classic' ? 1 : CFG.CHAOS_COIN_MULT;
    return Math.ceil(base * mult * rounds / n - 1e-9);
  }
  recommendedCoins() { return this.startCoinsFor(this.players.length, this.effectiveRounds()); }
  setRounds(pid, data = {}) {
    if (this.phase !== 'lobby') throw err('WRONG_PHASE');
    if (pid !== this.hostId) throw err('NOT_HOST');
    const v = data.rounds;
    if (v === null) { this.roundsSet = null; this.bump(); return; }
    if (!isInt(v) || v < CFG.ROUNDS_MIN || v > this.roundsMax()) throw err('BAD_ROUNDS', `${CFG.ROUNDS_MIN}–${this.roundsMax()} รอบ`);
    this.roundsSet = v;
    this.bump();
  }
  setSettings(pid, data = {}) { // R-7-70 … R-7-72
    if (this.phase !== 'lobby') throw err('WRONG_PHASE');
    if (pid !== this.hostId) throw err('NOT_HOST');
    const s = this.settings, next = { ...s, toggles: { ...s.toggles } };
    if (data.mode !== undefined) {
      if (!CFG.MODES.includes(data.mode)) throw err('BAD_SETTING', 'mode');
      if (data.mode !== s.mode) { next.mode = data.mode; next.toggles.refund = data.mode !== 'classic'; } // R-7-71
    }
    if (data.toggles !== undefined) {
      if (!data.toggles || typeof data.toggles !== 'object') throw err('BAD_SETTING', 'toggles');
      for (const [k, v] of Object.entries(data.toggles)) {
        if (!CFG.TOGGLES.includes(k) || typeof v !== 'boolean') throw err('BAD_SETTING', k);
        next.toggles[k] = v;
      }
    }
    if (data.campaignAll !== undefined) { if (typeof data.campaignAll !== 'boolean') throw err('BAD_SETTING', 'campaignAll'); next.campaignAll = data.campaignAll; }
    if (data.coinsOverride !== undefined) {
      const v = data.coinsOverride;
      if (v !== null && (!isInt(v) || v < CFG.COINS_OVERRIDE_MIN || v > CFG.COINS_OVERRIDE_MAX)) throw err('BAD_SETTING', `Coins ${CFG.COINS_OVERRIDE_MIN}–${CFG.COINS_OVERRIDE_MAX}`);
      next.coinsOverride = v;
    }
    if (data.sceneLock !== undefined) {
      if (data.sceneLock !== null && !CFG.SCENES.includes(data.sceneLock)) throw err('BAD_SETTING', 'scene');
      next.sceneLock = data.sceneLock;
    }
    this.settings = next;
    this.bump();
  }
  setModel(pid, data = {}) { // R-7-73, R-4.2-03
    if (this.phase !== 'lobby') throw err('WRONG_PHASE');
    const p = this.player(pid);
    const id = typeof data.modelId === 'string' ? data.modelId : '';
    if (!this.modelIds.includes(id)) throw err('BAD_MODEL');
    p.modelId = id;
    this.bump();
  }

  // ---------- host (7.8) ----------
  requireHost(pid) { if (pid !== this.hostId) throw err('NOT_HOST'); }
  kick(pid, data = {}) { // R-7-74
    this.requireHost(pid);
    const t = this.players.find(p => p.id === data.target);
    if (!t || t.id === pid) throw err('BAD_TARGET');
    this.logEvent('host:kick', { by: pid, target: t.id });
    if (this.phase === 'lobby') { this.removeFromLobby(t); this.bump(); return { kicked: t.id }; }
    this.leave(t.id);
    return { kicked: t.id };
  }
  transfer(pid, data = {}) {
    this.requireHost(pid);
    const t = this.players.find(p => p.id === data.target);
    if (!t || t.id === pid || !t.connected || t.left) throw err('BAD_TARGET');
    this.hostId = t.id;
    this.logEvent('host:transfer', { from: pid, to: t.id });
    this.emit('host:changed', { hostId: t.id });
    this.bump();
  }
  pausable() {
    if (this.intro || !this.onTimer) return false;
    if (this.phase === 'auction') return !!(this.auction && this.auction.turnId);
    return this.phase === 'shadowBid' || this.phase === 'racePick';
  }
  pause(pid) { // R-7-82
    this.requireHost(pid);
    if (this.paused || !this.pausable()) throw err('CANNOT_PAUSE');
    const remainingMs = Math.max(0, this.endsAt - this.now()), fn = this.onTimer;
    this.clearTimer();
    this.paused = { remainingMs, fn };
    this.logEvent('host:pause', { remainingMs });
    this.emit('game:paused', { remainingMs });
    this.bump();
  }
  resumeTimer() { const p = this.paused; if (!p) return; this.paused = null; this.setTimerMs(p.remainingMs, p.fn); }
  resumeGame(pid) {
    this.requireHost(pid);
    if (!this.paused) throw err('CANNOT_PAUSE');
    const ms = this.paused.remainingMs;
    this.resumeTimer();
    this.logEvent('host:resume', { remainingMs: ms });
    this.emit('game:resumed', { remainingMs: ms });
    this.bump();
  }
  skip(pid) { // R-7-80, R-7-81
    this.requireHost(pid);
    if (this.intro) throw err('CANNOT_SKIP');
    if (this.paused) { this.paused = null; }
    if (this.phase === 'auction' && this.auction && this.auction.turnId) {
      this.logEvent('host:skip', { phase: this.phase, target: this.auction.turnId });
      this.doPass(this.auction.turnId, 'skip');
    } else if (this.phase === 'shadowBid') {
      this.logEvent('host:skip', { phase: this.phase });
      this.shadowDeadline();
    } else if (this.phase === 'racePick') {
      this.logEvent('host:skip', { phase: this.phase });
      this.pickDeadline(true);
    } else throw err('CANNOT_SKIP');
    this.bump();
  }
  checkNotPaused() { if (this.paused) throw err('PAUSED'); }

  // กลับสู่ Lobby หลังจบเกม: คนแรกที่กดพาห้องกลับห้องรอ ผู้เล่นที่ออกระหว่างเกมถูกเอาออก
  backToLobby() {
    if (!['gameOver', 'cancelled'].includes(this.phase)) throw err('WRONG_PHASE');
    this.clearTimer();
    const removed = this.players.filter(p => p.left).map(p => p.id);
    this.players = this.players.filter(p => !p.left);
    this.players.forEach((p, i) => { p.seat = i; p.coins = 0; p.cars = []; p.prizeTotal = 0; p.firstPlaces = 0; p.streak = 0; });
    if (!this.players.some(p => p.id === this.hostId)) this.hostId = this.players[0] ? this.players[0].id : null;
    this.resetMatch();
    this.phase = 'lobby';
    this.logEvent('lobby', { removed });
    this.bump();
    return removed;
  }

  // ---------- setup (หัวข้อ 5) ----------
  start(pid) {
    if (this.phase !== 'lobby') throw err('WRONG_PHASE');
    if (pid !== this.hostId) throw err('NOT_HOST');
    const n = this.players.length;
    if (n < CFG.PLAYERS_MIN || n > CFG.PLAYERS_MAX) throw err('NOT_ENOUGH_PLAYERS'); // R-5-01
    const R = this.effectiveRounds(n);
    if (this.catalog.size < n * R) throw new GameError('CARDS_INVALID', 'ข้อมูลรถไม่พอเริ่มเกม');
    this.resetMatch();
    this.x = R; this.n = n;
    this.startCoins = this.settings.coinsOverride != null ? this.settings.coinsOverride : this.startCoinsFor(n, R); // R-5-03
    this.players = shuffle(this.players, this.rand); // R-5-02
    this.players.forEach((p, i) => {
      p.seat = i; p.coins = this.startCoins; p.cars = []; p.prizeTotal = 0; p.firstPlaces = 0; p.left = false; p.streak = 0;
    });
    const pool = shuffle([...this.catalog.keys()], this.rand).slice(0, n * R); // R-5-04
    for (let k = 0; k < R; k++) this.carSets.push(this.sortCars(pool.slice(k * n, k * n + n)));
    if (this.tog('mystery')) this.mystery = this.carSets.map(set => set[Math.floor(this.rand() * set.length)]); // R-5-05
    this.campaign = this.tog('campaign') ? this.planCampaign(R) : []; // R-5-06
    this.logEvent('start', { rounds: R, players: n, coins: this.startCoins, settings: this.settings, seats: this.players.map(p => p.id), sets: this.carSets, mystery: this.mystery, campaign: this.campaign });
    this.startAuction(1); // R-5-09
    this.bump();
  }
  planCampaign(R) { // R-5-06: ⌈R/2⌉ Race (หรือทุก Race) Race สุดท้ายมีเสมอ ไม่ซ้ำ
    let pool = CFG.CAMPAIGN_EVENTS.filter(e => this.tog('nitro') || !['frenzy', 'ban'].includes(e));
    pool = shuffle(pool, this.rand);
    const want = Math.min(pool.length, this.settings.campaignAll ? R : Math.ceil(R / 2));
    const plan = Array(R).fill(null);
    if (!want) return plan;
    const slots = [R - 1].concat(shuffle(Array.from({ length: R - 1 }, (_, i) => i), this.rand).slice(0, want - 1));
    slots.forEach((s, i) => { plan[s] = pool[i]; });
    return plan;
  }

  // ---------- Phase 1: Auction ----------
  startAuction(k) {
    this.auctionNo = k;
    const opener = this.bySeat((k - 1) % this.n); // R-7-01
    const set = this.carSets[k - 1];
    const base = { no: k, mode: this.mode, set, mysteryId: this.mystery[k - 1] || null, openerId: opener.id,
      startCoins: Object.fromEntries(this.players.map(p => [p.id, p.coins])) };
    const steps = (k === 1 ? [{ kind: 'rules', sec: CFG.RULES_SECONDS }, { kind: 'phase', no: 1 }] : []).concat(
      [{ kind: 'auction', no: k }, { kind: 'lot', no: k, sec: this.n * CFG.LOT_REVEAL_STEP_SECONDS }]);
    if (this.mode === 'shadow') {
      this.phase = 'shadowBid';
      this.auction = { ...base, bids: new Map(), confirmed: new Set(), broke: new Set(), auto: new Set(), reveal: null };
      for (const p of this.players) if (p.coins < CFG.SHADOW_MIN_BID) this.auction.broke.add(p.id); // R-7-41
      for (const p of this.players) if (p.left && !this.auction.broke.has(p.id)) this.shadowAuto(p, true); // R-7-43
      this.logEvent('auction:start', { no: k, mode: 'shadow', opener: opener.id });
      this.runIntro(steps, () => { this.setTimer(CFG.SHADOW_BID_SECONDS, () => this.shadowDeadline()); this.checkShadowEarly(); });
      return;
    }
    this.phase = 'auction';
    const openBid = opener.coins >= CFG.OPENING_BID ? CFG.OPENING_BID : 0; // R-7-02 / R-7-30
    if (this.mode === 'chaos') opener.coins -= openBid; // R-7-30 หักทันที
    this.auction = { ...base, currentBid: openBid, highBidderId: opener.id, turnId: null, seq: 0, out: new Map(),
      committed: Object.fromEntries(this.players.map(p => [p.id, p.id === opener.id ? openBid : 0])), passOrder: [],
      log: [{ pid: opener.id, kind: 'open', amount: openBid }] };
    this.logEvent('auction:start', { no: k, mode: this.mode, opener: opener.id, openBid });
    this.runIntro(steps, () => this.advanceTurn(opener.seat));
  }
  othersAllOut() {
    const a = this.auction;
    return this.players.every(p => p.id === a.highBidderId || a.out.has(p.id));
  }
  canAfford(p, amount) { // Classic: Coins ≥ amount · Chaos: Coins + ยอดที่ลงแล้ว ≥ amount (R-7-31/32)
    const a = this.auction;
    return this.mode === 'chaos' ? p.coins + a.committed[p.id] >= amount : p.coins >= amount;
  }
  markOut(p, kind, reason) {
    const a = this.auction;
    a.out.set(p.id, reason); a.passOrder.push(p.id); // R-7-33
    a.log.push({ pid: p.id, kind, reason });
    this.logEvent('auction:' + kind, { pid: p.id, reason });
  }
  // R-7-03, R-7-04, R-9-01
  advanceTurn(fromSeat) {
    const a = this.auction;
    let seat = fromSeat;
    for (let guard = 0; guard < this.n * 3; guard++) {
      if (this.othersAllOut()) { this.finishAuction(); return; }
      let next = null;
      for (let i = 1; i <= this.n; i++) {
        const p = this.bySeat((seat + i) % this.n);
        if (p.id !== a.highBidderId && !a.out.has(p.id)) { next = p; break; }
      }
      if (!next) { this.finishAuction(); return; }
      seat = next.seat;
      if (!this.canAfford(next, a.currentBid + CFG.MIN_RAISE)) { this.markOut(next, 'out', 'no_money'); continue; }
      if (next.left) { this.markOut(next, 'pass', 'left'); continue; }
      a.turnId = next.id;
      a.seq++;
      this.setTimer(CFG.BID_TURN_SECONDS, () => this.doPass(next.id, 'timeout')); // R-7-05
      return;
    }
    this.finishAuction();
  }
  checkTurn(pid, data) {
    if (this.phase !== 'auction') throw err('WRONG_PHASE');
    this.checkNotPaused();
    const a = this.auction;
    if (data && data.auctionNo != null && Number(data.auctionNo) !== a.no) throw err('WRONG_PHASE');
    if (a.turnId !== pid) throw err('NOT_YOUR_TURN');
    if (data && data.stateVersion != null && Number(data.stateVersion) !== a.seq) throw err('STALE_STATE'); // R-12-07
  }
  raise(pid, data = {}) {
    const p = this.player(pid);
    this.checkTurn(pid, data);
    const amount = data.amount;
    if (!isInt(amount)) throw err('BAD_AMOUNT'); // R-7-06
    const a = this.auction;
    if (amount < a.currentBid + CFG.MIN_RAISE) throw err('BID_TOO_LOW', `ต่ำสุด ${a.currentBid + CFG.MIN_RAISE}`);
    const max = this.mode === 'chaos' ? p.coins + a.committed[pid] : p.coins;
    if (amount > max) throw err('BID_OVER_COINS', `สูงสุด ${max}`);
    this.dedupe(p, data.requestId);
    if (this.mode === 'chaos') p.coins -= amount - a.committed[pid]; // R-7-31 หักส่วนต่าง
    a.committed[pid] = amount;
    a.currentBid = amount; a.highBidderId = pid;
    a.log.push({ pid, kind: 'raise', amount });
    this.logEvent('auction:raise', { pid, amount });
    this.advanceTurn(p.seat);
    this.bump();
  }
  pass(pid, data = {}) {
    const p = this.player(pid);
    this.checkTurn(pid, data);
    this.dedupe(p, data.requestId);
    this.doPass(pid, 'pass');
    this.bump();
  }
  doPass(pid, reason) { // R-7-07
    const a = this.auction;
    if (this.phase !== 'auction' || a.turnId !== pid) return;
    a.turnId = null;
    this.clearTimer();
    this.markOut(this.player(pid), 'pass', reason);
    this.advanceTurn(this.player(pid).seat);
  }
  finishAuction() {
    const a = this.auction;
    this.clearTimer();
    a.turnId = null;
    let ranking, paid;
    if (this.mode === 'chaos') { // R-7-34
      const others = this.players.filter(p => p.id !== a.highBidderId);
      const pos = others.filter(p => a.committed[p.id] > 0).sort((p, q) => a.committed[q.id] - a.committed[p.id]);
      const zero = a.passOrder.slice().reverse().filter(id => id !== a.highBidderId && a.committed[id] === 0);
      const rest = others.filter(p => a.committed[p.id] === 0 && !zero.includes(p.id)).map(p => p.id); // กันตก (ไม่ควรเกิด)
      ranking = [a.highBidderId, ...pos.map(p => p.id), ...zero, ...rest];
      paid = { ...a.committed }; // R-7-36 หักไปแล้วตอน bid
    } else { // Classic R-7-09, R-7-10
      const w = this.player(a.highBidderId);
      ranking = Array.from({ length: this.n }, (_, i) => this.bySeat((w.seat + i) % this.n).id);
      paid = Object.fromEntries(this.players.map(p => [p.id, p.id === w.id ? a.currentBid : 0]));
      w.coins -= a.currentBid;
    }
    this.finalizeAuction(ranking, paid, { committed: { ...a.committed } });
  }
  // แจกรถตามอันดับ + Refund + ผลประมูล (ทุกโหมด) — R-7-35, R-7-50…54, R-7-63
  finalizeAuction(ranking, paid, extra = {}) {
    const a = this.auction;
    const allocation = {};
    a.set.forEach((cid, i) => { // set เรียง Power มาก→น้อย (Mystery ใช้ Power จริง)
      const p = this.player(ranking[i]);
      p.cars = this.sortCars([...p.cars, cid]);
      allocation[p.id] = cid;
    });
    const refund = {};
    if (this.tog('refund')) {
      const n = ranking.length;
      ranking.forEach((pid, i) => {
        if (i === 0) return; // R-7-51
        let v = Math.floor((paid[pid] || 0) * CFG.REFUND_RATIO + 1e-9); // R-7-52
        if (i === n - 1) v += CFG.REFUND_BONUS_LAST; // R-7-53
        else if (i === n - 2) v += CFG.REFUND_BONUS_SECOND_LAST;
        if (v > 0) { refund[pid] = v; this.player(pid).coins += v; }
      });
    }
    const result = { no: a.no, mode: this.mode, winnerId: ranking[0], price: paid[ranking[0]] || 0, openerId: a.openerId,
      ranking: ranking.map(pid => ({ pid, amount: (extra.committed || paid)[pid] || 0 })), allocation, paid, refund,
      mysteryId: a.mysteryId, ...(extra.bids ? { bids: extra.bids } : {}) };
    this.auctionHistory.push(result);
    this.logEvent('auction:result', result);
    this.emit('auction:result', result);
    this.phase = 'auctionResult';
    this.setTimer(CFG.AUCTION_RESULT_SECONDS, () => {
      if (a.no < this.x) this.startAuction(a.no + 1);
      else this.startRace(1);
    });
  }

  // ---------- Shadow Auction (7.3) ----------
  shadowAuto(p, useMin) {
    const a = this.auction;
    if (useMin || !a.bids.has(p.id)) a.bids.set(p.id, Math.min(CFG.SHADOW_MIN_BID, p.coins));
    a.confirmed.add(p.id); a.auto.add(p.id);
    this.logEvent('shadow:auto', { pid: p.id, amount: a.bids.get(p.id) });
  }
  checkShadowPhase() {
    if (this.phase !== 'shadowBid' || this.intro) throw err('WRONG_PHASE');
    this.checkNotPaused();
  }
  shadowBid(pid, data = {}) { // R-7-42
    const p = this.player(pid);
    this.checkShadowPhase();
    const a = this.auction;
    if (data.auctionNo != null && Number(data.auctionNo) !== a.no) throw err('WRONG_PHASE');
    if (a.broke.has(pid)) throw err('BID_OVER_COINS', 'Coins หมด');
    if (a.confirmed.has(pid)) throw err('ALREADY_CONFIRMED');
    const v = data.amount;
    if (!isInt(v)) throw err('BAD_AMOUNT');
    if (v < CFG.SHADOW_MIN_BID) throw err('BID_TOO_LOW', `ต่ำสุด ${CFG.SHADOW_MIN_BID}`);
    if (v > p.coins) throw err('BID_OVER_COINS', `สูงสุด ${p.coins}`);
    a.bids.set(pid, v);
    this.bump();
  }
  shadowConfirm(pid, data = {}) {
    const p = this.player(pid);
    this.checkShadowPhase();
    const a = this.auction;
    if (a.broke.has(pid) || a.confirmed.has(pid)) throw err('ALREADY_CONFIRMED');
    if (!a.bids.has(pid)) throw err('NO_SELECTION');
    this.dedupe(p, data.requestId);
    a.confirmed.add(pid);
    this.logEvent('shadow:confirm', { pid });
    this.checkShadowEarly();
    this.bump();
  }
  checkShadowEarly() {
    if (this.phase !== 'shadowBid' || this.intro) return;
    const a = this.auction;
    if (this.players.every(p => a.broke.has(p.id) || a.confirmed.has(p.id))) { this.clearTimer(); this.paused = null; this.endShadow(); }
  }
  shadowDeadline() { // R-7-43 (รวมกรณี host ข้าม)
    const a = this.auction;
    for (const p of this.players) if (!a.broke.has(p.id) && !a.confirmed.has(p.id)) this.shadowAuto(p, false);
    this.endShadow();
  }
  endShadow() { // R-7-44 … R-7-46
    this.clearTimer();
    const a = this.auction, o = this.player(a.openerId).seat, n = this.n;
    const rel = p => (p.seat - o + n) % n;
    const bidders = this.players.filter(p => !a.broke.has(p.id)).sort((p, q) => a.bids.get(q.id) - a.bids.get(p.id) || rel(p) - rel(q));
    const broke = this.players.filter(p => a.broke.has(p.id)).sort((p, q) => rel(p) - rel(q));
    const ranking = bidders.concat(broke).map(p => p.id);
    const paid = {};
    for (const p of this.players) { paid[p.id] = a.bids.get(p.id) || 0; p.coins -= paid[p.id]; } // R-7-45
    const bids = this.players.map(p => ({ pid: p.id, amount: a.bids.has(p.id) ? a.bids.get(p.id) : null, auto: a.auto.has(p.id), broke: a.broke.has(p.id) }));
    const amounts = [...new Set(bidders.map(p => a.bids.get(p.id)))].sort((x, y) => x - y); // พลิกน้อย→มาก ราคาเท่ากันพร้อมกัน
    const flipGroups = amounts.map(v => bidders.filter(p => a.bids.get(p.id) === v).map(p => p.id));
    a.reveal = { bids, flipGroups, ranking };
    this.phase = 'shadowReveal';
    this.logEvent('shadow:reveal', { no: a.no, bids, ranking });
    this.emit('shadow:reveal', { no: a.no, bids, flipGroups });
    this.setTimer(CFG.SHADOW_REVEAL_SECONDS, () => this.finalizeAuction(ranking, paid, { committed: paid, bids }));
  }

  // ---------- Phase 2: Racing (7.6) ----------
  racers() { const r = this.race; return r && r.participants ? this.players.filter(p => r.participants.includes(p.id)) : this.players; }
  inRace(p) { const r = this.race; return !r || !r.participants || r.participants.includes(p.id); }
  nitroAllowed() { const r = this.race; return this.tog('nitro') && !(r && r.event === 'ban'); }
  startRace(r) {
    this.phase = 'racePick';
    this.raceNo = r;
    const prizes = Array.from({ length: this.n }, () => drawPrize(this.rand)).sort((a, b) => b - a); // R-7-20
    const event = this.campaign[r - 1] || null;
    const scene = this.settings.sceneLock || CFG.SCENES[Math.floor(this.rand() * CFG.SCENES.length)]; // R-5-07
    this.race = { no: r, prizes, event, scene, last: r === this.x, picks: new Map(), confirmed: new Set(), auto: new Set(), result: null, run: null };
    this.logEvent('race:start', { no: r, prizes, event, scene });
    this.emit('race:prizes', { no: r, prizes: event === 'fog' ? null : prizes, event, scene });
    const steps = (r === 1 ? [{ kind: 'phase', no: 2 }] : []).concat([{ kind: 'race', no: r }],
      event ? [{ kind: 'campaign', event, sec: CFG.CAMPAIGN_BANNER_SECONDS }] : []);
    this.beginPick(steps);
  }
  // ช่วงเลือก: Race ปกติ = เลือกรถ + Nitro · Race สุดท้าย/Sudden Death = รถอัตโนมัติ (+ ใส่ Nitro ถ้าเปิด) — R-7-21, R-7-102
  beginPick(steps) {
    const r = this.race;
    const fixedCar = r.last || r.sudden;
    if (fixedCar) {
      for (const p of this.racers()) {
        const cid = r.sudden ? r.suddenCars[p.id] : p.cars[0];
        r.picks.set(p.id, { cardId: cid, nitro: 0 });
        if (!this.nitroAllowed() || p.left || p.coins <= 0) { r.confirmed.add(p.id); r.auto.add(p.id); }
      }
      const needInput = this.racers().some(p => !r.confirmed.has(p.id));
      r.nitroOnly = needInput;
      if (!needInput) { this.runIntro(steps, () => this.setTimer(CFG.LAST_RACE_REVEAL_SECONDS, () => this.toRun())); return; }
    } else {
      for (const p of this.racers()) if (p.left) this.autoPick(p, true); // R-7-23
    }
    this.runIntro(steps, () => {
      this.setTimer(CFG.PICK_SECONDS, () => this.pickDeadline(false)); // R-7-22 นับหลังป้ายจบ
      this.checkRaceEarly();
    });
  }
  randomCar(p) { return p.cars[Math.floor(this.rand() * p.cars.length)]; }
  autoPick(p, zeroNitro) {
    const r = this.race;
    if (r.confirmed.has(p.id)) return;
    const cur = r.picks.get(p.id) || {};
    const cardId = cur.cardId || this.randomCar(p);
    r.picks.set(p.id, { cardId, nitro: zeroNitro ? 0 : (cur.nitro || 0) });
    r.confirmed.add(p.id); r.auto.add(p.id);
    this.logEvent('race:auto', { pid: p.id, card: cardId });
  }
  checkPickPhase(data) {
    if (this.phase !== 'racePick' || this.intro) throw err('WRONG_PHASE');
    this.checkNotPaused();
    const r = this.race;
    if (data.raceNo != null && Number(data.raceNo) !== r.no) throw err('WRONG_PHASE');
    if ((r.last || r.sudden) && !r.nitroOnly) throw err('WRONG_PHASE'); // R-7-21 ไม่มีช่วงเลือก
  }
  select(pid, data = {}) {
    const p = this.player(pid);
    this.checkPickPhase(data);
    const r = this.race;
    if (!this.inRace(p)) throw err('WRONG_PHASE');
    if (r.confirmed.has(pid)) throw err('ALREADY_CONFIRMED');
    const cur = r.picks.get(pid) || { cardId: null, nitro: 0 };
    let cardId = cur.cardId;
    if (data.cardId !== undefined) {
      const cid = typeof data.cardId === 'string' ? data.cardId : '';
      if (r.last || r.sudden) { if (cid !== cur.cardId) throw err('CAR_NOT_OWNED'); }
      else if (!p.cars.includes(cid)) throw err('CAR_NOT_OWNED');
      cardId = cid;
    }
    let nitro = cur.nitro || 0;
    if (data.nitro !== undefined) { // R-7-90
      const v = data.nitro;
      if (!isInt(v) || v < 0 || v > Math.min(CFG.NITRO_MAX_COINS, p.coins) || (v > 0 && !this.nitroAllowed())) throw err('BAD_NITRO');
      nitro = v;
    }
    r.picks.set(pid, { cardId, nitro });
    this.logEvent('race:select', { pid, card: cardId, nitro });
    this.bump();
  }
  confirm(pid, data = {}) {
    const p = this.player(pid);
    this.checkPickPhase(data);
    const r = this.race;
    if (!this.inRace(p)) throw err('WRONG_PHASE');
    if (r.confirmed.has(pid)) throw err('ALREADY_CONFIRMED');
    if (!r.picks.has(pid) || !r.picks.get(pid).cardId) throw err('NO_SELECTION');
    this.dedupe(p, data.requestId);
    r.confirmed.add(pid);
    this.logEvent('race:confirm', { pid, card: r.picks.get(pid).cardId });
    this.emit('race:picked', { no: r.no, playerId: pid });
    this.checkRaceEarly();
    this.bump();
  }
  checkRaceEarly() { // R-7-25
    const r = this.race;
    if (this.phase === 'racePick' && !this.intro && this.racers().every(p => r.confirmed.has(p.id))) {
      if ((r.last || r.sudden) && !r.nitroOnly) return; // ใช้ LAST_RACE_REVEAL_SECONDS
      this.clearTimer(); this.paused = null;
      this.toRun();
    }
  }
  pickDeadline(skip) { // R-7-24 (host ข้าม = Nitro 0)
    const r = this.race;
    for (const p of this.racers()) {
      if (r.confirmed.has(p.id)) continue;
      const cur = r.picks.get(p.id) || {};
      if (!cur.cardId) r.picks.set(p.id, { cardId: this.randomCar(p), nitro: 0 });
      else if (skip) r.picks.set(p.id, { cardId: cur.cardId, nitro: 0 });
      r.confirmed.add(p.id); r.auto.add(p.id);
      this.logEvent('race:auto', { pid: p.id, card: r.picks.get(p.id).cardId, skip: !!skip });
    }
    this.toRun();
  }
  // R-7-26 คำนวณผล แล้วเข้า RACE_RUN (ยังไม่เปิด Power/Nitro/Prize จนแท่นรับรางวัล — R-4-05)
  toRun() {
    const r = this.race;
    this.clearTimer();
    const ev = r.event, rate = CFG.NITRO_POWER_PER_COIN * (ev === 'frenzy' ? CFG.FRENZY_MULT : 1) * (ev === 'reverse' ? -1 : 1);
    const racers = this.racers();
    const bases = racers.map(p => this.card(r.picks.get(p.id).cardId).power);
    const minBase = Math.min(...bases);
    let rows = racers.map(p => {
      const pick = r.picks.get(p.id), base = this.card(pick.cardId).power;
      let eventDelta = 0;
      if (ev === 'rain' && base >= CFG.RAIN_THRESHOLD) eventDelta -= CFG.RAIN_PENALTY;
      if (ev === 'underdog' && base === minBase) eventDelta += CFG.UNDERDOG_BONUS;
      const lucky = ev === 'lucky' ? CFG.LUCKY_MIN + Math.floor(this.rand() * (CFG.LUCKY_MAX - CFG.LUCKY_MIN + 1)) : 0;
      const nitro = this.nitroAllowed() ? pick.nitro || 0 : 0;
      const total = base + eventDelta + lucky + nitro * rate;
      return { playerId: p.id, cardId: pick.cardId, base, power: base, nitro, eventDelta, lucky, total, auto: r.auto.has(p.id) };
    });
    const rev = ev === 'reverse';
    rows.sort((a, b) => rev ? (a.total - b.total || a.base - b.base) : (b.total - a.total || b.base - a.base));
    let prizes = r.sudden ? [] : r.prizes.slice();
    if (!r.sudden && ev === 'double') prizes = prizes.map(v => v * CFG.DOUBLE_PRIZE_MULT);
    if (!r.sudden && ev === 'wta') { const sum = prizes.reduce((s, v) => s + v, 0); prizes = prizes.map((v, i) => (i === 0 ? sum : 0)); }
    rows = rows.map((row, i) => ({ ...row, rank: i + 1, prize: r.sudden ? 0 : prizes[i] }));
    r.result = { no: r.no, prizes, basePrizes: r.prizes.slice(), event: ev, scene: r.scene, sudden: !!r.sudden, rows };
    const runSeed = Math.floor(this.rand() * 2147483647);
    // boost = จำนวน Coins Nitro ของแต่ละเลน ใช้ทำความยาวเปลวไฟ/ระยะพุ่ง (ลำดับเข้าเส้นชัยอยู่ใน order อยู่แล้ว) — R-7-29
    r.run = { no: r.no, order: rows.map(x => x.playerId), runSeed, scene: r.scene, event: ev, sudden: !!r.sudden,
      lanes: racers.map(p => ({ pid: p.id, cardId: r.picks.get(p.id).cardId, modelId: p.modelId, boost: rows.find(x => x.playerId === p.id).nitro })) };
    this.phase = 'raceRun';
    r.runAt = this.now();
    this.logEvent('race:run', { no: r.no, order: r.run.order, runSeed });
    this.emit('race:run', r.run);
    this.setTimer(CFG.RACE_COUNTDOWN_SECONDS + CFG.RACE_RUN_SECONDS, () => this.toResult());
  }
  toResult() { // R-7-27, R-7-28
    const r = this.race, res = r.result;
    this.clearTimer();
    for (const row of res.rows) {
      const p = this.player(row.playerId);
      p.coins -= row.nitro; // R-4-04, R-7-92
      if (r.sudden) continue;
      p.prizeTotal += row.prize;
      p.cars = p.cars.filter(c => c !== row.cardId);
      if (row.rank === 1) { p.firstPlaces += 1; p.streak += 1; } else p.streak = 0;
    }
    if (r.sudden) this.sudden.result = res;
    else { this.crownId = res.rows[0].playerId; this.raceHistory.push(res); }
    this.logEvent('race:result', res);
    this.emit('race:result', res);
    this.phase = 'raceResult';
    this.setTimer(CFG.RACE_RESULT_SECONDS, () => {
      if (r.sudden) this.finishGame(true);
      else if (r.no < this.x) this.startRace(r.no + 1);
      else this.finishGame(false);
    });
  }

  // ---------- จบเกม (8–9) + Sudden Death (7.7) ----------
  computeStandings() {
    const sorted = this.players.slice().sort((a, b) => b.prizeTotal - a.prizeTotal || b.firstPlaces - a.firstPlaces);
    const standings = [];
    sorted.forEach((p, i) => {
      const prev = standings[i - 1];
      const same = prev && prev.prizeTotal === p.prizeTotal && prev.firstPlaces === p.firstPlaces;
      standings.push({ playerId: p.id, rank: same ? prev.rank : i + 1, prizeTotal: p.prizeTotal, firstPlaces: p.firstPlaces, left: p.left });
    });
    return { sorted, standings };
  }
  finishGame(afterSudden) {
    this.clearTimer();
    const { sorted, standings } = this.computeStandings();
    const tied = standings.filter(s => s.rank === 1).map(s => s.playerId);
    if (!afterSudden && tied.length > 1 && this.tog('suddenDeath')) { this.startSudden(tied); return; } // R-7-100
    if (afterSudden && this.sudden && this.sudden.result) { // R-7-103
      const winner = this.sudden.result.rows[0].playerId;
      standings.forEach(s => { if (s.rank === 1 && s.playerId !== winner) s.rank = 2; });
      standings.sort((a, b) => a.rank - b.rank);
      this.tieBreak = 'suddenDeath';
    } else {
      const top = sorted[0];
      const tiedPrize = sorted.filter(p => p.prizeTotal === top.prizeTotal);
      this.tieBreak = tiedPrize.length === 1 ? 'prize' : tied.length === 1 ? 'firstPlaces' : 'shared';
    }
    standings.forEach(s => { s.winner = s.rank === 1; }); // R-9-05, R-9-06
    this.standings = standings;
    this.race = null;
    this.phase = 'gameOver';
    this.logEvent('game:over', { standings, tieBreak: this.tieBreak });
    this.emit('game:over', { standings, tieBreak: this.tieBreak });
    this.log(`telemetry:game ${JSON.stringify(this.telemetry())}`);
  }
  startSudden(tied) { // R-7-101, R-7-102
    const used = new Set([].concat(...this.carSets));
    let pool = shuffle([...this.catalog.keys()].filter(id => !used.has(id)), this.rand);
    if (pool.length < tied.length) pool = shuffle([...this.catalog.keys()], this.rand);
    const suddenCars = {}; tied.forEach((pid, i) => { suddenCars[pid] = pool[i]; });
    this.sudden = { participants: tied, cars: suddenCars, result: null };
    this.phase = 'racePick';
    this.raceNo = this.x + 1;
    const scene = this.settings.sceneLock || CFG.SCENES[Math.floor(this.rand() * CFG.SCENES.length)];
    this.race = { no: this.x + 1, prizes: [], event: null, scene, last: false, sudden: true, participants: tied, suddenCars,
      picks: new Map(), confirmed: new Set(), auto: new Set(), result: null, run: null };
    this.logEvent('suddendeath:start', { pids: tied, cars: suddenCars });
    this.emit('suddendeath:start', { pids: tied });
    this.beginPick([{ kind: 'sudden', no: this.x + 1 }]);
  }
  telemetry() { // หัวข้อ 15
    const rankOf = new Map([].concat(...this.carSets).sort((a, b) => this.card(b).power - this.card(a).power).map((id, i) => [id, i + 1]));
    return {
      room: this.code, x: this.x, n: this.n, settings: this.settings, seats: this.players.map(p => p.id),
      sets: this.carSets.map(s => s.map(id => ({ id, power: this.card(id).power, rank: rankOf.get(id) }))),
      auctions: this.auctionHistory.map(a => ({ no: a.no, winnerId: a.winnerId, price: a.price, ranking: a.ranking, paid: a.paid, refund: a.refund, mysteryId: a.mysteryId })),
      races: this.raceHistory.map(r => ({ no: r.no, event: r.event, prizes: r.prizes, rows: r.rows.map(x => ({ pid: x.playerId, base: x.base, nitro: x.nitro, eventDelta: x.eventDelta, lucky: x.lucky, total: x.total, rank: x.rank, prize: x.prize, auto: x.auto })) })),
      suddenDeath: this.sudden ? { pids: this.sudden.participants, order: this.sudden.result && this.sudden.result.rows.map(x => x.playerId) } : null,
      standings: this.standings, tieBreak: this.tieBreak,
      left: this.players.filter(p => p.left).map(p => p.id),
      coinsLeft: Object.fromEntries(this.players.map(p => [p.id, p.coins])),
      hostActions: this.events.filter(e => /^host:/.test(e.type)).map(e => e.type)
    };
  }

  // ---------- action router ----------
  action(pid, data) {
    if (!data || typeof data !== 'object') throw err('WRONG_PHASE');
    const p = this.player(pid);
    if (p.left) throw err('SPECTATOR_ONLY');
    switch (data.type) {
      case 'game:start': return this.start(pid);
      case 'lobby:rounds': return this.setRounds(pid, data);
      case 'lobby:settings': return this.setSettings(pid, data);
      case 'lobby:model': return this.setModel(pid, data);
      case 'host:kick': return this.kick(pid, data);
      case 'host:transfer': return this.transfer(pid, data);
      case 'host:pause': return this.pause(pid);
      case 'host:resume': return this.resumeGame(pid);
      case 'host:skip': return this.skip(pid);
      case 'auction:raise': return this.raise(pid, data);
      case 'auction:pass': return this.pass(pid, data);
      case 'shadow:bid': return this.shadowBid(pid, data);
      case 'shadow:confirm': return this.shadowConfirm(pid, data);
      case 'race:select': return this.select(pid, data);
      case 'race:confirm': return this.confirm(pid, data);
      default: throw err('WRONG_PHASE');
    }
  }

  // ---------- state ตามสิทธิ์ (หัวข้อ 4) ----------
  // ชุดรถที่ส่งให้ client: Mystery คว่ำและวางท้ายจนกว่าจะมีผล (R-7-60, R-7-61)
  publicSet(a) {
    if (!a.mysteryId || this.phase === 'auctionResult') return a.set.slice();
    return a.set.filter(id => id !== a.mysteryId).concat(['mystery']);
  }
  getState(viewerId) {
    const me = viewerId ? this.players.find(p => p.id === viewerId) : null;
    const a = this.auction, r = this.race;
    const inAuction = ['auction', 'shadowBid', 'shadowReveal', 'auctionResult'].includes(this.phase) && a;
    const inRace = ['racePick', 'raceRun', 'raceResult'].includes(this.phase) && r;
    const lobby = this.phase === 'lobby';
    const st = {
      code: this.code, phase: this.phase, x: this.x, n: this.n || this.players.length,
      rounds: lobby ? this.effectiveRounds() : this.x, roundsAuto: this.roundsSet == null, roundsMax: this.roundsMax(),
      startCoins: lobby ? (this.settings.coinsOverride != null ? this.settings.coinsOverride : this.recommendedCoins()) : this.startCoins,
      recommendedCoins: this.recommendedCoins(),
      settings: { ...this.settings, toggles: { ...this.settings.toggles } },
      stateVersion: this.version, serverNow: this.now(), endsAt: this.paused ? null : this.endsAt,
      paused: this.paused ? { remainingMs: this.paused.remainingMs } : null,
      hostId: this.hostId, me: me ? me.id : null, myLeft: me ? me.left : false, spectators: this.spectators,
      crownId: this.crownId,
      players: this.players.map(p => ({
        id: p.id, name: p.name, seat: p.seat, connected: p.connected, left: p.left, coins: p.coins,
        cars: p.cars.slice(), prizeTotal: p.prizeTotal, firstPlaces: p.firstPlaces, modelId: p.modelId, streak: p.streak,
        picked: !!(this.phase === 'racePick' && r && r.confirmed.has(p.id))
      })),
      auction: null, intro: this.intro ? { steps: this.intro.steps.map(s => ({ ...s })) } : null,
      race: null, myPick: null, myConfirmed: false, myBid: null, myBidConfirmed: false,
      auctionHistory: this.auctionHistory, raceHistory: this.raceHistory,
      sudden: this.sudden ? { participants: this.sudden.participants.slice(), result: this.sudden.result } : null,
      standings: this.standings, tieBreak: this.tieBreak, cancelReason: this.cancelReason
    };
    if (inAuction) {
      const base = { no: a.no, mode: a.mode, set: this.publicSet(a), hasMystery: !!a.mysteryId, openerId: a.openerId, startCoins: a.startCoins };
      if (a.mode === 'shadow') { // ราคาคนอื่นไม่อยู่ใน payload ก่อนเปิด (R-7-46)
        st.auction = { ...base, submitted: [...a.confirmed], broke: [...a.broke], reveal: a.reveal || null };
        if (me && this.phase === 'shadowBid') { st.myBid = a.bids.has(me.id) ? a.bids.get(me.id) : null; st.myBidConfirmed = a.confirmed.has(me.id); }
      } else {
        st.auction = { ...base, currentBid: a.currentBid, highBidderId: a.highBidderId, turnId: a.turnId, seq: a.seq,
          out: Object.fromEntries(a.out), minBid: a.currentBid + CFG.MIN_RAISE, log: a.log.slice(),
          committed: { ...a.committed }, passOrder: a.passOrder.slice() };
      }
    }
    if (inRace) {
      const showPrizes = r.event !== 'fog' || this.phase === 'raceResult';
      st.race = { no: r.no, prizes: showPrizes ? r.prizes.slice() : null, event: r.event, scene: r.scene, confirmed: [...r.confirmed],
        last: !!r.last, sudden: !!r.sudden, participants: r.participants ? r.participants.slice() : null, nitroOnly: !!r.nitroOnly,
        nitroAllowed: this.nitroAllowed(), runAt: r.runAt || null,
        run: ['raceRun', 'raceResult'].includes(this.phase) ? r.run : null,
        result: this.phase === 'raceResult' ? r.result : null };
      // R-4-02 รถ/Nitro ที่เลือกก่อนเปิดผลส่งให้เจ้าของคนเดียว
      if (me && this.phase === 'racePick' && this.inRace(me)) {
        const pk = r.picks.get(me.id);
        st.myPick = pk ? pk.cardId : null; st.myNitro = pk ? pk.nitro || 0 : 0;
        st.myConfirmed = r.confirmed.has(me.id);
      }
    }
    return st;
  }
}

module.exports = { Room, GameError, drawPrize, MSG };
