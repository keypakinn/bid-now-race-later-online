// กติกาทั้งหมดของ บิดไปสมาชิก (Bid Now, Race Later) — อ้างรหัสกติกาจาก spec v2
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
  NO_SELECTION: 'เลือกรถก่อน',
  ALREADY_CONFIRMED: 'ยืนยันไปแล้ว',
  SPECTATOR_ONLY: 'ผู้ชมทำแบบนี้ไม่ได้',
  DUPLICATE_REQUEST: 'คำสั่งนี้ทำไปแล้ว',
  UNKNOWN_PLAYER: 'ไม่พบผู้เล่น'
};
const err = (code, extra) => new GameError(code, MSG[code] + (extra ? ` (${extra})` : ''));

// R-5-05 สุ่ม Prize ตามน้ำหนัก
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

class Room {
  /**
   * @param {string} code
   * @param {{cards:Array<{id,name,power}>, onChange?:Function, onEvent?:Function, rand?:Function, log?:Function, now?:Function}} opts
   */
  constructor(code, opts = {}) {
    this.code = code;
    this.catalog = new Map((opts.cards || []).map(c => [c.id, c]));
    this.onChange = opts.onChange || (() => {});
    this.onEvent = opts.onEvent || (() => {});
    this.rand = opts.rand || Math.random;
    this.log = opts.log || (() => {});
    this.now = opts.now || Date.now;
    this.introSeconds = opts.introSeconds != null ? opts.introSeconds : CFG.INTRO_SECONDS; // test ส่ง 0 ได้
    this.intro = null;
    this.players = []; // ลำดับ = ลำดับที่เข้าห้อง (ก่อนเริ่ม) / ที่นั่ง (หลังเริ่ม)
    this.hostId = null;
    this.phase = 'lobby';
    this.version = 0;
    this.timer = null; this.endsAt = null; this.onTimer = null;
    this.spectators = 0;
    this.lastActivity = this.now();
    this.resetMatch();
  }

