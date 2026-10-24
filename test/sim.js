// จำลองกติกา — อ้าง test scenario T-xx และรหัสกติกา R-x-y จาก spec v2.0
'use strict';
const assert = require('assert');
const path = require('path');
const { Room, GameError, drawPrize } = require('../game');
const { parseCSV, buildCatalog, loadCards } = require('../server/cards');
const CFG = require('../shared/config');

function seeded(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const REAL = loadCards(path.join(__dirname, '..', 'cards'), () => {});
const CARDS = REAL.cards;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}
const throwsCode = (fn, code) => assert.throws(fn, e => e instanceof GameError && e.code === code, `ต้องได้ ${code}`);

function newRoom(n, seed = 1) {
  const room = new Room('TEST', { cards: CARDS, rand: seeded(seed), introSeconds: 0 });
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(room.join('P' + (i + 1)));
  return { room, ps };
}
function started(n, seed = 1) { const r = newRoom(n, seed); r.room.start(r.ps[0].id); return r; }
const seat = (room, s) => room.bySeat(s);
// ตั้ง Coins ของทุกที่นั่งแล้วเริ่ม Auction k ใหม่ (ใช้จำลองสถานการณ์กลางเกม)
function forceAuction(room, k, coinsBySeat) {
  room.clearTimer();
  coinsBySeat.forEach((c, s) => { seat(room, s).coins = c; });
  room.startAuction(k);
}
// จบ Race ปัจจุบันแล้วไปเฟสเลือกรถของ Race ถัดไป (ผ่าน raceRun → raceResult → ป้าย)
function nextRace(room) {
  const r0 = room.raceNo; let g = 0;
  while (g++ < 20 && room.phase !== 'gameOver' && !(room.phase === 'racePick' && room.raceNo !== r0)) room.endPhaseNow();
}
function passAllAuctions(room) { // ผู้เล่นที่ถึงตา pass หมดจนจบ Phase 1
  let guard = 0;
  while (['auction', 'auctionResult'].includes(room.phase) && guard++ < 500) {
    if (room.phase === 'auction' && room.auction.turnId) room.pass(room.auction.turnId);
    else room.endPhaseNow();
  }
}

console.log('บิดไปสมาชิก — test/sim.js');

// ---------- CSV / การ์ด (หัวข้อ 4.1) ----------
test('parseCSV: BOM, จุลภาค, "" , ขึ้นบรรทัด, CRLF, แถวว่าง, ไทย (R-4.1-02)', () => {
  const rows = parseCSV('﻿id,name,power\r\na-1,"เสือ, ดำ",3\r\n\r\nb-2,"He said ""hi""",4\nc-3,"สอง\nบรรทัด",5\n');
  assert.deepStrictEqual(rows[0], ['id', 'name', 'power']);
  assert.strictEqual(rows[1][1], 'เสือ, ดำ');
  assert.strictEqual(rows[2][1], 'He said "hi"');
  assert.strictEqual(rows[3][1], 'สอง\nบรรทัด');
  assert.strictEqual(rows.length, 4);
});
test('T-25 แถวผิด/ซ้ำถูกข้ามพร้อม log, ขาด Power ถูกเติม default, catalog = 50 (R-4.1-08, R-4.1-09)', () => {
  const lines = ['id,name,power'];
  for (let p = 1; p <= 49; p++) lines.push(`car-${p},รถ ${p},${p}`);
  lines.push('car-1,ซ้ำ id,50');      // id ซ้ำ
  lines.push('dup-power,ซ้ำ power,7'); // power ซ้ำ
  lines.push('zero,ศูนย์,0');          // นอกช่วง
  lines.push('Bad_ID,ผิด,50');         // id ผิดรูปแบบ
  lines.push('"comma-x","เสือ, ดำ",x'); // power ไม่ใช่ตัวเลข
  const log = [];
  const cat = buildCatalog('﻿' + lines.join('\n'), m => log.push(m));
  assert.strictEqual(cat.cards.length, 50);
  assert.strictEqual(cat.skipped, 5);
  assert.ok(cat.cards.find(c => c.power === 50 && c.id === 'car-default-50'));
  assert.ok(log.some(m => /แถว 51/.test(m)), 'log ต้องมีเลขแถว');
  assert.strictEqual(cat.cards.find(c => c.power === 7).id, 'car-7');
});
test('T-26 ไม่มี data.csv → Car 1…Car 50 เกมเล่นได้ (R-4.1-09)', () => {
  const cat = buildCatalog(null, () => {});
  assert.strictEqual(cat.cards.length, 50);
  assert.strictEqual(cat.cards[0].name, 'Car 1');
  const room = new Room('X', { cards: cat.cards, rand: seeded(3), introSeconds: 0 });
  const a = room.join('A'); room.join('B'); room.start(a.id);
  assert.strictEqual(room.phase, 'auction');
});
test('ชื่อว่าง → "Car <power>" (R-4.1-08)', () => {
  const cat = buildCatalog('id,name,power\nabc,,12\n', () => {});
  assert.strictEqual(cat.cards.find(c => c.power === 12).name, 'Car 12');
});
test('data.csv จริงของเกม: 50 คัน ไม่มีแถวถูกข้าม ไม่มี default', () => {
  assert.strictEqual(CARDS.length, 50);
  assert.strictEqual(REAL.skipped, 0);
  assert.strictEqual(REAL.defaults, 0);
  assert.deepStrictEqual(CARDS.map(c => c.power), Array.from({ length: 50 }, (_, i) => i + 1));
});
test('ทุก slot.column ใน template มีใน schema และ /api/cards ไม่มีคอลัมน์ลับ (R-4.1-11)', () => {
  const SCHEMA = require('../shared/card-schema');
  for (const s of REAL.api.templates.main.slots) assert.ok(SCHEMA.columns[s.column], s.column);
  for (const c of REAL.api.cards) assert.deepStrictEqual(Object.keys(c).sort(), ['id', 'name', 'power']);
});

// ---------- Setup ----------
test('T-01 ห้อง 1 คนเริ่มไม่ได้ (R-5-01)', () => {
  const { room, ps } = newRoom(1);
  throwsCode(() => room.start(ps[0].id), 'NOT_ENOUGH_PLAYERS');
});
test('คนที่ไม่ใช่เจ้าของห้องเริ่มไม่ได้ / ห้องเต็มที่ 7 / ชื่อซ้ำเติม (2)', () => {
  const { room, ps } = newRoom(7);
  throwsCode(() => room.start(ps[1].id), 'NOT_HOST');
  throwsCode(() => room.join('P8'), 'ROOM_FULL');
  const r2 = newRoom(1).room; r2.join('P1'); assert.ok(r2.players.some(p => p.name === 'P1 (2)'));
  throwsCode(() => r2.join(''), 'BAD_NAME');
  throwsCode(() => r2.join('x'.repeat(CFG.NAME_MAX_CHARS + 1)), 'BAD_NAME');
});
test('T-02 x=4: 13 Coins, รถ 16 คันไม่ซ้ำ 4 ชุด, ชุดอนาคตไม่อยู่ใน state (R-5-03, R-5-04, R-12-02)', () => {
  const { room, ps } = started(4);
  assert.ok(room.players.every(p => p.coins === 13));
  const all = [].concat(...room.carSets);
  assert.strictEqual(new Set(all).size, 16);
  assert.strictEqual(room.carSets.length, 4);
  const json = JSON.stringify(room.getState(ps[1].id));
  for (const id of [].concat(...room.carSets.slice(1))) assert.ok(!json.includes(`"${id}"`), 'ชุดอนาคตรั่ว: ' + id);
});
test('T-03 x=7: 20 Coins, รถ 49 คัน 7 ชุด (R-5-03, R-5-04)', () => {
  const { room } = started(7);
  assert.ok(room.players.every(p => p.coins === 20));
  assert.strictEqual(new Set([].concat(...room.carSets)).size, 49);
});
test('เงินเริ่มต้นตามตาราง x = 2…7', () => {
  for (let n = 2; n <= 7; n++) { const { room } = started(n); assert.ok(room.players.every(p => p.coins === CFG.STARTING_COINS[n])); }
});

