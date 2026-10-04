// อ่านไฟล์การ์ดครั้งเดียวตอนเริ่ม — spec v2 หัวข้อ 4.1 (R-4.1-01 … R-4.1-12)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SCHEMA = require('../shared/card-schema');
const CFG = require('../shared/config');

// R-4.1-02 RFC 4180, BOM, CRLF, แถวว่าง
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

const defaultCar = power => ({ id: `car-default-${power}`, name: `Car ${power}`, power, isDefault: true });

// คืน { cards (เรียง power น้อย→มาก ครบ 50 คันเสมอ), warnings[], skipped, defaults }
function buildCatalog(csvText, log = () => {}) {
  const warnings = [];
  const warn = m => { warnings.push(m); log(m); };
  const byPower = new Map();
  const seenIds = new Set();
  let skipped = 0;
  if (csvText == null) {
    warn('cards: ไม่พบ data.csv — ใช้รถ default ทั้งหมด');
  } else {
    const rows = parseCSV(csvText);
    if (!rows.length) warn('cards: data.csv ว่าง');
    const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
    const col = name => head.indexOf(name);
    for (const need of Object.keys(SCHEMA.columns)) {
      if (col(need) < 0) warn(`cards: data.csv ไม่มีคอลัมน์ "${need}"`);
    }
    rows.forEach((r, i) => {
      const line = i + 2; // แถวข้อมูลแรก = แถว 2
      const get = n => (col(n) >= 0 ? String(r[col(n)] ?? '').trim() : '');
      const id = get('id');
      const powerRaw = get('power');
      let name = get('name');
      // R-4.1-01, R-4.1-08
      if (!SCHEMA.idPattern.test(id)) { warn(`cards: แถว ${line} id "${id}" ผิดรูปแบบ — ข้าม`); skipped++; return; }
      if (!/^\d+$/.test(powerRaw)) { warn(`cards: แถว ${line} power "${powerRaw}" ไม่ใช่จำนวนเต็ม — ข้าม`); skipped++; return; }
      const power = Number(powerRaw);
      if (power < CFG.POWER_MIN || power > CFG.POWER_MAX) { warn(`cards: แถว ${line} power ${power} นอกช่วง ${CFG.POWER_MIN}–${CFG.POWER_MAX} — ข้าม`); skipped++; return; }
      if (seenIds.has(id)) { warn(`cards: แถว ${line} id "${id}" ซ้ำ — ใช้แถวแรก`); skipped++; return; }
      if (byPower.has(power)) { warn(`cards: แถว ${line} power ${power} ซ้ำ — ใช้แถวแรก`); skipped++; return; }
      if (!name) { name = `Car ${power}`; warn(`cards: แถว ${line} ไม่มีชื่อ — ใช้ "${name}"`); }
      if ([...name].length > SCHEMA.columns.name.max) warn(`cards: แถว ${line} ชื่อยาวเกิน ${SCHEMA.columns.name.max} ตัวอักษร (อาจล้นการ์ด)`);
      seenIds.add(id);
      byPower.set(power, { id, name, power });
    });
  }
  // R-4.1-09 เติมรถ default ให้ครบทุก Power
  let defaults = 0;
  for (let p = CFG.POWER_MIN; p <= CFG.POWER_MAX; p++) {
    if (!byPower.has(p)) {
      let car = defaultCar(p);
      if (seenIds.has(car.id)) car = { ...car, id: `${car.id}-x` };
      byPower.set(p, car); defaults++;
    }
  }
  if (defaults) warn(`cards: เติมรถ default ${defaults} คัน`);
  const cards = [...byPower.values()].sort((a, b) => a.power - b.power);
  return { cards, warnings, skipped, defaults };
}

function readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
}

function loadCards(dir, log = m => console.error(m)) {
  const csv = readMaybe(path.join(dir, 'data.csv'));
  const cat = buildCatalog(csv, log);
  // R-4.1-07 ไม่มี template.json ใช้พิกัดสำรองใน public/card.js (client ตรวจ templates.main == null)
  let main = null;
  const tplText = readMaybe(path.join(dir, 'template.json'));
  if (tplText) {
    try { main = JSON.parse(tplText); } catch (e) { log('cards: template.json อ่านไม่ได้ — ใช้พิกัดสำรอง'); }
  } else log('cards: ไม่พบ template.json — ใช้พิกัดสำรอง');
  // version = hash ของ template + data.csv + รายชื่อและขนาดไฟล์ภาพ (R-4.1-12)
  const h = crypto.createHash('sha1');
  h.update(tplText || ''); h.update(csv || '');
  for (const f of ['frame.png', 'back.png']) {
    try { h.update(f + fs.statSync(path.join(dir, f)).size); } catch (e) { /* ไม่มีไฟล์ */ }
  }
  const art = [];
  try {
    for (const f of fs.readdirSync(path.join(dir, 'art')).sort()) {
      const st = fs.statSync(path.join(dir, 'art', f));
      h.update(f + st.size); art.push(f);
    }
  } catch (e) { /* ยังไม่มีโฟลเดอร์ art */ }
  const version = h.digest('hex').slice(0, 10);
  const publicCards = cat.cards.map(c => {
    const o = { id: c.id, name: c.name, power: c.power };
    for (const s of SCHEMA.secret) delete o[s];
    return o;
  });
  return {
    cards: cat.cards.map(c => ({ id: c.id, name: c.name, power: c.power })),
    api: { version, templates: { main }, cards: publicCards },
    warnings: cat.warnings,
    defaults: cat.defaults,
    skipped: cat.skipped,
    artFiles: art
  };
}

module.exports = { parseCSV, buildCatalog, loadCards };