  resetMatch() {
    this.x = 0;
    this.carSets = [];
    this.auction = null; this.auctionNo = 0; this.auctionHistory = [];
    this.race = null; this.raceNo = 0; this.raceHistory = [];
    this.standings = null; this.tieBreak = null; this.cancelReason = null;
    this.intro = null;
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

  setTimer(seconds, fn) {
    this.clearTimer();
    this.endsAt = this.now() + seconds * 1000;
    this.onTimer = fn;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { const f = this.onTimer; this.onTimer = null; f && f(); }
      catch (e) { this.log(`[room ${this.code}] timer error: ${e.stack || e}`); }
      this.bump();
    }, seconds * 1000);
    if (this.timer.unref) this.timer.unref();
  }
  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.endsAt = null; this.onTimer = null; }
  // ให้ test เรียกแทนรอเวลาจริง
  // ป้ายประกาศ (L1): แสดงทีละป้าย ป้ายละ introSeconds แล้วจึงเรียก then() ซึ่งเริ่มนับเวลาของเฟส
  runIntro(steps, then) {
    if (!this.introSeconds) { this.intro = null; then(); return; }
    const t0 = this.now(), ms = this.introSeconds * 1000;
    this.intro = { steps: steps.map((s, i) => ({ ...s, endsAt: t0 + (i + 1) * ms })) };
    this.setTimer(steps.length * this.introSeconds, () => { this.intro = null; then(); });
  }
  endPhaseNow() { const f = this.onTimer; this.clearTimer(); if (f) f(); this.bump(); }
  destroy() { this.clearTimer(); }

  // ---------- lobby ----------
  cleanName(name) {
    const n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (!n || [...n].length > CFG.NAME_MAX_CHARS) throw err('BAD_NAME');
    let out = n, k = 2;
    while (this.players.some(p => p.name === out)) out = `${n} (${k++})`; // R-12-09
    return out;
  }
  join(name) {
    if (this.phase !== 'lobby') throw err('GAME_STARTED');
    if (this.players.length >= CFG.PLAYERS_MAX) throw err('ROOM_FULL');
    const p = {
      id: newId(), token: newToken(), name: this.cleanName(name), seat: this.players.length,
      connected: true, left: false, disconnectedAt: null, coins: 0, cars: [], prizeTotal: 0, firstPlaces: 0,
      reqIds: []
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
  leave(pid) {
    const p = this.players.find(q => q.id === pid); if (!p) return;
    if (this.phase === 'lobby') {
      this.players = this.players.filter(q => q !== p);
      this.players.forEach((q, i) => { q.seat = i; });
      if (this.hostId === p.id) this.hostId = this.players[0] ? this.players[0].id : null; // R-12-09
      this.bump(); return;
    }
    if (p.left) return;
    p.left = true; // R-12-06
    this.logEvent('leave', { pid: p.id });
    if (['gameOver', 'cancelled'].includes(this.phase)) { this.bump(); return; }
    if (this.players.every(q => q.left)) { this.cancel('all_left'); return; } // R-12-08
    if (this.phase === 'racePick' && this.race && !this.race.confirmed.has(p.id)) {
      this.autoPick(p); // R-7-23
      this.checkRaceEarly();
    }
    this.bump();
  }
  cancel(reason) {
    this.clearTimer();
    this.intro = null;
    this.phase = 'cancelled'; this.cancelReason = reason;
    this.logEvent('cancelled', { reason });
    this.emit('game:cancelled', { reason });
    this.bump();
  }
  transferHostIfNeeded(maxAwayMs = 60000) { // lobby เท่านั้น
    if (this.phase !== 'lobby') return;
    const h = this.players.find(p => p.id === this.hostId);
    if (h && !h.connected && h.disconnectedAt && this.now() - h.disconnectedAt > maxAwayMs) {
      const next = this.players.find(p => p.connected);
      if (next) { this.hostId = next.id; this.bump(); }
    }
  }

  dedupe(p, requestId) { // R-12-07
    if (requestId == null) return;
    const id = String(requestId).slice(0, 64);
    if (p.reqIds.includes(id)) throw err('DUPLICATE_REQUEST');
    p.reqIds.push(id); if (p.reqIds.length > 100) p.reqIds.shift();
  }

  // ---------- setup (หัวข้อ 5) ----------
  start(pid) {
    if (this.phase !== 'lobby') throw err('WRONG_PHASE');
    if (pid !== this.hostId) throw err('NOT_HOST');
    const n = this.players.length;
    if (n < CFG.PLAYERS_MIN || n > CFG.PLAYERS_MAX) throw err('NOT_ENOUGH_PLAYERS'); // R-5-01
    if (this.catalog.size < n * n) throw new GameError('CARDS_INVALID', 'ข้อมูลรถไม่พอเริ่มเกม');
    this.resetMatch();
    this.x = n;
    this.players = shuffle(this.players, this.rand); // R-5-02
    this.players.forEach((p, i) => {
      p.seat = i; p.coins = CFG.STARTING_COINS[n]; p.cars = []; p.prizeTotal = 0; p.firstPlaces = 0; p.left = false; // R-5-03
    });
    const pool = shuffle([...this.catalog.keys()], this.rand).slice(0, n * n); // R-5-04
    for (let k = 0; k < n; k++) this.carSets.push(this.sortCars(pool.slice(k * n, k * n + n)));
    this.logEvent('start', { x: n, seats: this.players.map(p => p.id), sets: this.carSets });
    this.startAuction(1); // R-5-06
    this.bump();
  }

  // ---------- Phase 1: Auction (7.1) ----------
  startAuction(k) {
    this.phase = 'auction';
    this.auctionNo = k;
    const opener = this.bySeat(k - 1); // R-7-01
    const openBid = opener.coins >= CFG.OPENING_BID ? CFG.OPENING_BID : 0; // R-7-02
    this.auction = {
      no: k, set: this.carSets[k - 1], openerId: opener.id, currentBid: openBid,
      highBidderId: opener.id, turnId: null, seq: 0, out: new Map(),
      // ประวัติ bid ทั้งรอบ (สาธารณะ): open / raise / pass / out
      log: [{ pid: opener.id, kind: 'open', amount: openBid }],
      startCoins: Object.fromEntries(this.players.map(p => [p.id, p.coins])) // ใช้เรียงรายชื่อผู้เล่น (L4)
    };
    this.logEvent('auction:start', { no: k, opener: opener.id, openBid });
    const steps = k === 1 ? [{ kind: 'phase', no: 1 }, { kind: 'auction', no: k }] : [{ kind: 'auction', no: k }];
    this.runIntro(steps, () => this.advanceTurn(opener.seat));
  }
  othersAllOut() {
    const a = this.auction;
    return this.players.every(p => p.id === a.highBidderId || a.out.has(p.id));
  }
  // R-7-03, R-7-04, R-9-01
  advanceTurn(fromSeat) {
    const a = this.auction;
    let seat = fromSeat;
    for (let guard = 0; guard < this.x * 3; guard++) {
      if (this.othersAllOut()) { this.finishAuction(); return; }
      let next = null;
      for (let i = 1; i <= this.x; i++) {
        const p = this.bySeat((seat + i) % this.x);
        if (p.id !== a.highBidderId && !a.out.has(p.id)) { next = p; break; }
      }
      if (!next) { this.finishAuction(); return; }
      seat = next.seat;
      if (next.coins < a.currentBid + CFG.MIN_RAISE) {
        a.out.set(next.id, 'no_money');
        a.log.push({ pid: next.id, kind: 'out', reason: 'no_money' });
        this.logEvent('auction:out', { pid: next.id, reason: 'no_money' });
        continue;
      }
      a.turnId = next.id;
      a.seq++;
      this.setTimer(CFG.BID_TURN_SECONDS, () => this.doPass(next.id, 'timeout')); // R-7-05
      return;
    }
    this.finishAuction();
  }
  checkTurn(pid, data) {
    if (this.phase !== 'auction') throw err('WRONG_PHASE');
    const a = this.auction;
    if (data && data.auctionNo != null && Number(data.auctionNo) !== a.no) throw err('WRONG_PHASE');
    if (a.turnId !== pid) throw err('NOT_YOUR_TURN');
    // stateVersion ของการประมูล = ลำดับตา (auction.seq) กัน bid ที่อิง state เก่า — R-12-07
    if (data && data.stateVersion != null && Number(data.stateVersion) !== a.seq) throw err('STALE_STATE');
  }
  raise(pid, data = {}) {
    const p = this.player(pid);
    this.checkTurn(pid, data);
    const amount = data.amount;
    if (typeof amount !== 'number' || !Number.isInteger(amount)) throw err('BAD_AMOUNT'); // R-7-06
    const a = this.auction;
    if (amount < a.currentBid + CFG.MIN_RAISE) throw err('BID_TOO_LOW', `ต่ำสุด ${a.currentBid + CFG.MIN_RAISE}`);
    if (amount > p.coins) throw err('BID_OVER_COINS', `สูงสุด ${p.coins}`);
    this.dedupe(p, data.requestId);
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
    a.out.set(pid, reason);
    a.log.push({ pid, kind: 'pass', reason });
    a.turnId = null;
    this.clearTimer();
    this.logEvent('auction:pass', { pid, reason });
    this.advanceTurn(this.player(pid).seat);
  }
  finishAuction() { // R-7-08 … R-7-11
    const a = this.auction;
    this.clearTimer();
    a.turnId = null;
    const winner = this.player(a.highBidderId);
    const price = a.currentBid;
    winner.coins -= price; // R-7-09
    const allocation = {};
    a.set.forEach((cid, i) => { // R-7-10 (set เรียง power มาก→น้อยแล้ว)
      const p = this.bySeat((winner.seat + i) % this.x);
      p.cars = this.sortCars([...p.cars, cid]);
      allocation[p.id] = cid;
    });
    const result = { no: a.no, winnerId: winner.id, price, allocation, openerId: a.openerId };
    this.auctionHistory.push(result);
    this.logEvent('auction:result', result);
    this.emit('auction:result', result);
    this.phase = 'auctionResult';
    this.setTimer(CFG.AUCTION_RESULT_SECONDS, () => {
      if (a.no < this.x) this.startAuction(a.no + 1);
      else this.startRace(1);
    });
  }

  // ---------- Phase 2: Racing (7.2) ----------
  startRace(r) {
    this.phase = 'racePick';
    this.raceNo = r;
    const prizes = Array.from({ length: this.x }, () => drawPrize(this.rand)).sort((a, b) => b - a); // R-7-20
    this.race = { no: r, prizes, picks: new Map(), confirmed: new Set(), auto: new Set() };
    this.logEvent('race:prizes', { no: r, prizes });
    this.emit('race:prizes', { no: r, prizes });
    const steps = r === 1 ? [{ kind: 'phase', no: 2 }, { kind: 'race', no: r }] : [{ kind: 'race', no: r }];
    if (r === this.x) { // R-7-21
      for (const p of this.players) { this.race.picks.set(p.id, p.cars[0]); this.race.confirmed.add(p.id); this.race.auto.add(p.id); }
      this.runIntro(steps, () => this.setTimer(CFG.LAST_RACE_REVEAL_SECONDS, () => this.revealRace()));
      return;
    }
    for (const p of this.players) if (p.left) this.autoPick(p); // R-7-23
    this.runIntro(steps, () => {
      this.setTimer(CFG.PICK_SECONDS, () => this.pickDeadline()); // R-7-22 นับหลังป้ายจบ
      this.checkRaceEarly();
    });
  }
  randomCar(p) { return p.cars[Math.floor(this.rand() * p.cars.length)]; }
  autoPick(p) {
    const r = this.race;
    if (r.confirmed.has(p.id)) return;
    r.picks.set(p.id, this.randomCar(p));
    r.confirmed.add(p.id); r.auto.add(p.id);
    this.logEvent('race:auto', { pid: p.id, card: r.picks.get(p.id) });
  }
  select(pid, data = {}) {
    const p = this.player(pid);
    if (this.phase !== 'racePick' || this.raceNo === this.x || this.intro) throw err('WRONG_PHASE');
    if (data.raceNo != null && Number(data.raceNo) !== this.raceNo) throw err('WRONG_PHASE');
    const r = this.race;
    if (r.confirmed.has(pid)) throw err('ALREADY_CONFIRMED');
    const cid = typeof data.cardId === 'string' ? data.cardId : '';
    if (!p.cars.includes(cid)) throw err('CAR_NOT_OWNED');
    r.picks.set(pid, cid);
    this.logEvent('race:select', { pid, card: cid });
    this.bump();
  }
  confirm(pid, data = {}) {
    const p = this.player(pid);
    if (this.phase !== 'racePick' || this.raceNo === this.x || this.intro) throw err('WRONG_PHASE');
    if (data.raceNo != null && Number(data.raceNo) !== this.raceNo) throw err('WRONG_PHASE');
    const r = this.race;
    if (r.confirmed.has(pid)) throw err('ALREADY_CONFIRMED');
    if (!r.picks.has(pid)) throw err('NO_SELECTION');
    this.dedupe(p, data.requestId);
    r.confirmed.add(pid);
    this.logEvent('race:confirm', { pid, card: r.picks.get(pid) });
    this.emit('race:picked', { no: r.no, playerId: pid });
    this.checkRaceEarly();
    this.bump();
  }
  checkRaceEarly() { // R-7-25
    if (this.phase === 'racePick' && !this.intro && this.raceNo !== this.x && this.players.every(p => this.race.confirmed.has(p.id))) {
      this.clearTimer();
      this.revealRace();
    }
  }
  pickDeadline() { // R-7-24
    const r = this.race;
    for (const p of this.players) {
      if (r.confirmed.has(p.id)) continue;
      if (!r.picks.has(p.id)) r.picks.set(p.id, this.randomCar(p));
      r.confirmed.add(p.id); r.auto.add(p.id);
      this.logEvent('race:auto', { pid: p.id, card: r.picks.get(p.id) });
    }
    this.revealRace();
  }
  revealRace() { // R-7-26 … R-7-28
    const r = this.race;
    this.clearTimer();
    const rows = this.players.map(p => ({ playerId: p.id, cardId: r.picks.get(p.id), power: this.card(r.picks.get(p.id)).power, auto: r.auto.has(p.id) }))
      .sort((a, b) => b.power - a.power)
      .map((row, i) => ({ ...row, rank: i + 1, prize: r.prizes[i] }));
    for (const row of rows) {
      const p = this.player(row.playerId);
      p.prizeTotal += row.prize;
      if (row.rank === 1) p.firstPlaces += 1;
      p.cars = p.cars.filter(c => c !== row.cardId);
    }
    const result = { no: r.no, prizes: r.prizes, rows };
    this.raceHistory.push(result);
    this.logEvent('race:result', result);
    this.emit('race:result', result);
    this.phase = 'raceResult';
    this.setTimer(CFG.RACE_RESULT_SECONDS, () => {
      if (r.no < this.x) this.startRace(r.no + 1);
      else this.finishGame();
    });
  }

  // ---------- จบเกม (8–9) ----------
  finishGame() {
    this.clearTimer();
    const sorted = this.players.slice().sort((a, b) => b.prizeTotal - a.prizeTotal || b.firstPlaces - a.firstPlaces);
    const standings = [];
    sorted.forEach((p, i) => {
      const prev = standings[i - 1];
      const same = prev && prev.prizeTotal === p.prizeTotal && prev.firstPlaces === p.firstPlaces;
      standings.push({ playerId: p.id, rank: same ? prev.rank : i + 1, prizeTotal: p.prizeTotal, firstPlaces: p.firstPlaces, left: p.left });
    });
    standings.forEach(s => { s.winner = s.rank === 1; }); // R-9-05, R-9-06
    const top = sorted[0];
    const tiedPrize = sorted.filter(p => p.prizeTotal === top.prizeTotal);
    const winners = standings.filter(s => s.winner).length;
    this.tieBreak = tiedPrize.length === 1 ? 'prize' : winners === 1 ? 'firstPlaces' : 'shared';
    this.standings = standings;
    this.phase = 'gameOver';
    this.logEvent('game:over', { standings, tieBreak: this.tieBreak });
    this.emit('game:over', { standings, tieBreak: this.tieBreak });
    this.log(`telemetry:game ${JSON.stringify(this.telemetry())}`);
  }
  telemetry() { // หัวข้อ 15
    const rankOf = new Map([].concat(...this.carSets).sort((a, b) => this.card(b).power - this.card(a).power).map((id, i) => [id, i + 1]));
    return {
      room: this.code, x: this.x, seats: this.players.map(p => p.id),
      sets: this.carSets.map(s => s.map(id => ({ id, power: this.card(id).power, rank: rankOf.get(id) }))),
      auctions: this.auctionHistory, races: this.raceHistory.map(r => ({ no: r.no, prizes: r.prizes, rows: r.rows })),
      standings: this.standings, tieBreak: this.tieBreak,
      left: this.players.filter(p => p.left).map(p => p.id),
      coinsLeft: Object.fromEntries(this.players.map(p => [p.id, p.coins]))
    };
  }

  // ---------- action router ----------
  action(pid, data) {
    if (!data || typeof data !== 'object') throw err('WRONG_PHASE');
    const p = this.player(pid);
    if (p.left) throw err('SPECTATOR_ONLY');
    switch (data.type) {
      case 'game:start': return this.start(pid);
      case 'auction:raise': return this.raise(pid, data);
      case 'auction:pass': return this.pass(pid, data);
      case 'race:select': return this.select(pid, data);
      case 'race:confirm': return this.confirm(pid, data);
      default: throw err('WRONG_PHASE');
    }
  }

  // ---------- state ตามสิทธิ์ (หัวข้อ 4) ----------
  getState(viewerId) {
    const me = viewerId ? this.players.find(p => p.id === viewerId) : null;
    const a = this.auction, r = this.race;
    const inAuction = ['auction', 'auctionResult'].includes(this.phase) && a;
    const inRace = ['racePick', 'raceResult'].includes(this.phase) && r;
    const st = {
      code: this.code, phase: this.phase, x: this.x, stateVersion: this.version, serverNow: this.now(), endsAt: this.endsAt,
      hostId: this.hostId, me: me ? me.id : null, myLeft: me ? me.left : false, spectators: this.spectators,
      players: this.players.map(p => ({
        id: p.id, name: p.name, seat: p.seat, connected: p.connected, left: p.left, coins: p.coins,
        cars: p.cars.slice(), prizeTotal: p.prizeTotal, firstPlaces: p.firstPlaces,
        picked: !!(this.phase === 'racePick' && r && r.confirmed.has(p.id))
      })),
      auction: inAuction ? {
        no: a.no, set: a.set.slice(), openerId: a.openerId, currentBid: a.currentBid, highBidderId: a.highBidderId,
        turnId: a.turnId, seq: a.seq, out: Object.fromEntries(a.out), minBid: a.currentBid + CFG.MIN_RAISE,
        log: a.log.slice(), startCoins: a.startCoins
      } : null,
      intro: this.intro ? { steps: this.intro.steps.map(s => ({ ...s })) } : null,
      race: inRace ? { no: r.no, prizes: r.prizes.slice(), confirmed: [...r.confirmed], last: r.no === this.x } : null,
      myPick: null, myConfirmed: false,
      auctionHistory: this.auctionHistory, raceHistory: this.raceHistory,
      standings: this.standings, tieBreak: this.tieBreak, cancelReason: this.cancelReason
    };
    // R-4-02 รถที่เลือกก่อนเปิดผลส่งให้เจ้าของคนเดียว
    if (me && this.phase === 'racePick' && r) {
      st.myPick = r.picks.get(me.id) || null;
      st.myConfirmed = r.confirmed.has(me.id);
    }
    return st;
  }
}

module.exports = { Room, GameError, drawPrize, MSG };