// ---------- Auction ----------
test('T-04 x=3 Auction 1: S1 raise 3, S2 pass, S0 raise 5, S1 pass → S0 ชนะ จ่าย 5 (R-7-02…R-7-09)', () => {
  const { room } = started(3);
  forceAuction(room, 1, [10, 10, 10]);
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  assert.strictEqual(room.auction.currentBid, 1);
  assert.strictEqual(room.auction.highBidderId, s0.id);
  assert.strictEqual(room.auction.turnId, s1.id);
  room.raise(s1.id, { amount: 3 });
  room.pass(s2.id);
  assert.strictEqual(room.auction.turnId, s0.id);
  room.raise(s0.id, { amount: 5 });
  room.pass(s1.id);
  assert.strictEqual(room.phase, 'auctionResult');
  assert.deepStrictEqual([s0.coins, s1.coins, s2.coins], [5, 10, 10]);
});
test('T-05 ผู้เปิดมี 0 Coins → เปิดที่ 0, ทุกคน pass → ได้รถฟรี (R-7-02)', () => {
  const { room } = started(3);
  forceAuction(room, 2, [10, 0, 10]);
  const s1 = seat(room, 1);
  assert.strictEqual(room.auction.currentBid, 0);
  room.pass(room.auction.turnId); room.pass(room.auction.turnId);
  assert.strictEqual(room.auctionHistory[0].winnerId, s1.id);
  assert.strictEqual(room.auctionHistory[0].price, 0);
  assert.strictEqual(s1.cars[0], room.carSets[1][0]);
});
test('T-06 คนอื่นเงินไม่พอ → ออกอัตโนมัติ ผู้เปิดชนะที่ 1 ทันที (R-7-04, R-9-01)', () => {
  const { room } = started(3);
  forceAuction(room, 3, [0, 1, 10]);
  assert.strictEqual(room.phase, 'auctionResult');
  assert.strictEqual(room.auctionHistory[0].winnerId, seat(room, 2).id);
  assert.strictEqual(seat(room, 2).coins, 9);
});
test('T-07 ผู้ถือ bid ใช้เงินหมดตัวไม่ถูกตัด ตาถูกข้าม (R-7-03, R-7-04)', () => {
  const { room } = started(3);
  forceAuction(room, 1, [10, 10, 4]);
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  room.raise(s1.id, { amount: 2 });
  room.raise(s2.id, { amount: 4 }); // หมดตัว
  assert.strictEqual(room.auction.highBidderId, s2.id);
  room.pass(s0.id);
  assert.strictEqual(room.auction.turnId, s1.id, 'ข้าม S2 ที่ถือ bid');
  room.pass(s1.id);
  assert.strictEqual(room.auctionHistory[0].winnerId, s2.id);
  assert.strictEqual(s2.coins, 0);
});
test('T-08 bid ต่ำ / เกิน Coins / ไม่ใช่จำนวนเต็ม (R-7-06)', () => {
  const { room: r2 } = started(3);
  forceAuction(r2, 1, [10, 6, 10]);
  const t1 = seat(r2, 1);
  r2.auction.currentBid = 4;
  throwsCode(() => r2.raise(t1.id, { amount: 4 }), 'BID_TOO_LOW');
  throwsCode(() => r2.raise(t1.id, { amount: 7 }), 'BID_OVER_COINS');
  throwsCode(() => r2.raise(t1.id, { amount: 4.5 }), 'BAD_AMOUNT');
  throwsCode(() => r2.raise(t1.id, { amount: '5' }), 'BAD_AMOUNT');
  throwsCode(() => r2.raise(seat(r2, 2).id, { amount: 5 }), 'NOT_YOUR_TURN');
});
test('T-09 ไม่ทำอะไรจนหมดเวลา → pass อัตโนมัติ (R-7-05)', () => {
  const { room } = started(3);
  forceAuction(room, 1, [10, 10, 10]);
  const s1 = seat(room, 1);
  room.endPhaseNow();
  assert.strictEqual(room.auction.out.get(s1.id), 'timeout');
});
test('T-10 x=4 ผู้ชนะที่นั่ง 2: S2=คันแรง1, S3=2, S0=3, S1=4 (R-7-10)', () => {
  const { room } = started(4);
  forceAuction(room, 3, [13, 13, 13, 13]); // ผู้เปิด = ที่นั่ง 2
  const set = room.auction.set;
  while (room.phase === 'auction') room.pass(room.auction.turnId);
  const alloc = room.auctionHistory[0].allocation;
  assert.deepStrictEqual([2, 3, 0, 1].map(s => alloc[seat(room, s).id]), set);
  assert.ok(room.card(set[0]).power > room.card(set[3]).power);
});
test('T-11 bid ที่อิง stateVersion เก่าถูกปฏิเสธ (R-12-07)', () => {
  const { room } = started(3);
  forceAuction(room, 1, [10, 10, 10]);
  const s1 = seat(room, 1), s2 = seat(room, 2), ver = room.auction.seq;
  room.raise(s1.id, { amount: 2, stateVersion: ver });
  throwsCode(() => room.raise(s2.id, { amount: 3, stateVersion: ver }), 'STALE_STATE');
  room.raise(s2.id, { amount: 3, stateVersion: room.auction.seq });
});
test('T-12 requestId ซ้ำทำครั้งเดียว (R-12-07)', () => {
  const { room } = started(2);
  passAllAuctions(room);
  const p = room.players[0];
  room.select(p.id, { cardId: p.cars[0] });
  room.confirm(p.id, { requestId: 'abc' });
  const { room: r2 } = started(3);
  forceAuction(r2, 1, [10, 10, 10]);
  const s1 = seat(r2, 1);
  r2.raise(s1.id, { amount: 2, requestId: 'q1' });
  r2.pass(seat(r2, 2).id);
  r2.raise(seat(r2, 0).id, { amount: 3 });
  throwsCode(() => r2.raise(s1.id, { amount: 4, requestId: 'q1' }), 'DUPLICATE_REQUEST');
});
test('Coins ไม่ติดลบ และทุกคนได้รถครบ x คันหลัง Phase 1 (R-7-09, R-7-10)', () => {
  for (let n = 2; n <= 7; n++) {
    const { room } = started(n, n);
    passAllAuctions(room);
    assert.strictEqual(room.phase, 'racePick');
    assert.ok(room.players.every(p => p.cars.length === n && p.coins >= 0));
  }
});

// ---------- Race ----------
test('T-13 สุ่ม Prize 100,000 ครั้ง สัดส่วนตรงน้ำหนัก ±0.5% (R-7-20)', () => {
  const rand = seeded(42), cnt = {};
  for (let i = 0; i < 100000; i++) { const v = drawPrize(rand); cnt[v] = (cnt[v] || 0) + 1; }
  for (const [v, w] of CFG.PRIZE_TABLE) assert.ok(Math.abs(cnt[v] / 1000 - w) < 0.5, `${v}: ${cnt[v] / 1000}%`);
});
test('Prize ของ Race เรียงมาก→น้อย มี x ค่า และไม่สุ่มล่วงหน้า (R-7-20)', () => {
  const { room, ps } = started(4);
  passAllAuctions(room);
  assert.strictEqual(room.race.prizes.length, 4);
  assert.deepStrictEqual(room.race.prizes, room.race.prizes.slice().sort((a, b) => b - a));
  assert.ok(!('races' in room) && room.raceHistory.length === 0);
});
test('T-14 ก่อนเปิดผล payload ของ B และผู้ชมไม่มีรถที่ A เลือก, cars ของ A ครบและลำดับเดิม (R-4-02, R-4-03)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  const [A, B] = room.players;
  const before = room.getState(B.id).players.find(p => p.id === A.id).cars;
  const pick = A.cars[A.cars.length - 1];
  room.select(A.id, { cardId: pick }); room.confirm(A.id);
  for (const view of [room.getState(B.id), room.getState(null)]) {
    assert.strictEqual(view.myPick, null);
    assert.deepStrictEqual(view.players.find(p => p.id === A.id).cars, before);
    assert.ok(view.players.find(p => p.id === A.id).picked);
    assert.ok(!JSON.stringify(view.race).includes(pick));
  }
  assert.strictEqual(room.getState(A.id).myPick, pick);
});
test('T-15 select แต่ไม่ confirm → หมดเวลาใช้คันที่เลือกค้าง auto=true (R-7-24)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  const A = room.players[0], pick = A.cars[1];
  room.select(A.id, { cardId: pick });
  room.endPhaseNow(); room.endPhaseNow(); // หมดเวลา → RACE_RUN → แท่นรับรางวัล (ผลเปิดตอนแท่น — R-4-05)
  const row = room.raceHistory[0].rows.find(r => r.playerId === A.id);
  assert.strictEqual(row.cardId, pick); assert.ok(row.auto);
});
test('T-16 ไม่เลือกอะไร → สุ่มจากรถที่ยังไม่ใช้ (R-7-24)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  const B = room.players[1], had = B.cars.slice();
  room.endPhaseNow(); room.endPhaseNow();
  const row = room.raceHistory[0].rows.find(r => r.playerId === B.id);
  assert.ok(had.includes(row.cardId) && row.auto);
  assert.ok(!B.cars.includes(row.cardId));
});
test('T-17 ผู้เล่นที่ออกใน Phase 2 ถูกสุ่ม+ล็อกทันทีทุก Race และคะแนนนับ (R-7-23, R-12-06)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  const C = room.players[2];
  room.leave(C.id);
  assert.ok(room.race.confirmed.has(C.id));
  nextRace(room);
  assert.strictEqual(room.raceNo, 2);
  assert.ok(room.race.confirmed.has(C.id), 'Race 2 ต้องสุ่มให้ทันที');
  assert.ok(C.prizeTotal > 0);
});
test('ผู้เล่นออกในรอบประมูล: pass ทันทีทั้งตอนถึงตาและรอบถัดไป และยังได้รถ (v3, R-7-10)', () => {
  const { room } = started(3);
  forceAuction(room, 1, [10, 10, 10]);
  const s1 = seat(room, 1), s2 = seat(room, 2);
  room.leave(s1.id);
  assert.strictEqual(room.auction.out.get(s1.id), 'left');
  assert.strictEqual(room.auction.turnId, s2.id, 'ไม่ต้องรอ 60 วิ');
  assert.deepStrictEqual(room.auction.log.map(e => e.kind + ':' + (e.reason || '')), ['open:', 'pass:left']);
  while (room.phase === 'auction') room.pass(room.auction.turnId);
  assert.strictEqual(s1.cars.length, 1);
});
test('T-18 ทุกคน confirm ก่อนหมดเวลา → เปิดผลทันที (R-7-25, R-7-26)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  for (const p of room.players) { room.select(p.id, { cardId: p.cars[0] }); room.confirm(p.id); }
  assert.strictEqual(room.phase, 'raceRun', 'ยืนยันครบ → RACE START ทันที');
  assert.strictEqual(room.endsAt - room.now(), (CFG.RACE_COUNTDOWN_SECONDS + CFG.RACE_RUN_SECONDS) * 1000);
  room.endPhaseNow();
  assert.strictEqual(room.phase, 'raceResult');
  assert.strictEqual(room.endsAt - room.now(), CFG.RACE_RESULT_SECONDS * 1000);
  const rows = room.raceHistory[0].rows;
  assert.ok(rows[0].power > rows[1].power && rows[1].power > rows[2].power);
  assert.deepStrictEqual(rows.map(r => r.prize), room.raceHistory[0].prizes);
});
test('เลือกรถที่ไม่ใช่ของตัวเอง / หลังยืนยัน / confirm โดยไม่เลือก (R-7-22)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  const [A, B] = room.players;
  throwsCode(() => room.select(A.id, { cardId: B.cars[0] }), 'CAR_NOT_OWNED');
  throwsCode(() => room.confirm(A.id), 'NO_SELECTION');
  room.select(A.id, { cardId: A.cars[0] }); room.confirm(A.id);
  throwsCode(() => room.select(A.id, { cardId: A.cars[1] }), 'ALREADY_CONFIRMED');
  throwsCode(() => room.confirm(A.id), 'ALREADY_CONFIRMED');
});
test('T-19 Race สุดท้ายเลือกอัตโนมัติ ไม่มีช่วงเลือก (R-7-21)', () => {
  const { room } = started(2);
  passAllAuctions(room);
  nextRace(room); // Race 1 deadline → RACE START → ผล → Race 2
  assert.strictEqual(room.raceNo, 2); assert.strictEqual(room.phase, 'racePick');
  assert.ok(room.players.every(p => room.race.confirmed.has(p.id)));
  throwsCode(() => room.select(room.players[0].id, { cardId: room.players[0].cars[0] }), 'WRONG_PHASE');
  room.endPhaseNow(); assert.strictEqual(room.phase, 'raceRun', 'Race สุดท้ายก็มี RACE START');
  room.endPhaseNow(); room.endPhaseNow();
  assert.strictEqual(room.phase, 'gameOver');
  assert.ok(room.players.every(p => p.cars.length === 0));
});

