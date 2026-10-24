// อ่าน models/models.csv ครั้งเดียวตอนเริ่ม — spec v2.0 หัวข้อ 4.2 (R-4.2-01 … R-4.2-05)
// โมเดลแสดงผลอย่างเดียว ไม่กระทบกติกา · ไฟล์หาย/ผิด → เซิร์ฟเวอร์ไม่ล่ม ใช้โมเดลที่สร้างจากโค้ด
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseCSV } = require('./cards');

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
// โมเดลที่สร้างจากโค้ด (มีตัวสร้างใน public/models-code.js) — ใช้เมื่อไม่มี models.csv
const BUILTIN = [
  ['animal', 'turtle', 'เต่า'], ['animal', 'snail', 'หอยทาก'], ['animal', 'crab', 'ปู'], ['animal', 'kraken', 'คราเคน'],
  ['animal', 'cow', 'วัว / ควาย'], ['animal', 'pig', 'หมูมีปีก'], ['animal', 'fox', 'จิ้งจอก 9 หาง'], ['animal', 'rabbit', 'กระต่าย'],
  ['animal', 'frog', 'กบ'], ['animal', 'goose', 'ห่าน'], ['animal', 'mammoth', 'แมมมอธ'], ['animal', 'shark', 'ฉลาม'],
  ['animal', 'dog', 'หมา'], ['animal', 'cat', 'แมว'], ['animal', 'panda', 'แพนด้า'], ['animal', 'penguin', 'เพนกวิน'],
  ['animal', 'elephant', 'ช้าง'], ['animal', 'giraffe', 'ยีราฟ'], ['animal', 'trex', 'ไดโนเสาร์'], ['animal', 'dragon', 'มังกร'],
  ['animal', 'bee', 'ผึ้ง'], ['animal', 'ladybug', 'เต่าทอง'], ['animal', 'lion', 'สิงโต'], ['animal', 'hippo', 'ฮิปโป'],
  ['animal', 'croc', 'จระเข้'], ['animal', 'duck', 'เป็ด'], ['animal', 'owl', 'นกฮูก'], ['animal', 'unicorn', 'ยูนิคอร์น'],
  ['vehicle', 'sport', 'Sport'], ['vehicle', 'muscle', 'Muscle'], ['vehicle', 'formula', 'Formula'],
  ['vehicle', 'buggy', 'Buggy'], ['vehicle', 'truck', 'Truck'], ['vehicle', 'jet', 'Jet']
].map(([tab, file, name]) => ({ id: (tab === 'animal' ? 'animal-' : 'code-') + file, name, tab, source: 'code', file,
  scale: null, rotY: 0, rearZ: null, labelY: null, skipWheel: [] }));
const CODE_FILES = new Set(BUILTIN.map(m => m.file));

const num = (v, min, max) => { if (v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : undefined; };

function buildModels(csvText, dir, log = () => {}) {
  const warnings = []; const warn = m => { warnings.push(m); log(m); };
  if (csvText == null) { warn('models: ไม่พบ models.csv — ใช้เฉพาะโมเดลที่สร้างจากโค้ด'); return { models: BUILTIN.slice(), warnings, skipped: 0 }; }
  const lines = csvText.replace(/^﻿/, '').split(/\r?\n/);
  const firstData = lines.findIndex(l => l.trim() && !l.trim().startsWith('#'));
  const rows = parseCSV(lines.filter(l => !l.trim().startsWith('#')).join('\n'));
  const head = (rows.shift() || []).map(h => h.trim());
  const col = n => head.indexOf(n);
  const out = []; const seen = new Set(); let skipped = 0;
  rows.forEach((r, i) => {
    const line = firstData + i + 2;
    const g = n => (col(n) >= 0 ? String(r[col(n)] ?? '').trim() : '');
    const id = g('id'), tab = g('tab'), source = g('source'), file = g('file');
    const bad = m => { warn(`models: แถว ${line} ${m} — ข้าม`); skipped++; };
    if (!ID.test(id)) return bad(`id "${id}" ผิดรูปแบบ`);
    if (seen.has(id)) return bad(`id "${id}" ซ้ำ`);
    if (!['animal', 'vehicle'].includes(tab)) return bad(`tab "${tab}" ต้องเป็น animal หรือ vehicle`);
    if (!['code', 'glb'].includes(source)) return bad(`source "${source}" ต้องเป็น code หรือ glb`);
    if (source === 'code' && !CODE_FILES.has(file)) return bad(`ไม่มีตัวสร้างโมเดล "${file}"`);
    if (source === 'glb') {
      if (!/^[a-z0-9][a-z0-9._-]*\.glb$/i.test(file)) return bad(`ชื่อไฟล์ "${file}" ต้องลงท้าย .glb`);
      if (dir && !fs.existsSync(path.join(dir, 'kenney', file))) return bad(`ไม่พบไฟล์ models/kenney/${file}`);
    }
    const scale = num(g('scale'), 0.1, 10), rotY = num(g('rotY'), -360, 360), rearZ = num(g('rearZ'), -20, 20), labelY = num(g('labelY'), 0, 20);
    if ([scale, rotY, rearZ, labelY].includes(undefined)) return bad('ค่าตัวเลขผิดช่วง');
    let name = g('name') || id; if ([...name].length > 24) name = [...name].slice(0, 24).join('');
    seen.add(id);
    out.push({ id, name, tab, source, file, scale, rotY: rotY || 0, rearZ, labelY, skipWheel: g('skipWheel') ? g('skipWheel').split(';').map(s => s.trim()).filter(Boolean) : [] });
  });
  if (!out.length) { warn('models: ไม่มีแถวที่ใช้ได้ — ใช้โมเดลที่สร้างจากโค้ด'); return { models: BUILTIN.slice(), warnings, skipped }; }
  return { models: out, warnings, skipped };
}

function loadModels(dir, log = console.warn) {
  let text = null;
  try { text = fs.readFileSync(path.join(dir, 'models.csv'), 'utf8'); } catch (e) { text = null; }
  const res = buildModels(text, dir, log);
  const hasTexture = fs.existsSync(path.join(dir, 'kenney', 'Textures', 'colormap.png'));
  if (res.models.some(m => m.source === 'glb') && !hasTexture) log('models: ไม่พบ models/kenney/Textures/colormap.png — รถ .glb จะเป็นสีขาว');
  const version = crypto.createHash('sha1').update(text || '').update(String(hasTexture)).digest('hex').slice(0, 8);
  return { ...res, version, api: { version, models: res.models } };
}

module.exports = { loadModels, buildModels, BUILTIN };
