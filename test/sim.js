// จำลองกติกา — อ้าง test scenario T-xx และรหัสกติกา R-x-y จาก spec v2
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
  room.endPhaseNow();
  const row = room.raceHistory[0].rows.find(r => r.playerId === A.id);
  assert.strictEqual(row.cardId, pick); assert.ok(row.auto);
});
test('T-16 ไม่เลือกอะไร → สุ่มจากรถที่ยังไม่ใช้ (R-7-24)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  const B = room.players[1], had = B.cars.slice();
  room.endPhaseNow();
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
      else room.race.picks.set(p.id, id);
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
  assert.deepStrictEqual(st.intro.steps.map(s => s.kind + s.no), ['phase1', 'auction1']);
  assert.strictEqual(st.intro.steps[1].endsAt - st.intro.steps[0].endsAt, CFG.INTRO_SECONDS * 1000);
  assert.strictEqual(st.endsAt, st.intro.steps[1].endsAt);
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
  assert.deepStrictEqual(room.intro.steps.map(s => s.kind + s.no), ['auction2']);
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
test('T-38 RACE START: ผลอยู่ใน state ตั้งแต่เริ่มวิ่ง มี runAt, เลือกรถไม่ได้ แล้วไปแท่นรับรางวัล (v3)', () => {
  const { room } = started(3);
  passAllAuctions(room);
  room.endPhaseNow(); // หมดเวลา → สุ่มรถ → RACE START
  const st = room.getState(null);
  assert.strictEqual(st.phase, 'raceRun');
  assert.ok(Math.abs(st.race.runAt - room.now()) < 1000);
  assert.strictEqual(st.raceHistory.length, 1);
  assert.strictEqual(st.raceHistory[0].rows.length, 3);
  const A = room.players[0];
  throwsCode(() => room.select(A.id, { cardId: A.cars[0] }), 'WRONG_PHASE');
  room.endPhaseNow();
  assert.strictEqual(room.getState(null).phase, 'raceResult');
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

console.log(`\n${passed} ผ่าน, ${failed} ไม่ผ่าน`);
process.exit(failed ? 1 : 0);