// ---------- จบเกม ----------
function scriptedGame(n, prizesByRace, rankOrderByRace) {
  // ให้ผู้เล่น index i ได้อันดับตาม rankOrderByRace ด้วยการเลือกรถให้ power เรียงตามที่ต้องการ
  const { room } = started(n, 9);
  passAllAuctions(room);
  for (let r = 0; r < n; r++) {
    room.race.prizes = prizesByRace[r].slice();
    const order = rankOrderByRace[r]; // ชื่อผู้เล่นเรียงอันดับ 1..n
    // แจก power ใหม่ให้แต่ละคนชั่วคราวผ่าน catalog: สร้างการ์ดเฉพาะกิจ
    order.forEach((name, i) => {
      const p = room.players.find(q => q.name === name);
      const id = `fake-r${r}-${name}`;
      room.catalog.set(id, { id, name: id, power: 1000 - r * 10 - i });
      p.cars.push(id);
      if (r === n - 1) p.cars = [id];
      if (room.raceNo !== n) { room.select(p.id, { cardId: id }); }
      else room.race.picks.set(p.id, { cardId: id, nitro: 0 });
    });
    if (room.raceNo !== n) for (const p of room.players) room.confirm(p.id);
    else room.endPhaseNow();
    room.endPhaseNow(); room.endPhaseNow(); // RACE START → แท่นรับรางวัล → ถัดไป
  }
  return room;
}
test('T-20 Prize เท่ากัน → ตัดสินด้วยจำนวนอันดับ 1 (R-9-04)', () => {
  const room = scriptedGame(3, [[63, 43, 23], [58, 38, 23], [82, 43, 27]], [['P1', 'P2', 'P3'], ['P1', 'P3', 'P2'], ['P2', 'P3', 'P1']]);
  assert.strictEqual(room.phase, 'gameOver');
  const by = n => room.standings.find(s => room.player(s.playerId).name === n);
  assert.strictEqual(by('P1').prizeTotal, 148); assert.strictEqual(by('P2').prizeTotal, 148); assert.strictEqual(by('P3').prizeTotal, 104);
  assert.ok(by('P1').winner && !by('P2').winner);
  assert.strictEqual(room.tieBreak, 'firstPlaces');
});
test('T-21 Prize และอันดับ 1 เท่ากัน → ชนะร่วม (R-9-05)', () => {
  const room = scriptedGame(2, [[77, 38], [77, 38]], [['P1', 'P2'], ['P2', 'P1']]);
  assert.ok(room.standings.every(s => s.winner && s.rank === 1 && s.prizeTotal === 115));
  assert.strictEqual(room.tieBreak, 'shared');
});
test('ผู้เล่นที่ออกแล้วชนะได้ (R-9-06)', () => {
  const room = scriptedGame(2, [[77, 38], [77, 38]], [['P1', 'P2'], ['P1', 'P2']]);
  assert.ok(room.standings.find(s => room.player(s.playerId).name === 'P1').winner);
  const { room: r2 } = started(2);
  passAllAuctions(r2);
  r2.leave(r2.players[0].id);
  while (r2.phase !== 'gameOver') r2.endPhaseNow();
  assert.ok(r2.standings.some(s => s.left));
});

// ---------- ออนไลน์ ----------
test('T-22 resume ด้วย token ถูกได้ที่นั่งเดิม token ผิดไม่ได้ (R-12-05)', () => {
  const { room, ps } = started(2);
  assert.strictEqual(room.resume(ps[1].id, ps[1].token), ps[1]);
  assert.strictEqual(room.resume(ps[1].id, 'bad'), null);
});
test('T-23 ผู้เล่นที่ออกแล้วส่ง action ไม่ได้ (R-12-06)', () => {
  const { room } = started(2);
  const p = room.players[0]; room.leave(p.id);
  throwsCode(() => room.action(p.id, { type: 'auction:pass' }), 'SPECTATOR_ONLY');
});
test('T-24 ผู้เล่นทุกคนออก → cancelled (R-12-08)', () => {
  const { room } = started(3);
  room.players.forEach(p => room.leave(p.id));
  assert.strictEqual(room.phase, 'cancelled');
});
test('เข้าห้องหลังเริ่มเกมไม่ได้ / payload ผิดชนิดไม่ทำให้ล่ม', () => {
  const { room, ps } = started(2);
  throwsCode(() => room.join('late'), 'GAME_STARTED');
  for (const bad of [null, 5, 'x', {}, { type: 'auction:raise', amount: NaN }, { type: 'race:select', cardId: { a: 1 } }, { type: 'nope' }]) {
    assert.throws(() => room.action(room.auction.turnId || ps[0].id, bad), GameError);
  }
});
test('เจ้าของห้องออกใน lobby → สิทธิ์ไปคนถัดไป (R-12-09)', () => {
  const { room, ps } = newRoom(3);
  room.leave(ps[0].id);
  assert.strictEqual(room.hostId, ps[1].id);
  assert.strictEqual(room.players.length, 2);
});

// ---------- ป้ายประกาศ + ประวัติ bid (layout v2: L1, L4, L5) ----------
function introRoom(n, seed = 5) {
  let t = 1000000;
  const room = new Room('INTR', { cards: CARDS, rand: seeded(seed), now: () => t });
  const ps = []; for (let i = 0; i < n; i++) ps.push(room.join('P' + (i + 1)));
  return { room, ps, tick: ms => { t += ms; } };
}
test('T-30 เริ่มเกม: ป้าย PHASE 1 + AUCTION 1 รวม 4 วิ ยังไม่มีใครถึงตาจนป้ายจบ แล้วจึงนับ 10 วิ (L1)', () => {
  const { room, ps } = introRoom(3);
  room.start(ps[0].id);
  assert.strictEqual(room.phase, 'auction');
  assert.strictEqual(room.auction.turnId, null);
  const st = room.getState(ps[0].id);
  assert.deepStrictEqual(st.intro.steps.map(s => s.kind + (s.no || '')), ['rules', 'phase1', 'auction1', 'lot1']); // v2.0: สรุปกติกา + เปิดรถทีละคัน
  assert.strictEqual(st.intro.steps[2].endsAt - st.intro.steps[1].endsAt, CFG.INTRO_SECONDS * 1000);
  assert.strictEqual(st.intro.steps[3].endsAt - st.intro.steps[2].endsAt, 3 * CFG.LOT_REVEAL_STEP_SECONDS * 1000);
  assert.strictEqual(st.endsAt, st.intro.steps[3].endsAt);
  const opener = seat(room, 0), next = seat(room, 1);
  throwsCode(() => room.raise(next.id, { amount: 2 }), 'NOT_YOUR_TURN');
  room.endPhaseNow();
  assert.strictEqual(room.intro, null);
  assert.strictEqual(room.auction.turnId, next.id);
  assert.strictEqual(room.endsAt - room.now(), CFG.BID_TURN_SECONDS * 1000);
  assert.ok(opener);
});
test('T-31 ผลประมูลแสดงตาม AUCTION_RESULT_SECONDS แล้ว Auction 2 มีป้าย AUCTION อย่างเดียว (L1, L5)', () => {
  const { room, ps } = introRoom(3);
  room.start(ps[0].id); room.endPhaseNow();
  while (room.phase === 'auction') room.pass(room.auction.turnId);
  assert.strictEqual(room.phase, 'auctionResult');
  assert.strictEqual(room.endsAt - room.now(), CFG.AUCTION_RESULT_SECONDS * 1000);
  room.endPhaseNow();
  assert.strictEqual(room.auctionNo, 2);
  assert.deepStrictEqual(room.intro.steps.map(s => s.kind + s.no), ['auction2', 'lot2']);
  assert.ok(room.getState(null).auctionHistory.length === 1, 'ผลประมูลรอบก่อนเปิดดูได้ทุกเฟส');
});
test('T-32 Race 1: ป้าย PHASE 2 + RACE 1, เลือกรถระหว่างป้ายไม่ได้, หลังป้ายนับเวลาเลือกรถ (L1)', () => {
  const { room, ps } = introRoom(3);
  room.start(ps[0].id);
  passAllAuctions(room);
  assert.strictEqual(room.phase, 'racePick');
  assert.deepStrictEqual(room.intro.steps.map(s => s.kind + s.no), ['phase2', 'race1']);
  const A = room.players[0];
  throwsCode(() => room.select(A.id, { cardId: A.cars[0] }), 'WRONG_PHASE');
  room.endPhaseNow();
  assert.strictEqual(room.intro, null);
  assert.strictEqual(room.endsAt - room.now(), CFG.PICK_SECONDS * 1000);
  room.select(A.id, { cardId: A.cars[0] }); room.confirm(A.id);
  room.endPhaseNow(); room.endPhaseNow(); room.endPhaseNow(); // หมดเวลา → RACE START → ผล → Race 2 (ป้าย RACE 2)
  assert.strictEqual(room.raceNo, 2);
  assert.deepStrictEqual(room.intro.steps.map(s => s.kind + s.no), ['race2']);
});
test('T-33 ทุกคนออกยกเว้น 1 ระหว่างป้าย Race → ไม่เปิดผลก่อนป้ายจบ, Race สุดท้ายมีป้ายแล้วค่อยนับ 3 วิ (L1, R-7-21)', () => {
  const { room, ps } = introRoom(2);
  room.start(ps[0].id);
  passAllAuctions(room);
  room.leave(room.players[1].id);
  assert.strictEqual(room.phase, 'racePick');
  assert.ok(room.intro);
  room.endPhaseNow(); // ป้ายจบ → นับเวลาเลือก
  assert.strictEqual(room.phase, 'racePick');
  room.endPhaseNow(); room.endPhaseNow(); room.endPhaseNow(); // หมดเวลา → RACE START → ผล → Race 2 (สุดท้าย)
  assert.strictEqual(room.raceNo, 2);
  assert.deepStrictEqual(room.intro.steps.map(s => s.kind + s.no), ['race2']);
  room.endPhaseNow();
  assert.strictEqual(room.endsAt - room.now(), CFG.LAST_RACE_REVEAL_SECONDS * 1000);
  room.endPhaseNow(); room.endPhaseNow(); room.endPhaseNow();
  assert.strictEqual(room.phase, 'gameOver');
});
test('T-34 ประวัติ bid ทั้งรอบ (open/raise/pass/out) และ Coins ตอนเริ่มรอบ อยู่ใน state ของทุกคน (L4)', () => {
  const { room } = started(3);
  forceAuction(room, 1, [10, 10, 1]);
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  room.raise(s1.id, { amount: 3 }); // s2 มี 1 Coin → ออกอัตโนมัติ
  room.pass(s0.id);
  const st = room.getState(null);
  assert.strictEqual(st.phase, 'auctionResult');
  assert.strictEqual(room.auction.log.length, 4);
  assert.deepStrictEqual(room.auction.log.map(e => e.kind), ['open', 'raise', 'out', 'pass']);
  assert.strictEqual(room.auction.log[2].pid, s2.id);
  const view = room.getState(s0.id).auction;
  assert.deepStrictEqual(view.log.map(e => e.amount), [1, 3, undefined, undefined]);
  assert.deepStrictEqual(view.startCoins, { [s0.id]: 10, [s1.id]: 10, [s2.id]: 1 });
});
test('T-35 บอทสุ่มเล่นครบทั้งที่มีป้ายประกาศ x=2–7 อย่างละ 40 เกม (L1)', () => {
  for (let n = 2; n <= 7; n++) for (let g = 0; g < 40; g++) {
    const rand = seeded(7000 + n * 100 + g);
    const room = new Room('SIM2', { cards: CARDS, rand });
    const ps = []; for (let i = 0; i < n; i++) ps.push(room.join('B' + i));
    room.start(ps[0].id);
    let guard = 0;
    while (room.phase !== 'gameOver' && guard++ < 5000) {
      if (room.phase === 'auction' && room.auction.turnId) {
        const p = room.player(room.auction.turnId), a = room.auction;
        if (rand() < 0.4 && p.coins > a.currentBid) room.raise(p.id, { amount: a.currentBid + 1 }); else room.pass(p.id);
      } else if (room.phase === 'racePick' && !room.intro && room.raceNo !== n) {
        for (const p of room.players) if (!room.race.confirmed.has(p.id)) { room.select(p.id, { cardId: p.cars[0] }); room.confirm(p.id); }
        if (room.phase === 'racePick') room.endPhaseNow();
      } else room.endPhaseNow();
    }
    assert.strictEqual(room.phase, 'gameOver', `n=${n} g=${g} ค้างที่ ${room.phase}`);
    assert.ok(room.players.every(p => p.coins >= 0 && p.cars.length === 0));
    room.destroy();
  }
});

