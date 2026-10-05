// บิดไปสมาชิก (Bid Now, Race Later) — Express + Socket.IO
'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Room, GameError } = require('./game');
const { loadCards } = require('./server/cards');
const CFG = require('./shared/config');

const PORT = Number(process.env.PORT) || 3000;
const CARDS_DIR = path.join(__dirname, 'cards');

process.on('uncaughtException', e => console.error('uncaughtException:', e && e.stack || e));
process.on('unhandledRejection', e => console.error('unhandledRejection:', e && e.stack || e));

// ---------- การ์ด (อ่านครั้งเดียวตอนเริ่ม) ----------
const CARDS = loadCards(CARDS_DIR);
console.log(`cards: ${CARDS.cards.length} คัน (default ${CARDS.defaults}, ข้าม ${CARDS.skipped}), ภาพ ${CARDS.artFiles.length} ไฟล์, version ${CARDS.api.version}`);

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use('/cards', express.static(CARDS_DIR, { maxAge: '7d', fallthrough: true }));
app.get('/api/cards', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ ...CARDS.api, warnings: CARDS.warnings.length, defaults: CARDS.defaults });
});
app.get('/preview', (req, res) => res.sendFile(path.join(__dirname, 'public', 'preview.html')));
app.get('/healthz', (req, res) => res.type('text').send('ok'));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });

// ---------- ห้อง ----------
const rooms = new Map();        // code -> Room
const sockRoom = new Map();     // socket.id -> { code, pid|null (ผู้ชม) }
const roomSockets = new Map();  // code -> Set(socket.id)
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // A–Z ไม่มี I, O (R-12-09)