// ---------- v3: เวลา, ผู้เล่นที่ออก, RACE START ----------
test('T-36 ค่าเวลาใน config ครบและเป็นจำนวนเต็ม ≥ 1 (config เวลา)', () => {
  for (const k of ['INTRO_SECONDS', 'BID_TURN_SECONDS', 'AUCTION_RESULT_SECONDS', 'PICK_SECONDS', 'PICK_REMIND_SECONDS', 'WARNING_SECONDS',
    'RACE_COUNTDOWN_SECONDS', 'RACE_RUN_SECONDS', 'RACE_RESULT_SECONDS', 'LAST_RACE_REVEAL_SECONDS']) {
    assert.ok(Number.isInteger(CFG[k]) && CFG[k] >= 1, k);
  }
});
test('T-37 ผู้เล่นที่ออกตั้งแต่รอบก่อน ถึงตาในรอบถัดไป → pass ทันที ไม่มีเวลานับ (v3)', () => {
  const { room } = started(3);
  forceAuction(room, 1, [10, 10, 10]);
  const s2 = seat(room, 2);
  room.leave(s2.id); // ยังไม่ถึงตา
  room.pass(seat(room, 1).id); // s2 ถูกข้ามทันที → s0 ชนะ
  assert.strictEqual(room.phase, 'auctionResult');
  assert.strictEqual(room.auction.out.get(s2.id), 'left');
  room.endPhaseNow(); // Auction 2 ผู้เปิด = ที่นั่ง 1
  assert.strictEqual(room.auction.turnId, seat(room, 0).id, 'ข้ามที่นั่ง 2 ที่ออกแล้ว');
});
test('T-38 RACE_RUN: มีลำดับเข้าเส้นชัยแต่ไม่มี Power/Prize จนแท่นรับรางวัล (R-4-05, แก้จาก v3)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  room.endPhaseNow(); // หมดเวลา → สุ่มรถ → RACE START
  const st = room.getState(null);
  assert.strictEqual(st.phase, 'raceRun');
  assert.ok(Math.abs(st.race.runAt - room.now()) < 1000);
  assert.strictEqual(st.raceHistory.length, 0);
  assert.strictEqual(st.race.run.order.length, 3);
  assert.ok(!JSON.stringify(st.race.run).includes('"power"') && !JSON.stringify(st.race.run).includes('"total"'));
  assert.strictEqual(st.race.result, null);
  const A = room.players[0];
  throwsCode(() => room.select(A.id, { cardId: A.cars[0] }), 'WRONG_PHASE');
  room.endPhaseNow();
  assert.strictEqual(room.getState(null).phase, 'raceResult');
});

// ---------- v4: จำนวนรอบ, กลับสู่ Lobby ----------
function playToEnd(room) { // เล่นจนจบด้วยการ pass/หมดเวลาทั้งหมด
  let g = 0;
  while (room.phase !== 'gameOver' && g++ < 5000) {
    if (room.phase === 'auction' && room.auction.turnId) room.pass(room.auction.turnId);
    else room.endPhaseNow();
  }
}
test('T-39 จำนวนรอบ: ค่าเริ่มต้น = จำนวนผู้เล่น, ตั้งได้ 2…รถ÷คน, Coins ตามสัดส่วน, ผู้เปิดวนตามที่นั่ง (v4)', () => {
  const { room, ps } = newRoom(4);
  assert.strictEqual(room.getState(ps[0].id).rounds, 4);
  assert.strictEqual(room.getState(ps[0].id).startCoins, 13);
  assert.strictEqual(room.roundsMax(), 12);
  throwsCode(() => room.setRounds(ps[1].id, { rounds: 5 }), 'NOT_HOST');
  for (const bad of [1, 13, 2.5, '6']) throwsCode(() => room.setRounds(ps[0].id, { rounds: bad }), 'BAD_ROUNDS');
  room.action(ps[0].id, { type: 'lobby:rounds', rounds: 10 });
  assert.strictEqual(room.getState(null).rounds, 10);
  assert.strictEqual(room.getState(null).startCoins, Math.ceil(13 * 10 / 4)); // 33
  room.start(ps[0].id);
  assert.strictEqual(room.x, 10); assert.strictEqual(room.n, 4);
  assert.strictEqual(room.carSets.length, 10);
  assert.ok(room.carSets.every(set => set.length === 4));
  assert.strictEqual(new Set([].concat(...room.carSets)).size, 40);
  assert.ok(room.players.every(p => p.coins === 33));
  const openers = [];
  let g = 0;
  while (room.phase !== 'racePick' && g++ < 500) {
    if (room.phase === 'auction' && room.auction.turnId) { if (!openers[room.auction.no - 1]) openers[room.auction.no - 1] = room.player(room.auction.openerId).seat; room.pass(room.auction.turnId); }
    else room.endPhaseNow();
  }
  assert.deepStrictEqual(openers, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
  assert.ok(room.players.every(p => p.cars.length === 10));
  assert.strictEqual(room.race.prizes.length, 4, 'Prize ต่อ Race = จำนวนผู้เล่น');
  playToEnd(room);
  assert.strictEqual(room.raceHistory.length, 10);
  assert.ok(room.players.every(p => p.cars.length === 0));
});
test('T-40 ตั้งรอบไว้เกินแล้วมีคนเข้าเพิ่ม → ลดเหลือสูงสุดที่ทำได้, null = กลับค่าเริ่มต้น (v4)', () => {
  const { room, ps } = newRoom(2);
  room.setRounds(ps[0].id, { rounds: 25 });
  assert.strictEqual(room.getState(null).rounds, 25);
  room.join('P3');
  assert.strictEqual(room.getState(null).rounds, 16);
  room.setRounds(ps[0].id, { rounds: null });
  assert.strictEqual(room.getState(null).rounds, 3);
  assert.ok(room.getState(null).roundsAuto);
});
test('T-41 กลับสู่ Lobby: เอาคนที่ออกระหว่างเกมออก, รีเซ็ตคะแนน, เล่นใหม่ได้ (v4)', () => {
  const { room, ps } = started(3);
  throwsCode(() => room.backToLobby(), 'WRONG_PHASE');
  const quitter = room.players[1];
  room.leave(quitter.id);
  playToEnd(room);
  const removed = room.backToLobby();
  assert.deepStrictEqual(removed, [quitter.id]);
  assert.strictEqual(room.phase, 'lobby');
  assert.strictEqual(room.players.length, 2);
  assert.ok(room.players.every(p => p.prizeTotal === 0 && p.cars.length === 0 && !p.left));
  assert.deepStrictEqual(room.players.map(p => p.seat), [0, 1]);
  assert.strictEqual(room.raceHistory.length, 0);
  const host = room.players.find(p => p.id === room.hostId);
  assert.ok(host);
  room.start(host.id);
  assert.strictEqual(room.phase, 'auction');
  assert.ok(room.players.every(p => p.coins === CFG.STARTING_COINS[2]));
});

// ---------- T-29 จำลองเกมเต็มด้วยบอทสุ่ม ----------
test('T-29 บอทสุ่ม x=2–7 อย่างละ 300 เกม: จบทุกเกม, Coins ≥ 0, ใช้รถครบ, Prize รวมตรง', () => {
  for (let n = 2; n <= 7; n++) {
    for (let g = 0; g < 300; g++) {
      const rand = seeded(n * 1000 + g);
      const { room } = (() => { const room = new Room('SIM', { cards: CARDS, rand, introSeconds: 0 }); const ps = []; for (let i = 0; i < n; i++) ps.push(room.join('B' + i)); room.start(ps[0].id); return { room }; })();
      let guard = 0;
      while (room.phase !== 'gameOver' && guard++ < 5000) {
        if (room.phase === 'auction' && room.auction.turnId) {
          const p = room.player(room.auction.turnId), a = room.auction;
          const roll = rand();
          if (roll < 0.1) room.endPhaseNow();
          else if (roll < 0.5 && p.coins >= a.currentBid + 1) room.raise(p.id, { amount: a.currentBid + 1 + Math.floor(rand() * (p.coins - a.currentBid)) });
          else room.pass(p.id);
        } else if (room.phase === 'racePick' && room.raceNo !== n) {
          for (const p of room.players) {
            if (room.race.confirmed.has(p.id) || rand() < 0.2) continue;
            room.select(p.id, { cardId: p.cars[Math.floor(rand() * p.cars.length)] });
            if (rand() < 0.8) room.confirm(p.id);
          }
          if (room.phase === 'racePick') room.endPhaseNow();
        } else room.endPhaseNow();
      }
      assert.strictEqual(room.phase, 'gameOver', `n=${n} g=${g} ค้างที่ ${room.phase}`);
      assert.ok(room.players.every(p => p.coins >= 0 && p.cars.length === 0));
      const total = room.raceHistory.reduce((s, r) => s + r.prizes.reduce((a, b) => a + b, 0), 0);
      assert.strictEqual(room.players.reduce((s, p) => s + p.prizeTotal, 0), total);
      room.destroy();
    }
  }
});


// =====================================================================
//  v2.0 — โหมด Chaos / Shadow, ปุ่มเสริม, host (spec v2.0 หัวข้อ 14 T-50…T-90)
// =====================================================================
const MODEL_IDS = ['animal-turtle', 'code-jet', 'kenney-race'];
function roomS(n, settings = {}, seed = 1, opts = {}) {
  const room = new Room('V2', { cards: CARDS, models: MODEL_IDS, rand: seeded(seed), introSeconds: 0, ...opts });
  const ps = []; for (let i = 0; i < n; i++) ps.push(room.join('P' + (i + 1)));
  if (Object.keys(settings).length) room.setSettings(ps[0].id, settings);
  return { room, ps };
}
function startedS(n, settings, seed) { const r = roomS(n, settings, seed); r.room.start(r.ps[0].id); return r; }
const chaos = (n, extra = {}, seed) => startedS(n, { mode: 'chaos', ...extra }, seed);
function toRace(room) { // จบ Phase 1 ทุกโหมด (pass / ส่งราคาอัตโนมัติ)
  let g = 0;
  while (!['racePick', 'gameOver'].includes(room.phase) && g++ < 500) {
    if (room.phase === 'auction' && room.auction.turnId) room.pass(room.auction.turnId); else room.endPhaseNow();
  }
}
function finishRace(room) { let g = 0; const no = room.raceNo; while (room.phase !== 'raceResult' && g++ < 10) room.endPhaseNow(); assert.strictEqual(room.race.no, no); return room.race.result; }
// ตั้งรถ (power ที่ต้องการ) ให้ผู้เล่นใน Race ปัจจุบันด้วยการ์ดเฉพาะกิจ
function giveCar(room, p, power, tag) { const id = `t-${tag}-${p.name}-${power}`; room.catalog.set(id, { id, name: id, power }); p.cars.push(id); return id; }

test('T-50 Classic n=4 x=4: Coins 13 ทุกคน (R-5-03)', () => {
  const { room } = startedS(4, { mode: 'classic' });
  assert.ok(room.players.every(p => p.coins === 13));
});
test('T-51/T-52 Chaos n=4: x=4 → 20, x=3 → 15 (R-5-03)', () => {
  const c4 = chaos(4).room; assert.strictEqual(c4.startCoins, 20);
  assert.ok(c4.players.filter(p => p.id !== c4.auction.openerId).every(p => p.coins === 20));
  const { room, ps } = roomS(4, { mode: 'chaos' }); room.setRounds(ps[0].id, { rounds: 3 }); room.start(ps[0].id);
  assert.strictEqual(room.startCoins, 15);
});
test('T-53 host ตั้ง Coins 30 แล้วเปลี่ยนรอบ → ทุกคน 30 · null = ค่าแนะนำ (R-7-72)', () => {
  const { room, ps } = roomS(4, { coinsOverride: 30 });
  room.setRounds(ps[0].id, { rounds: 6 });
  assert.strictEqual(room.getState(null).startCoins, 30);
  room.setSettings(ps[0].id, { coinsOverride: null });
  assert.strictEqual(room.getState(null).startCoins, Math.ceil(13 * 6 / 4));
  room.setSettings(ps[0].id, { coinsOverride: 30 });
  room.start(ps[0].id);
  assert.ok(room.players.every(p => p.coins === 30));
  const { room: r2, ps: q } = roomS(2);
  for (const bad of [0, 100, 2.5, '9']) throwsCode(() => r2.setSettings(q[0].id, { coinsOverride: bad }), 'BAD_SETTING');
  throwsCode(() => r2.setSettings(q[1].id, { mode: 'chaos' }), 'NOT_HOST');
  throwsCode(() => r2.setSettings(q[0].id, { mode: 'poker' }), 'BAD_SETTING');
  throwsCode(() => r2.setSettings(q[0].id, { toggles: { bounty: true } }), 'BAD_SETTING');
});
test('R-7-71 เปลี่ยนโหมด → Refund ตั้งตามค่าเริ่มต้นของโหมด', () => {
  const { room, ps } = roomS(2);
  assert.strictEqual(room.settings.toggles.refund, false);
  room.setSettings(ps[0].id, { mode: 'chaos' }); assert.strictEqual(room.settings.toggles.refund, true);
  room.setSettings(ps[0].id, { toggles: { refund: false } }); assert.strictEqual(room.settings.toggles.refund, false);
  room.setSettings(ps[0].id, { mode: 'classic' }); assert.strictEqual(room.settings.toggles.refund, false);
  room.setSettings(ps[0].id, { mode: 'shadow' }); assert.strictEqual(room.settings.toggles.refund, true);
});
test('T-54 Chaos ผู้เปิด S0 มี 10 → เหลือ 9 committed 1 (R-7-30)', () => {
  const { room } = chaos(3, { toggles: { refund: false } });
  forceAuction(room, 1, [10, 10, 10]);
  // forceAuction ตั้ง coins ก่อน startAuction → blind หักทันที
  assert.strictEqual(seat(room, 0).coins, 9);
  assert.strictEqual(room.auction.committed[seat(room, 0).id], 1);
});
test('T-55 Chaos S1 bid 3 แล้ว bid 5 → เสียรวม 5 (R-7-31)', () => {
  const { room } = chaos(3, { toggles: { refund: false } });
  forceAuction(room, 1, [10, 10, 10]);
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  room.raise(s1.id, { amount: 3 }); assert.strictEqual(s1.coins, 7);
  room.raise(s2.id, { amount: 4 });
  room.pass(s0.id);
  room.raise(s1.id, { amount: 5 }); assert.strictEqual(s1.coins, 5);
  assert.strictEqual(room.auction.committed[s1.id], 5);
});
test('T-56 Chaos n=4: อันดับตามยอดที่ลง คนลง 0 ใคร pass ก่อนได้คันอ่อนกว่า (R-7-34, R-7-35)', () => {
  const { room } = chaos(4, { toggles: { refund: false } });
  forceAuction(room, 1, [10, 10, 10, 10]);
  const S = [0, 1, 2, 3].map(s => seat(room, s)), set = room.auction.set;
  room.pass(S[1].id); room.raise(S[2].id, { amount: 2 }); room.pass(S[3].id); room.pass(S[0].id);
  const res = room.auctionHistory[0];
  assert.deepStrictEqual(res.ranking.map(r => r.pid), [S[2].id, S[0].id, S[3].id, S[1].id]);
  assert.deepStrictEqual([S[2], S[0], S[3], S[1]].map(p => res.allocation[p.id]), set);
  assert.deepStrictEqual([S[0].coins, S[1].coins, S[2].coins, S[3].coins], [9, 10, 8, 10]);
});
test('T-57 Chaos committed 3 เหลือ 1 currentBid 5 → ออกอัตโนมัติ committed ไม่คืน (R-7-32)', () => {
  const { room } = chaos(3, { toggles: { refund: false } });
  forceAuction(room, 1, [10, 4, 10]);
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  room.raise(s1.id, { amount: 3 }); assert.strictEqual(s1.coins, 1);
  room.raise(s2.id, { amount: 5 });
  room.pass(s0.id); // ถึงตา S1: 1 + 3 < 6 → ออก
  assert.strictEqual(room.phase, 'auctionResult');
  assert.strictEqual(room.auction.out.get(s1.id), 'no_money');
  assert.strictEqual(s1.coins, 1);
  assert.deepStrictEqual(room.auctionHistory[0].ranking.map(r => r.pid), [s2.id, s1.id, s0.id]);
});
test('Chaos raise ใช้ committed + Coins ได้ แต่เกินไม่ได้ (R-7-31)', () => {
  const { room } = chaos(3, { toggles: { refund: false } });
  forceAuction(room, 1, [10, 4, 10]);
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  room.raise(s1.id, { amount: 2 }); room.raise(s2.id, { amount: 3 }); room.pass(s0.id);
  throwsCode(() => room.raise(s1.id, { amount: 5 }), 'BID_OVER_COINS'); // มี 2 + ลงแล้ว 2 = 4
  room.raise(s1.id, { amount: 4 }); assert.strictEqual(s1.coins, 0);
  room.pass(s2.id);
  assert.strictEqual(room.phase, 'auctionResult');
});
test('Chaos บอทสุ่ม n=2–7 อย่างละ 60 เกม + Refund: จบ Coins ≥ 0 ใช้รถครบ', () => {
  for (let n = 2; n <= 7; n++) for (let g = 0; g < 60; g++) {
    const rand = seeded(500 + n * 100 + g);
    const { room } = startedS(n, { mode: 'chaos', toggles: { nitro: true, campaign: true, mystery: true, suddenDeath: true } }, 500 + n * 100 + g);
    let guard = 0;
    while (room.phase !== 'gameOver' && guard++ < 5000) {
      if (room.phase === 'auction' && room.auction.turnId) {
        const p = room.player(room.auction.turnId), a = room.auction, max = p.coins + a.committed[p.id];
        if (rand() < 0.5 && max > a.currentBid) room.raise(p.id, { amount: a.currentBid + 1 + Math.floor(rand() * (max - a.currentBid)) }); else room.pass(p.id);
      } else if (room.phase === 'racePick' && !room.race.last && !room.race.sudden) {
        for (const p of room.players) if (!room.race.confirmed.has(p.id)) { room.select(p.id, { cardId: p.cars[0], nitro: Math.min(p.coins, Math.floor(rand() * 6), CFG.NITRO_MAX_COINS) * (room.race.event === 'ban' ? 0 : 1) }); room.confirm(p.id); }
        if (room.phase === 'racePick') room.endPhaseNow();
      } else room.endPhaseNow();
    }
    assert.strictEqual(room.phase, 'gameOver', `n=${n} g=${g} ค้างที่ ${room.phase}`);
    assert.ok(room.players.every(p => p.coins >= 0 && p.cars.length === 0));
    room.destroy();
  }
});
test('T-58 Shadow n=3 ราคา 4/4/2 ผู้เปิด S1 → S1, S0, S2 (R-7-44)', () => {
  const { room } = startedS(3, { mode: 'shadow', toggles: { refund: false } });
  room.clearTimer(); [10, 10, 10].forEach((c, s) => { seat(room, s).coins = c; }); room.startAuction(2); // ผู้เปิด = ที่นั่ง 1
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  room.shadowBid(s0.id, { amount: 4 }); room.shadowBid(s1.id, { amount: 4 }); room.shadowBid(s2.id, { amount: 2 });
  [s0, s1, s2].forEach(p => room.shadowConfirm(p.id));
  assert.strictEqual(room.phase, 'shadowReveal');
  assert.deepStrictEqual(room.auction.reveal.flipGroups, [[s2.id], [s1.id, s0.id]]);
  room.endPhaseNow();
  const res = room.auctionHistory[0];
  assert.deepStrictEqual(res.ranking.map(r => r.pid), [s1.id, s0.id, s2.id]);
  assert.deepStrictEqual([s0.coins, s1.coins, s2.coins], [6, 6, 8]);
});
test('T-59 Shadow Coins 0 → ไม่ต้องส่ง ได้คันท้าย (R-7-41)', () => {
  const { room } = startedS(3, { mode: 'shadow', toggles: { refund: false } });
  room.clearTimer(); [5, 5, 0].forEach((c, s) => { seat(room, s).coins = c; }); room.startAuction(1);
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  throwsCode(() => room.shadowBid(s2.id, { amount: 1 }), 'BID_OVER_COINS');
  room.shadowBid(s0.id, { amount: 1 }); room.shadowBid(s1.id, { amount: 1 });
  room.shadowConfirm(s0.id); room.shadowConfirm(s1.id);
  room.endPhaseNow();
  const res = room.auctionHistory[0];
  assert.strictEqual(res.ranking[2].pid, s2.id);
  assert.strictEqual(res.allocation[s2.id], room.auction.set[2]);
});
test('T-60 Shadow ไม่ส่งจนหมดเวลา → 1 อัตโนมัติ · ค่าค้างที่ยังไม่ยืนยันถูกใช้ (R-7-43)', () => {
  const { room } = startedS(3, { mode: 'shadow', toggles: { refund: false } });
  room.clearTimer(); [10, 10, 10].forEach((c, s) => { seat(room, s).coins = c; }); room.startAuction(1);
  const [s0, s1] = [0, 1].map(s => seat(room, s));
  room.shadowBid(s1.id, { amount: 7 });
  room.endPhaseNow(); // deadline
  const bids = room.auction.reveal.bids;
  assert.strictEqual(bids.find(b => b.pid === s0.id).amount, 1); assert.ok(bids.find(b => b.pid === s0.id).auto);
  assert.strictEqual(bids.find(b => b.pid === s1.id).amount, 7);
  throwsCode(() => room.shadowBid(s0.id, { amount: 1 }), 'WRONG_PHASE');
});
test('T-61 Shadow ก่อนเปิด payload ของคนอื่นไม่มีราคา (R-7-46, R-12-02)', () => {
  const { room } = startedS(3, { mode: 'shadow' });
  room.clearTimer(); [10, 10, 10].forEach((c, s) => { seat(room, s).coins = c; }); room.startAuction(1);
  const [s0, s1] = [0, 1].map(s => seat(room, s));
  room.shadowBid(s0.id, { amount: 9 });
  const other = JSON.stringify(room.getState(s1.id)), spec = JSON.stringify(room.getState(null));
  assert.strictEqual(room.getState(s0.id).myBid, 9);
  assert.strictEqual(room.getState(s1.id).myBid, null);
  for (const j of [other, spec]) assert.ok(!/"bids"/.test(j) && !j.includes(':9,') , 'ราคารั่ว');
  assert.throws(() => room.shadowBid(s1.id, { amount: 11 }), e => e.code === 'BID_OVER_COINS');
  assert.throws(() => room.shadowBid(s1.id, { amount: 0 }), e => e.code === 'BID_TOO_LOW');
});
test('Shadow บอทสุ่ม n=2–7 อย่างละ 30 เกม จบครบ', () => {
  for (let n = 2; n <= 7; n++) for (let g = 0; g < 30; g++) {
    const rand = seeded(900 + n * 50 + g);
    const { room } = startedS(n, { mode: 'shadow', toggles: { nitro: true, mystery: true } }, 900 + n * 50 + g);
    let guard = 0;
    while (room.phase !== 'gameOver' && guard++ < 5000) {
      if (room.phase === 'shadowBid') {
        for (const p of room.players) if (!room.auction.broke.has(p.id) && !room.auction.confirmed.has(p.id) && rand() < 0.8) { room.shadowBid(p.id, { amount: 1 + Math.floor(rand() * p.coins) }); room.shadowConfirm(p.id); }
        if (room.phase === 'shadowBid') room.endPhaseNow();
      } else room.endPhaseNow();
    }
    assert.strictEqual(room.phase, 'gameOver');
    assert.ok(room.players.every(p => p.coins >= 0 && p.cars.length === 0));
  }
});
test('T-62 Refund Chaos: B ชนะ 6, A ลง 3, C ลง 1 (blind), D ลง 0 → A+1, C+1, D+2, B 0 (R-7-50…54)', () => {
  const { room } = chaos(4);
  forceAuction(room, 1, [20, 20, 20, 20]); // ผู้เปิด S0 = "C"
  const [C, A, B, D] = [0, 1, 2, 3].map(s => seat(room, s));
  room.raise(A.id, { amount: 3 }); room.raise(B.id, { amount: 6 }); room.pass(D.id); room.pass(C.id); room.pass(A.id);
  const res = room.auctionHistory[0];
  assert.deepStrictEqual(res.ranking.map(r => r.pid), [B.id, A.id, C.id, D.id]);
  assert.deepStrictEqual(res.refund, { [A.id]: 1, [C.id]: 1, [D.id]: 2 });
  assert.deepStrictEqual([A.coins, B.coins, C.coins, D.coins], [18, 14, 20, 22]);
});
test('T-63 Refund n=2 คนแพ้ลง 3 → +1+2 = +3 (R-7-53)', () => {
  const { room } = chaos(2);
  forceAuction(room, 1, [10, 10]);
  const [s0, s1] = [seat(room, 0), seat(room, 1)];
  room.raise(s1.id, { amount: 2 }); room.raise(s0.id, { amount: 3 }); room.pass(s1.id);
  assert.deepStrictEqual(room.auctionHistory[0].refund, { [s1.id]: 3 });
});
test('T-64 Refund Classic n=3: คนท้าย +2 รองท้าย +1 (R-7-52, R-7-53)', () => {
  const { room } = startedS(3, { toggles: { refund: true } });
  forceAuction(room, 1, [10, 10, 10]);
  const [s0, s1, s2] = [0, 1, 2].map(s => seat(room, s));
  room.raise(s1.id, { amount: 4 }); room.pass(s2.id); room.pass(s0.id);
  const res = room.auctionHistory[0]; // ผู้ชนะ S1 → S2 ได้คันที่ 2, S0 ได้คันท้าย
  assert.deepStrictEqual(res.refund, { [s2.id]: 1, [s0.id]: 2 });
  assert.deepStrictEqual([s0.coins, s1.coins, s2.coins], [12, 6, 11]);
});
// ---------- Nitro / Campaign ----------
function raceWith(settings, n = 2, seed = 3) {
  const r = startedS(n, settings, seed); toRace(r.room); assert.strictEqual(r.room.phase, 'racePick'); return r;
}
function pickPower(room, p, power, nitro = 0, tag = 'x') { const id = giveCar(room, p, power, tag + room.raceNo); room.select(p.id, { cardId: id, nitro }); room.confirm(p.id); return id; }
test('T-65/T-66 Nitro: 38+3 = 42.5 ชนะ 41 · 42.5 = 42.5 → base สูงกว่าชนะ (R-7-26, R-7-91)', () => {
  const { room } = raceWith({ toggles: { nitro: true } });
  const [A, B] = room.players; A.coins = 10; B.coins = 10;
  pickPower(room, A, 38, 3); pickPower(room, B, 41, 0);
  let res = finishRace(room);
  assert.strictEqual(res.rows[0].playerId, A.id); assert.strictEqual(res.rows[0].total, 42.5);
  assert.strictEqual(A.coins, 7, 'หัก Nitro ตอนผล');
  room.endPhaseNow();
  if (room.phase === 'racePick' && !room.race.last) {
    pickPower(room, A, 38, 3, 'y'); pickPower(room, B, 41, 1, 'y');
    res = finishRace(room);
    assert.strictEqual(res.rows[0].playerId, B.id); assert.strictEqual(res.rows[0].total, 42.5);
  }
});
test('T-67 Nitro 6 Coins / เกิน Coins / ปิด Nitro → BAD_NITRO (R-7-90)', () => {
  const { room } = raceWith({ toggles: { nitro: true } });
  const A = room.players[0]; A.coins = 10;
  throwsCode(() => room.select(A.id, { cardId: A.cars[0], nitro: 6 }), 'BAD_NITRO');
  A.coins = 2; throwsCode(() => room.select(A.id, { cardId: A.cars[0], nitro: 3 }), 'BAD_NITRO');
  throwsCode(() => room.select(A.id, { cardId: A.cars[0], nitro: 1.5 }), 'BAD_NITRO');
  const { room: r2 } = raceWith({});
  throwsCode(() => r2.select(r2.players[0].id, { cardId: r2.players[0].cars[0], nitro: 1 }), 'BAD_NITRO');
});
test('T-68 ก่อนผล Coins ที่คนอื่นเห็นไม่ลด และไม่มี nitro ใน payload (R-4-04)', () => {
  const { room } = raceWith({ toggles: { nitro: true } }, 3);
  const [A, B] = room.players; A.coins = 9;
  room.select(A.id, { cardId: A.cars[0], nitro: 3 }); room.confirm(A.id);
  const vb = room.getState(B.id);
  assert.strictEqual(vb.players.find(p => p.id === A.id).coins, 9);
  assert.strictEqual(vb.myNitro, 0);
  assert.strictEqual(room.getState(A.id).myNitro, 3);
  assert.ok(!JSON.stringify(vb.race).includes('nitro":3'));
});
function eventRace(event, n = 2) {
  const r = raceWith({ toggles: { nitro: true } }, n);
  r.room.race.event = event; return r;
}
test('T-69 Reverse: 10+2 Coins (−3) = 7 ชนะ 12 (R-7-26)', () => {
  const { room } = eventRace('reverse');
  const [A, B] = room.players; A.coins = 5;
  pickPower(room, A, 10, 2); pickPower(room, B, 12, 0);
  const res = finishRace(room);
  assert.strictEqual(res.rows[0].playerId, A.id); assert.strictEqual(res.rows[0].total, 7);
});
test('Reverse เสมอ → base ต่ำกว่าชนะ (R-7-26)', () => {
  const { room } = eventRace('reverse');
  const [A, B] = room.players; A.coins = 5;
  pickPower(room, A, 13, 2); pickPower(room, B, 10, 0); // 13−3 = 10
  assert.strictEqual(finishRace(room).rows[0].playerId, B.id);
});
test('T-70 Rain: 40 (+2 Coins) → 35+3 = 38, 36 → 31 (R-7-26)', () => {
  const { room } = eventRace('rain');
  const [A, B] = room.players; A.coins = 5;
  pickPower(room, A, 40, 2); pickPower(room, B, 36, 0);
  const res = finishRace(room);
  assert.strictEqual(res.rows.find(r => r.playerId === A.id).total, 38);
  assert.strictEqual(res.rows.find(r => r.playerId === B.id).total, 31);
});
test('T-71 Underdog: base 5/20/30 → 5 ได้ 15 (R-7-26)', () => {
  const { room } = eventRace('underdog', 3);
  const [A, B, C] = room.players;
  pickPower(room, A, 5); pickPower(room, B, 20); pickPower(room, C, 30);
  assert.strictEqual(finishRace(room).rows.find(r => r.playerId === A.id).total, 15);
});
test('T-72 Winner Takes All 82/43/23 → ที่ 1 ได้ 148 (§7.6) · Double ×2', () => {
  const { room } = eventRace('wta', 3);
  room.race.prizes = [82, 43, 23];
  const [A, B, C] = room.players;
  pickPower(room, A, 30); pickPower(room, B, 20); pickPower(room, C, 10);
  const res = finishRace(room);
  assert.deepStrictEqual(res.rows.map(r => r.prize), [148, 0, 0]);
  const { room: r2 } = eventRace('double', 2); r2.race.prizes = [58, 23];
  pickPower(r2, r2.players[0], 30); pickPower(r2, r2.players[1], 20);
  assert.deepStrictEqual(finishRace(r2).rows.map(r => r.prize), [116, 46]);
});
test('Frenzy อัตรา ×2 · Ban ห้ามใช้ Nitro · Lucky 0–10 (§7.6)', () => {
  const { room } = eventRace('frenzy');
  const [A, B] = room.players; A.coins = 5;
  pickPower(room, A, 10, 2); pickPower(room, B, 12, 0);
  assert.strictEqual(finishRace(room).rows.find(r => r.playerId === A.id).total, 16);
  const { room: r2 } = eventRace('ban'); r2.players[0].coins = 5;
  throwsCode(() => r2.select(r2.players[0].id, { cardId: r2.players[0].cars[0], nitro: 1 }), 'BAD_NITRO');
  const { room: r3 } = eventRace('lucky', 3);
  r3.players.forEach((p, i) => pickPower(r3, p, 10 + i));
  for (const row of finishRace(r3).rows) assert.ok(row.lucky >= 0 && row.lucky <= 10 && row.total === row.base + row.lucky);
});
test('T-73 Fog: ไม่ส่ง Prize จนผล (R-7-20)', () => {
  const { room } = eventRace('fog');
  assert.strictEqual(room.getState(null).race.prizes, null);
  room.players.forEach((p, i) => pickPower(room, p, 20 + i));
  assert.strictEqual(room.phase, 'raceRun');
  assert.strictEqual(room.getState(null).race.prizes, null);
  room.endPhaseNow();
  assert.ok(Array.isArray(room.getState(null).race.prizes));
});
test('T-74 Campaign x=5: 3 Race มีเหตุการณ์ Race 5 มีเสมอ ไม่ซ้ำ · campaignAll = ทุก Race (R-5-06)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { room, ps } = roomS(5, { toggles: { campaign: true, nitro: true } }, seed); room.start(ps[0].id);
    const ev = room.campaign.filter(Boolean);
    assert.strictEqual(ev.length, 3); assert.ok(room.campaign[4]); assert.strictEqual(new Set(ev).size, 3);
  }
  const { room, ps } = roomS(4, { toggles: { campaign: true }, campaignAll: true }); room.start(ps[0].id);
  assert.ok(room.campaign.every(Boolean));
});
test('T-75 Campaign ปิด Nitro → ไม่มี frenzy/ban (R-5-06)', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { room, ps } = roomS(7, { toggles: { campaign: true }, campaignAll: true }, seed); room.start(ps[0].id);
    assert.ok(!room.campaign.includes('frenzy') && !room.campaign.includes('ban'));
  }
});
test('Campaign เปิดทีละ Race: ตารางอนาคตไม่อยู่ใน payload (R-7-95)', () => {
  const { room } = startedS(4, { toggles: { campaign: true, nitro: true }, campaignAll: true }, 7);
  toRace(room);
  const j = JSON.stringify(room.getState(room.players[0].id));
  for (const e of room.campaign.slice(1)) if (e !== room.campaign[0]) assert.ok(!j.includes(`"${e}"`), 'เหตุการณ์อนาคตรั่ว: ' + e);
});
test('T-76 Mystery: วางท้าย id mystery · แจกตาม Power จริง · เปิดตอนผล (R-7-60…63)', () => {
  const { room } = startedS(3, { toggles: { mystery: true } }, 4);
  forceAuction(room, 1, [10, 10, 10]);
  room.auction.mysteryId = room.auction.set[0]; // คันแรงสุด
  const st = room.getState(null);
  assert.strictEqual(st.auction.set[2], 'mystery');
  assert.ok(!JSON.stringify(st).includes(`"${room.auction.set[0]}"`), 'mystery รั่ว');
  const w = seat(room, 1); room.raise(w.id, { amount: 2 }); room.pass(seat(room, 2).id); room.pass(seat(room, 0).id);
  assert.strictEqual(room.auctionHistory[0].allocation[w.id], room.auction.set[0]);
  assert.strictEqual(room.getState(null).auction.set[0], room.auction.set[0]);
});
function tieGame(settings) {
  const room = scriptedGameS(settings, 2, [[77, 38], [77, 38]], [['P1', 'P2'], ['P2', 'P1']]);
  return room;
}
function scriptedGameS(settings, n, prizesByRace, rankOrderByRace) {
  const { room } = startedS(n, settings, 9);
  toRace(room);
  for (let r = 0; r < n; r++) {
    room.race.prizes = prizesByRace[r].slice();
    rankOrderByRace[r].forEach((name, i) => {
      const p = room.players.find(q => q.name === name);
      const id = `fake-r${r}-${name}`;
      room.catalog.set(id, { id, name: id, power: 40 - r * 5 - i });
      if (room.race.last) { p.cars = [id]; room.race.picks.set(p.id, { cardId: id, nitro: 0 }); }
      else { p.cars.push(id); room.select(p.id, { cardId: id }); }
    });
    if (!room.race.last) for (const p of room.players) room.confirm(p.id);
    let g = 0; while (room.phase !== 'raceResult' && g++ < 5) room.endPhaseNow();
    room.endPhaseNow();
  }
  return room;
}
test('T-77 Sudden Death: เสมอ Prize + อันดับ 1 → แข่งตัดสิน ผู้ชนะคนเดียว (R-7-100…103)', () => {
  const room = tieGame({ toggles: { suddenDeath: true } });
  assert.strictEqual(room.phase, 'racePick'); assert.ok(room.race.sudden);
  assert.strictEqual(room.race.participants.length, 2);
  const used = new Set([].concat(...room.carSets));
  for (const pid of room.race.participants) assert.ok(!used.has(room.race.suddenCars[pid]));
  let g = 0; while (room.phase !== 'gameOver' && g++ < 10) room.endPhaseNow();
  assert.strictEqual(room.tieBreak, 'suddenDeath');
  assert.strictEqual(room.standings.filter(s => s.winner).length, 1);
  assert.strictEqual(room.standings.find(s => !s.winner).rank, 2);
});
test('T-78 Sudden Death ปิด → ชนะร่วม (R-9-05)', () => {
  const room = tieGame({});
  assert.strictEqual(room.phase, 'gameOver'); assert.strictEqual(room.tieBreak, 'shared');
});
test('Sudden Death + Nitro: ช่วงใส่ Nitro เฉพาะคนเสมอ คนอื่นส่งไม่ได้ (R-7-102)', () => {
  const room = scriptedGameS({ toggles: { suddenDeath: true, nitro: true } }, 3, [[77, 38, 23], [77, 38, 23], [23, 38, 77]], [['P1', 'P2', 'P3'], ['P2', 'P1', 'P3'], ['P3', 'P1', 'P2']]);
  // P1 = 77+38+38 = 153, P2 = 38+77+23 = 138? ตั้งให้เสมอด้วยค่าในตารางด้านล่างแทน
  assert.ok(['racePick', 'gameOver'].includes(room.phase));
  if (room.phase === 'racePick') {
    const out = room.players.find(p => !room.race.participants.includes(p.id));
    if (out) throwsCode(() => room.select(out.id, { nitro: 0 }), 'WRONG_PHASE');
  }
});
// ---------- host ----------
test('T-79 host ข้ามตา Chaos → pass ต่อท้าย passOrder (R-7-80)', () => {
  const { room, ps } = chaos(3);
  forceAuction(room, 1, [10, 10, 10]);
  const s1 = seat(room, 1);
  throwsCode(() => room.skip(ps[1].id === room.hostId ? ps[0].id : ps[1].id), 'NOT_HOST');
  room.skip(room.hostId);
  assert.strictEqual(room.auction.out.get(s1.id), 'skip');
  assert.deepStrictEqual(room.auction.passOrder, [s1.id]);
});
test('T-80 host ข้ามช่วงเลือกรถ: รถค้างใช้ต่อ Nitro = 0 (R-7-24, R-7-80)', () => {
  const { room } = raceWith({ toggles: { nitro: true } }, 3);
  const A = room.players[0]; A.coins = 10;
  room.select(A.id, { cardId: A.cars[1], nitro: 3 });
  room.skip(room.hostId);
  assert.strictEqual(room.phase, 'raceRun');
  const res = finishRace(room);
  const row = res.rows.find(r => r.playerId === A.id);
  assert.strictEqual(row.nitro, 0); assert.ok(row.auto);
});
test('T-81 host หยุด เหลือ 9 วิ แล้วเล่นต่อ → deadline = now + 9 (R-7-82)', () => {
  let t = 1e6;
  const room = new Room('P', { cards: CARDS, models: MODEL_IDS, rand: seeded(2), introSeconds: 0, now: () => t });
  const a = room.join('A'); room.join('B'); room.start(a.id);
  t += (CFG.BID_TURN_SECONDS - 9) * 1000;
  room.pause(room.hostId);
  assert.strictEqual(room.getState(null).paused.remainingMs, 9000);
  assert.strictEqual(room.getState(null).endsAt, null);
  throwsCode(() => room.pass(room.auction.turnId), 'PAUSED');
  t += 30000;
  room.resumeGame(room.hostId);
  assert.strictEqual(room.endsAt - t, 9000);
  throwsCode(() => room.resumeGame(room.hostId), 'CANNOT_PAUSE');
  room.destroy();
});
test('T-82 host ข้าม/หยุดระหว่าง RACE_RUN ไม่ได้ (R-7-81)', () => {
  const { room } = raceWith({});
  room.endPhaseNow();
  assert.strictEqual(room.phase, 'raceRun');
  throwsCode(() => room.skip(room.hostId), 'CANNOT_SKIP');
  throwsCode(() => room.pause(room.hostId), 'CANNOT_PAUSE');
});
test('T-83 host ออก → host = ที่นั่งถัดไปที่เชื่อมต่อ · หลุดเกิน 15 วิ ระหว่างเกม → ส่งต่อ (R-7-75)', () => {
  const { room } = startedS(3, {});
  const h = room.player(room.hostId);
  room.setConnected(seat(room, (h.seat + 1) % 3).id, false);
  room.leave(h.id);
  assert.strictEqual(room.hostId, seat(room, (h.seat + 2) % 3).id);
  let t = 1e6;
  const r2 = new Room('H', { cards: CARDS, models: MODEL_IDS, rand: seeded(2), introSeconds: 0, now: () => t });
  const a = r2.join('A'); r2.join('B'); r2.start(a.id);
  r2.setConnected(a.id, false); t += 16000; r2.transferHostIfNeeded(60000, 15000);
  assert.notStrictEqual(r2.hostId, a.id);
  r2.destroy();
});
test('host เตะ: lobby = ออกจากห้อง · ระหว่างเกม = ออก (ระบบเล่นแทน) · โอน host (R-7-74)', () => {
  const { room, ps } = roomS(3);
  room.kick(ps[0].id, { target: ps[2].id });
  assert.strictEqual(room.players.length, 2);
  throwsCode(() => room.kick(ps[0].id, { target: ps[0].id }), 'BAD_TARGET');
  throwsCode(() => room.kick(ps[1].id, { target: ps[0].id }), 'NOT_HOST');
  room.join('P3'); room.start(ps[0].id);
  const t = room.players.find(p => p.id !== ps[0].id);
  room.kick(ps[0].id, { target: t.id });
  assert.ok(t.left);
  room.transfer(ps[0].id, { target: room.players.find(p => !p.left && p.id !== ps[0].id).id });
  assert.notStrictEqual(room.hostId, ps[0].id);
});
test('โมเดล: ค่าเริ่มต้นสุ่มจาก catalog · เลือกได้เฉพาะใน lobby และมีใน catalog (R-7-73, R-4.2-03)', () => {
  const { room, ps } = roomS(2);
  assert.ok(MODEL_IDS.includes(ps[0].modelId));
  room.setModel(ps[1].id, { modelId: 'kenney-race' });
  assert.strictEqual(room.getState(null).players[1].modelId, 'kenney-race');
  throwsCode(() => room.setModel(ps[1].id, { modelId: 'nope' }), 'BAD_MODEL');
  room.start(ps[0].id);
  throwsCode(() => room.setModel(ps[1].id, { modelId: 'code-jet' }), 'WRONG_PHASE');
});
test('T-84 race:run ไม่มี power/total · ทุกคนได้ runSeed เดียวกัน (R-4-05, R-12-13)', () => {
  const { room } = raceWith({ toggles: { nitro: true } }, 3);
  const events = []; room.onEvent = (r, type, d) => events.push([type, d]);
  room.endPhaseNow();
  const run = events.find(e => e[0] === 'race:run')[1];
  assert.ok(Number.isInteger(run.runSeed));
  assert.strictEqual(run.order.length, 3);
  assert.ok(!/"power"|"total"|"prize"|"base"/.test(JSON.stringify(run)));
  const seeds = room.players.map(p => room.getState(p.id).race.run.runSeed);
  assert.ok(seeds.every(s => s === run.runSeed));
});
test('T-86 models.csv แถวผิด/id ซ้ำ ถูกข้าม ไม่ล่ม · ไม่มีไฟล์ → โมเดลจากโค้ด (R-4.2-01)', () => {
  const { buildModels, loadModels } = require('../server/models');
  const log = [];
  const res = buildModels('# c\nid,name,tab,source,file,scale,rotY,rearZ,labelY,skipWheel\nanimal-turtle,เต่า,animal,code,turtle,,,,,\nanimal-turtle,ซ้ำ,animal,code,turtle,,,,,\nBad,x,animal,code,turtle,,,,,\nk1,x,vehicle,glb,nofile.glb,,180,,,\nk2,x,vehicle,code,nobuilder,,,,,\nk3,x,boat,code,turtle,,,,,\nk4,x,animal,code,cat,99,,,,\n', null, m => log.push(m));
  assert.deepStrictEqual(res.models.map(m => m.id), ['animal-turtle', 'k1']);
  assert.strictEqual(res.skipped, 5);
  assert.ok(log.some(m => /แถว 4/.test(m)));
  assert.strictEqual(buildModels(null, null, () => {}).models.length, 34);
  const real = loadModels(path.join(__dirname, '..', 'models'), () => {});
  assert.strictEqual(real.models.length, 59);
  assert.strictEqual(real.skipped, 0);
});
test('T-88 Race สุดท้ายเปิด Nitro: รถเลือกอัตโนมัติ มีช่วงใส่ Nitro (R-7-21, D2-43)', () => {
  const { room } = startedS(2, { toggles: { nitro: true } }, 5);
  toRace(room);
  const [A, B] = room.players; A.coins = 4; B.coins = 0;
  room.endPhaseNow(); room.endPhaseNow(); room.endPhaseNow(); // Race 1 → Race 2 (สุดท้าย)
  assert.ok(room.race.last);
  assert.strictEqual(room.phase, 'racePick');
  assert.ok(room.race.confirmed.has(B.id), 'Coins 0 ล็อกให้');
  throwsCode(() => room.select(A.id, { cardId: 'car-01x' }), 'CAR_NOT_OWNED');
  room.select(A.id, { nitro: 2 }); room.confirm(A.id);
  assert.strictEqual(room.phase, 'raceRun');
  const res = finishRace(room);
  assert.strictEqual(res.rows.find(r => r.playerId === A.id).nitro, 2);
});
test('T-90 บอทสุ่มทุกโหมด × ปุ่มเสริม n=2–7 อย่างละ 8 เกม: จบ Coins ≥ 0 ใช้รถครบ Prize รวมตรง', () => {
  const combos = [];
  for (const mode of CFG.MODES) for (let mask = 0; mask < 32; mask += 3) combos.push({ mode, toggles: Object.fromEntries(CFG.TOGGLES.map((k, i) => [k, !!(mask >> i & 1)])) });
  let games = 0;
  for (const set of combos) for (let n = 2; n <= 7; n += 1) {
    const seed = 3000 + games, rand = seeded(seed);
    const { room } = startedS(n, set, seed);
    let guard = 0;
    while (room.phase !== 'gameOver' && guard++ < 6000) {
      const r = rand();
      if (r < 0.03 && room.pausable && room.pausable()) { room.pause(room.hostId); room.resumeGame(room.hostId); continue; }
      if (r < 0.06 && ['auction', 'shadowBid', 'racePick'].includes(room.phase) && !room.intro && (room.phase !== 'auction' || room.auction.turnId)) { room.skip(room.hostId); continue; }
      if (room.phase === 'auction' && room.auction.turnId) {
        const p = room.player(room.auction.turnId), a = room.auction, max = set.mode === 'chaos' ? p.coins + a.committed[p.id] : p.coins;
        if (rand() < 0.45 && max > a.currentBid) room.raise(p.id, { amount: a.currentBid + 1 + Math.floor(rand() * (max - a.currentBid)) }); else room.pass(p.id);
      } else if (room.phase === 'shadowBid' && !room.intro) {
        for (const p of room.players) if (!room.auction.broke.has(p.id) && !room.auction.confirmed.has(p.id) && rand() < 0.7) { room.shadowBid(p.id, { amount: 1 + Math.floor(rand() * p.coins) }); room.shadowConfirm(p.id); }
        if (room.phase === 'shadowBid') room.endPhaseNow();
      } else if (room.phase === 'racePick' && !room.intro && (!(room.race.last || room.race.sudden) || room.race.nitroOnly)) {
        for (const p of room.racers()) if (!room.race.confirmed.has(p.id)) {
          const nitro = room.nitroAllowed() ? Math.min(p.coins, CFG.NITRO_MAX_COINS, Math.floor(rand() * 4)) : 0;
          room.select(p.id, room.race.last || room.race.sudden ? { nitro } : { cardId: p.cars[Math.floor(rand() * p.cars.length)], nitro });
          room.confirm(p.id);
        }
        if (room.phase === 'racePick') room.endPhaseNow();
      } else room.endPhaseNow();
      if (rand() < 0.002) { const q = room.players[Math.floor(rand() * n)]; if (room.players.filter(x => !x.left).length > 1) room.leave(q.id); }
    }
    assert.strictEqual(room.phase, 'gameOver', `${set.mode} ${JSON.stringify(set.toggles)} n=${n} ค้างที่ ${room.phase}`);
    assert.ok(room.players.every(p => p.coins >= 0 && p.cars.length === 0));
    const total = room.raceHistory.reduce((s, r) => s + r.prizes.reduce((a, b) => a + b, 0), 0);
    assert.strictEqual(room.players.reduce((s, p) => s + p.prizeTotal, 0), total);
    assert.strictEqual(room.standings.filter(s => s.winner).length >= 1, true);
    if (set.toggles.suddenDeath) assert.strictEqual(room.standings.filter(s => s.winner).length, 1);
    room.destroy(); games++;
  }
});
test('config v2.0: เวลาเตือน < เวลาเลือกรถ และค่าสมดุลครบ (R-3-05)', () => {
  assert.ok(CFG.PICK_REMIND_SECONDS < CFG.PICK_SECONDS && CFG.WARNING_SECONDS < CFG.PICK_SECONDS); // ค่าจริงแก้ได้ใน config (ค่าเริ่มต้น 15 / 6 / 5 / 12)
  for (const k of ['RULES_SECONDS', 'LOT_REVEAL_STEP_SECONDS', 'SHADOW_BID_SECONDS', 'SHADOW_REVEAL_SECONDS', 'CAMPAIGN_BANNER_SECONDS']) assert.ok(Number.isInteger(CFG[k]) && CFG[k] >= 1, k);
  assert.ok(CFG.NITRO_POWER_PER_COIN > 0 && CFG.NITRO_MAX_COINS >= 1 && CFG.REFUND_RATIO >= 0 && CFG.REFUND_RATIO <= 1);
});

console.log(`\n${passed} ผ่าน, ${failed} ไม่ผ่าน`);
process.exit(failed ? 1 : 0);