function newCode() {
  for (let t = 0; t < 1000; t++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[crypto.randomInt(LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new GameError('ROOM_FULL', 'สร้างห้องไม่ได้ ลองใหม่');
}

const pending = new Set();
function scheduleBroadcast(room) {
  if (pending.has(room.code)) return;
  pending.add(room.code);
  setImmediate(() => {
    pending.delete(room.code);
    try {
      if (!rooms.has(room.code)) return;
      for (const sid of roomSockets.get(room.code) || []) {
        const s = io.sockets.sockets.get(sid); const info = sockRoom.get(sid);
        if (s && info) s.emit('state', room.getState(info.pid));
      }
    } catch (e) { console.error('broadcast error', e); }
  });
}

function makeRoom() {
  const code = newCode();
  const room = new Room(code, {
    cards: CARDS.cards,
    onChange: r => scheduleBroadcast(r),
    // event สาธารณะเท่านั้น (หัวข้อ 11)
    onEvent: (r, type, data) => io.to('room:' + r.code).emit(type, data),
    log: m => console.log(m)
  });
  room.emptySince = null;
  rooms.set(code, room); roomSockets.set(code, new Set());
  return room;
}

function connectedCount(room) { return (roomSockets.get(room.code) || new Set()).size; }
function updateSpectators(room) {
  let n = 0;
  for (const sid of roomSockets.get(room.code) || []) { const i = sockRoom.get(sid); if (i && !i.pid) n++; }
  room.spectators = n;
}

function attach(socket, room, pid) {
  detach(socket);
  sockRoom.set(socket.id, { code: room.code, pid });
  roomSockets.get(room.code).add(socket.id);
  socket.join('room:' + room.code);
  room.emptySince = null;
  if (pid) room.setConnected(pid, true);
  updateSpectators(room);
  scheduleBroadcast(room);
}
function detach(socket) {
  const info = sockRoom.get(socket.id);
  if (!info) return;
  sockRoom.delete(socket.id);
  const set = roomSockets.get(info.code); if (set) set.delete(socket.id);
  socket.leave('room:' + info.code);
  const room = rooms.get(info.code);
  if (!room) return;
  if (info.pid) {
    const still = [...(set || [])].some(sid => (sockRoom.get(sid) || {}).pid === info.pid);
    if (!still) room.setConnected(info.pid, false);
  }
  updateSpectators(room);
  if (connectedCount(room) === 0) room.emptySince = Date.now();
  scheduleBroadcast(room);
}

function safe(ack, fn) {
  const reply = typeof ack === 'function' ? ack : () => {};
  try { const r = fn(); reply({ ok: true, ...(r || {}) }); }
  catch (e) {
    if (e instanceof GameError) reply({ ok: false, code: e.code, error: e.message });
    else { console.error(e && e.stack || e); reply({ ok: false, code: 'SERVER', error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }); }
  }
}
const str = v => (typeof v === 'string' ? v : '');
const getRoom = code => {
  const r = rooms.get(str(code).toUpperCase().trim());
  if (!r) throw new GameError('ROOM_NOT_FOUND', 'ไม่พบห้องนี้');
  return r;
};

io.on('connection', socket => {
  socket.on('create', (d, ack) => safe(ack, () => {
    const room = makeRoom();
    try {
      const p = room.join(str(d && d.name));
      attach(socket, room, p.id);
      return { code: room.code, playerId: p.id, token: p.token };
    } catch (e) { room.destroy(); rooms.delete(room.code); roomSockets.delete(room.code); throw e; }
  }));

  // ปุ่ม "เข้าร่วม" ปุ่มเดียว (L6): ห้องยังไม่เริ่มและไม่เต็ม = ผู้เล่น, เกมเริ่มแล้วหรือห้องเต็ม = ผู้ชมอัตโนมัติ
  socket.on('join', (d, ack) => safe(ack, () => {
    const room = getRoom(d && d.code);
    let p;
    try { p = room.join(str(d && d.name)); }
    catch (e) {
      if (!(e instanceof GameError) || !['GAME_STARTED', 'ROOM_FULL'].includes(e.code)) throw e;
      updateSpectators(room);
      if (room.spectators >= CFG.SPECTATORS_MAX) throw new GameError('ROOM_FULL', 'ห้องนี้ผู้ชมเต็มแล้ว');
      attach(socket, room, null);
      return { code: room.code, spectator: true, reason: e.code };
    }
    attach(socket, room, p.id);
    return { code: room.code, playerId: p.id, token: p.token };
  }));

  socket.on('resume', (d, ack) => safe(ack, () => {
    const room = getRoom(d && d.code);
    const p = room.resume(str(d && d.playerId), str(d && d.token));
    if (!p) throw new GameError('UNKNOWN_PLAYER', 'ไม่พบที่นั่งเดิม');
    attach(socket, room, p.id);
    return { code: room.code, playerId: p.id };
  }));

  socket.on('spectate', (d, ack) => safe(ack, () => { // R-12-10
    const room = getRoom(d && d.code);
    updateSpectators(room);
    if (room.spectators >= CFG.SPECTATORS_MAX) throw new GameError('ROOM_FULL', 'ผู้ชมเต็มแล้ว');
    attach(socket, room, null);
    return { code: room.code };
  }));

  socket.on('leave', (d, ack) => safe(ack, () => {
    const info = sockRoom.get(socket.id);
    if (!info) return {};
    const room = rooms.get(info.code);
    if (room && info.pid) {
      const wasLobby = room.phase === 'lobby';
      room.leave(info.pid);
      // หลังเริ่มเกม ผู้เล่นที่ออกดูต่อในฐานะผู้ชมได้ (R-12-06) — ฝั่ง client ลบ session เอง
      if (wasLobby) { detach(socket); return {}; }
    }
    detach(socket);
    return {};
  }));

  socket.on('action', (d, ack) => safe(ack, () => {
    const info = sockRoom.get(socket.id);
    if (!info) throw new GameError('ROOM_NOT_FOUND', 'ยังไม่ได้อยู่ในห้อง');
    if (!info.pid) throw new GameError('SPECTATOR_ONLY', 'ผู้ชมทำแบบนี้ไม่ได้');
    const room = rooms.get(info.code);
    if (!room) throw new GameError('ROOM_NOT_FOUND', 'ไม่พบห้องนี้');
    room.action(info.pid, d);
    return {};
  }));

  socket.on('disconnect', () => { try { detach(socket); } catch (e) { console.error(e); } });
});

// ---------- งานเบื้องหลังทุก 5 วินาที ----------
setInterval(() => {
  try {
    const now = Date.now();
    for (const room of rooms.values()) {
      room.transferHostIfNeeded(60000);
      if (room.phase === 'lobby') { // ลบคนที่หลุดใน lobby เกิน 2 นาที
        for (const p of room.players.slice()) if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > 120000) room.leave(p.id);
      }
      const done = ['gameOver', 'cancelled'].includes(room.phase);
      const idleLimit = done ? 5 * 60000 : 30 * 60000;
      if (connectedCount(room) === 0 && room.emptySince && now - room.emptySince > idleLimit) {
        room.destroy(); rooms.delete(room.code); roomSockets.delete(room.code);
        console.log(`[room ${room.code}] ลบห้องที่ไม่มีคนเชื่อมต่อ`);
      }
    }
  } catch (e) { console.error('sweep error', e); }
}, 5000).unref();

server.listen(PORT, () => console.log(`บิดไปสมาชิก พร้อมที่พอร์ต ${PORT}`));

module.exports = { app, server, io, rooms };
