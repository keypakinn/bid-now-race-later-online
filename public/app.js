// หน้าเว็บ บิดไปสมาชิก — state เดียว S, render() สร้างหน้าใหม่จาก state ทุกครั้ง
(function () {
  'use strict';
  const CFG = window.BNRL_CONFIG;
  const KEY = 'bnrl-session';
  const socket = io();
  const S = {
    st: null, session: null, spectating: null, connected: false, everConnected: false,
    cards: new Map(), cardsReady: false, offset: 0, drafts: {}, confirmLeave: false
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
  const act = (type, extra) => send('action', { type, requestId: reqId(), ...(extra || {}) }, () => { busy = false; });
  let busy = false;
  const card = id => S.cards.get(id) || { id, name: id, power: 0 };
  const P = id => (S.st && S.st.players.find(p => p.id === id)) || { name: '?' };
  const roomFromUrl = () => { try { return (new URLSearchParams(location.search).get('room') || '').toUpperCase(); } catch (e) { return ''; } };

  // ---------- การ์ด ----------
  CardKit.load().then(d => { d.cards.forEach(c => S.cards.set(c.id, c)); S.cardsReady = true; render(); })
    .catch(() => { S.cardsReady = true; render(); });
  const cardEls = new Map(); // key = location:id → element (ย้าย element เดิม ไม่สร้างใหม่ทุกครั้ง)
  function cardBox(id, where, w, extra) {
    const c = card(id);
    return `<div class="cardbox w${w} ${extra && extra.cls || ''}"><div class="cslot" data-card="${esc(id)}" data-where="${esc(where)}"></div>` +
      `<div class="cap" title="${esc(c.name)} · ${esc(c.power)}"><b>${esc(c.power)}</b> ${esc(c.name)}</div>${extra && extra.after || ''}</div>`;
  }
  function placeCards() {
    document.querySelectorAll('.cslot[data-card]').forEach(slot => {
      const key = slot.dataset.where + ':' + slot.dataset.card;
      let el = cardEls.get(key);
      const fresh = !el;
      if (!el) { el = CardKit.render(card(slot.dataset.card)); cardEls.set(key, el); }
      slot.appendChild(el);
      if (!fresh && el.querySelector('[data-fit-pending]')) CardKit.fitAll(el);
    });
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
  socket.on('state', st => {
    S.st = st; S.offset = st.serverNow - Date.now();
    if (st.phase !== 'auction') delete S.drafts.bid;
    busy = false; render();
  });

  // ---------- ตัวจับคลิกตัวเดียว ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act, st = S.st;
    const name = () => ($('#in-name') ? $('#in-name').value : '').trim();
    const code = () => ($('#in-code') ? $('#in-code').value : '').trim().toUpperCase();
    switch (a) {
      case 'create':
        if (!name()) return toast('ใส่ชื่อก่อน');
        send('create', { name: name() }, res => { if (res.ok) { S.session = { code: res.code, playerId: res.playerId, token: res.token }; store.set(S.session); history.replaceState(null, '', '?room=' + res.code); } });
        break;
      case 'join':
        if (!name() || !code()) return toast('ใส่ชื่อและรหัสห้อง');
        send('join', { name: name(), code: code() }, res => {
          if (res.ok) { S.session = { code: res.code, playerId: res.playerId, token: res.token }; store.set(S.session); history.replaceState(null, '', '?room=' + res.code); }
          else if (res.code === 'GAME_STARTED' || res.code === 'ROOM_FULL') { S.offerSpectate = code(); render(); }
        });
        break;
      case 'spectate': {
        const c = code() || b.dataset.code;
        if (!c) return toast('ใส่รหัสห้อง');
        send('spectate', { code: c }, res => { if (res.ok) { S.spectating = res.code; S.offerSpectate = null; } });
        break;
      }
      case 'start': act('game:start'); break;
      case 'copy': {
        const url = location.origin + '/?room=' + st.code;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('คัดลอกลิงก์แล้ว'), () => toast(url));
        break;
      }
      case 'leave':
        if (!S.confirmLeave && st && st.phase !== 'lobby' && !['gameOver', 'cancelled'].includes(st.phase) && !st.myLeft && st.me) { S.confirmLeave = true; render(); return; }
        send('leave', {}, () => {
          const lobby = !st || st.phase === 'lobby' || ['gameOver', 'cancelled'].includes(st.phase) || !st.me;
          if (lobby) { store.clear(); S.session = null; S.spectating = null; S.st = null; history.replaceState(null, '', '/'); }
          S.confirmLeave = false; render();
        });
        break;
      case 'leave-cancel': S.confirmLeave = false; render(); break;
      case 'home': store.clear(); S.session = null; S.spectating = null; S.st = null; send('leave', {}); history.replaceState(null, '', '/'); render(); break;
      case 'bid-dec': case 'bid-inc': {
        const a2 = st.auction, me = P(st.me);
        let v = Number(S.drafts.bid || a2.minBid) + (a === 'bid-inc' ? 1 : -1);
        S.drafts.bid = Math.max(a2.minBid, Math.min(me.coins, v)); render(); break;
      }
      case 'raise': {
        if (busy) return;
        const v = Number($('#in-bid') ? $('#in-bid').value : S.drafts.bid);
        busy = true; act('auction:raise', { amount: Math.floor(v), auctionNo: st.auction.no, stateVersion: st.auction.seq }); break;
      }
      case 'pass': if (busy) return; busy = true; act('auction:pass', { auctionNo: st.auction.no, stateVersion: st.auction.seq }); break;
      case 'pick': act('race:select', { cardId: b.dataset.card, raceNo: st.race.no }); break;
      case 'confirm': if (busy) return; busy = true; act('race:confirm', { raceNo: st.race.no }); break;
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'in-bid') S.drafts.bid = e.target.value;
    if (e.target.id === 'in-name') S.drafts.name = e.target.value;
    if (e.target.id === 'in-code') S.drafts.code = e.target.value;
  });

  // ---------- เวลา (คำนวณจาก endsAt ของ server — R-10-02) ----------
  function remain() { return S.st && S.st.endsAt ? Math.max(0, Math.ceil((S.st.endsAt - (Date.now() + S.offset)) / 1000)) : null; }
  setInterval(() => {
    const r = remain();
    document.querySelectorAll('.js-timer').forEach(el => { el.textContent = r == null ? '' : r; el.classList.toggle('low', r != null && r <= 3); });
  }, 250);

  // ---------- views ----------
  function viewHome() {
    const code = S.drafts.code != null ? S.drafts.code : roomFromUrl();
    return `<h1>บิดไปสมาชิก<span class="en">BID NOW, RACE LATER</span></h1><div class="stripe"></div>
    <div class="panel stack">
      <label class="small muted" for="in-name">ชื่อของคุณ</label>
      <input id="in-name" maxlength="${CFG.NAME_MAX_CHARS}" autocomplete="nickname" value="${esc(S.drafts.name || '')}">
      ${code ? '' : `<button class="primary" data-act="create">สร้างห้องใหม่</button><div class="small muted" style="text-align:center">หรือเข้าห้องเพื่อน</div>`}
      <label class="small muted" for="in-code">รหัสห้อง</label>
      <input id="in-code" maxlength="4" autocapitalize="characters" value="${esc(code)}" style="text-transform:uppercase;letter-spacing:.2em">
      <button class="${code ? 'primary' : ''}" data-act="join">เข้าร่วมเป็นผู้เล่น</button>
      <button class="ghost" data-act="spectate">เข้าชม</button>
      ${S.offerSpectate ? `<div class="banner">เข้าเป็นผู้เล่นไม่ได้ — <button class="ghost" data-act="spectate" data-code="${esc(S.offerSpectate)}">ดูในฐานะผู้ชม</button></div>` : ''}
    </div>
    <div class="panel small muted">ประมูลรถด้วย Coins ที่มีจำกัด แล้วนำรถมาแข่งทีละคันเพื่อเก็บ Prize · ผู้เล่น 2–7 คน</div>`;
  }

  function viewLobby(st) {
    const isHost = st.me === st.hostId, n = st.players.length;
    const canStart = n >= CFG.PLAYERS_MIN && n <= CFG.PLAYERS_MAX;
    return `<div class="top"><div><span class="muted small">ห้อง</span> <span class="code">${esc(st.code)}</span></div><button class="ghost" data-act="copy">คัดลอกลิงก์</button></div>
    <div class="panel"><h2>ผู้เล่น ${n}/${CFG.PLAYERS_MAX}</h2>
      ${st.players.map(p => `<div class="row player ${p.id === st.me ? 'me' : ''}"><span class="pname grow">${esc(p.name)}</span>${p.id === st.hostId ? '<span class="chip hot">เจ้าของห้อง</span>' : ''}${p.connected ? '' : '<span class="chip bad">หลุด</span>'}</div>`).join('')}
      <div class="small muted" style="margin-top:8px">ผู้ชม ${st.spectators} คน · เล่น ${n || '?'} คน = ประมูล ${n} รอบ · แข่ง ${n} Race · เริ่มคนละ ${CFG.STARTING_COINS[n] || '-'} Coins</div>
    </div>
    ${st.me ? (isHost ? `<button class="primary" style="width:100%" data-act="start" ${canStart ? '' : 'disabled'}>เริ่มเกม</button>${canStart ? '' : '<div class="small muted" style="text-align:center;margin-top:6px">ต้องมีผู้เล่น 2–7 คน</div>'}` : '<div class="panel muted">รอเจ้าของห้องกดเริ่มเกม…</div>') : '<div class="panel muted">กำลังชม รอเกมเริ่ม…</div>'}
    <div style="margin-top:12px"><button class="ghost" style="width:100%" data-act="${st.me ? 'leave' : 'home'}">ออกจากห้อง</button></div>`;
  }

  const phaseName = { auction: 'ประมูล', auctionResult: 'ผลประมูล', racePick: 'เลือกรถ', raceResult: 'ผล Race', gameOver: 'จบเกม', cancelled: 'ยกเลิก' };

  function viewAuction(st) {
    const a = st.auction, me = st.me ? P(st.me) : null;
    const myTurn = st.phase === 'auction' && a.turnId && a.turnId === st.me && !st.myLeft;
    const setHtml = `<div class="cards">${a.set.map((id, i) => cardBox(id, 'set', 110, { after: `<div class="small muted" style="text-align:center">${i === 0 ? 'ผู้ชนะได้คันนี้' : ''}</div>` })).join('')}</div>`;
    let body = '';
    if (st.phase === 'auction') {
      const outs = Object.entries(a.out).map(([pid, why]) => `<span class="chip">${esc(P(pid).name)} ${why === 'no_money' ? 'เงินไม่พอ' : why === 'timeout' ? 'หมดเวลา' : 'pass'}</span>`).join(' ');
      body = `<div class="row"><div class="grow">bid ปัจจุบัน<div class="big">${a.currentBid}</div><div class="small">โดย <b>${esc(P(a.highBidderId).name)}</b></div></div>
        <div style="text-align:right"><div class="small muted">ตาของ</div><div class="pname">${a.turnId ? esc(P(a.turnId).name) : '-'}</div></div></div>
        ${outs ? `<div class="row small" style="margin-top:6px"><span class="muted">ออกจากรอบ:</span> ${outs}</div>` : ''}`;
      if (myTurn) {
        const v = Math.max(a.minBid, Math.min(me.coins, Number(S.drafts.bid || a.minBid)));
        body += `<div class="panel stack" style="background:var(--panel2)"><div class="pname">ถึงตาคุณ · มี ${me.coins} Coins</div>
          <div class="stepper"><button data-act="bid-dec" aria-label="ลด">−</button><input id="in-bid" type="number" inputmode="numeric" min="${a.minBid}" max="${me.coins}" value="${v}"><button data-act="bid-inc" aria-label="เพิ่ม">+</button>
          <span class="small muted">ขั้นต่ำ ${a.minBid}</span></div>
          <div class="row"><button class="primary grow" data-act="raise">Bid</button><button class="grow" data-act="pass">Pass</button></div></div>`;
      }
    } else {
      const last = st.auctionHistory[st.auctionHistory.length - 1];
      body = `<div class="winner">${esc(P(last.winnerId).name)} ชนะ ${last.price} Coins</div>
        <table><tr><th>ผู้เล่น</th><th>ได้รถ</th></tr>${st.players.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(card(last.allocation[p.id]).name)} · ${card(last.allocation[p.id]).power}</td></tr>`).join('')}</table>`;
    }
    return `<div class="panel"><div class="row"><h2 class="grow">Auction ${a.no}/${st.x}</h2><span class="small muted">ผู้เปิด ${esc(P(a.openerId).name)}</span></div>${setHtml}${body}</div>`;
  }

  function prizesHtml(prizes) {
    return `<div class="prizes">${prizes.map((v, i) => `<div class="prize"><span class="r">อันดับ ${i + 1}</span><span class="v">${v}</span></div>`).join('')}</div>`;
  }

  function viewRace(st) {
    const r = st.race;
    let body = '';
    if (st.phase === 'racePick') {
      const me = st.me ? P(st.me) : null;
      if (r.last) body = '<div class="banner">Race สุดท้าย — ทุกคนเหลือรถคันเดียว ระบบเลือกให้อัตโนมัติ</div>';
      else if (me && !st.myLeft) {
        if (st.myConfirmed) body = `<div class="panel" style="background:var(--panel2)">ยืนยันแล้ว: <b>${esc(card(st.myPick).name)} · ${card(st.myPick).power}</b><div class="small muted">รอคนอื่นเลือก…</div></div>`;
        else {
          body = `<div class="small muted" style="margin-top:8px">เลือกรถที่จะใช้ (เปลี่ยนได้จนกดยืนยัน)</div>
          <div class="cards">${me.cars.map(id => cardBox(id, 'pick', 110, { cls: st.myPick === id ? 'sel' : '', after: `<button class="${st.myPick === id ? 'primary' : ''}" data-act="pick" data-card="${esc(id)}">${st.myPick === id ? 'เลือกอยู่' : 'ใช้คันนี้'}</button>` })).join('')}</div>
          <button class="primary" style="width:100%" data-act="confirm" ${st.myPick ? '' : 'disabled'}>ยืนยันรถ</button>`;
        }
      }
      const waiting = st.players.filter(p => !r.confirmed.includes(p.id));
      body += `<div class="small muted" style="margin-top:8px">${waiting.length ? 'ยังไม่เลือก: ' + waiting.map(p => esc(p.name)).join(', ') : 'ทุกคนเลือกแล้ว'}</div>`;
    } else {
      const res = st.raceHistory[st.raceHistory.length - 1];
      body = `<div class="cards">${res.rows.map(row => cardBox(row.cardId, 'res', 110, { after: `<div class="small" style="text-align:center"><b>#${row.rank}</b> ${esc(P(row.playerId).name)}<br><span class="big" style="font-size:16px">+${row.prize}</span>${row.auto ? ' <span class="chip">สุ่ม</span>' : ''}</div>` })).join('')}</div>`;
    }
    return `<div class="panel"><h2>Race ${r.no}/${st.x}</h2>${prizesHtml(r.prizes)}${body}</div>`;
  }

  function viewOver(st) {
    const winners = st.standings.filter(s => s.winner);
    const tb = { prize: 'ตัดสินด้วย Prize รวม', firstPlaces: 'Prize เท่ากัน ตัดสินด้วยจำนวนครั้งที่ได้อันดับ 1', shared: 'Prize และจำนวนอันดับ 1 เท่ากัน — ชนะร่วม' }[st.tieBreak] || '';
    return `<div class="panel"><div class="small muted">WINNER</div><div class="winner">${winners.map(w => esc(P(w.playerId).name)).join(' · ')}${winners.length > 1 ? ' (ชนะร่วม)' : ''}</div><div class="small muted">${tb}</div>
      <table style="margin-top:8px"><tr><th>#</th><th>ผู้เล่น</th><th>Prize</th><th>อันดับ 1</th></tr>
      ${st.standings.map(s => `<tr><td>${s.rank}</td><td>${esc(P(s.playerId).name)}${s.left ? ' <span class="chip">ออกแล้ว (ระบบเล่นแทน)</span>' : ''}</td><td>${s.prizeTotal}</td><td>${s.firstPlaces}</td></tr>`).join('')}</table>
      <button class="ghost" style="width:100%;margin-top:12px" data-act="home">กลับหน้าแรก</button></div>`;
  }

  function viewBoard(st) {
    const inRace = ['racePick', 'raceResult', 'gameOver'].includes(st.phase);
    return `<div class="panel"><h2>กระดาน</h2>${st.players.map(p => `<div class="player ${p.id === st.me ? 'me' : ''}">
      <div class="row"><span class="pname grow">${esc(p.name)}</span>
        <span class="chip">🪙 ${p.coins}</span>${inRace || p.prizeTotal ? `<span class="chip">🏆 ${p.prizeTotal}</span>` : ''}
        ${p.left ? '<span class="chip">ออกแล้ว (ระบบเล่นแทน)</span>' : p.connected ? '' : '<span class="chip bad">หลุด</span>'}
        ${p.picked ? '<span class="chip ok">เลือกแล้ว ✓</span>' : ''}</div>
      ${p.cars.length ? `<div class="cards">${p.cars.map(id => cardBox(id, 'board', 88)).join('')}</div>` : `<div class="small muted">${inRace ? 'ใช้รถครบแล้ว' : 'ยังไม่มีรถ'}</div>`}
    </div>`).join('')}</div>`;
  }

  function viewHistory(st) {
    if (!st.auctionHistory.length) return '';
    return `<div class="panel"><details><summary>ผลการแข่งและการประมูลที่ผ่านมา</summary>
      ${st.raceHistory.length ? `<table><tr><th>Race</th><th>ผู้เล่น</th><th>รถ</th><th>#</th><th>Prize</th></tr>${st.raceHistory.map(r => r.rows.map(row => `<tr><td>${r.no}</td><td>${esc(P(row.playerId).name)}</td><td>${esc(card(row.cardId).name)} · ${row.power}</td><td>${row.rank}</td><td>${row.prize}${row.auto ? ' (สุ่ม)' : ''}</td></tr>`).join('')).join('')}</table>` : ''}
      <table style="margin-top:8px"><tr><th>Auction</th><th>ผู้ชนะ</th><th>ราคา</th></tr>${st.auctionHistory.map(a => `<tr><td>${a.no}</td><td>${esc(P(a.winnerId).name)}</td><td>${a.price}</td></tr>`).join('')}</table>
    </details></div>`;
  }

  function viewGame(st) {
    const watching = !st.me || st.myLeft;
    let main = '';
    if (st.phase === 'cancelled') main = `<div class="panel"><div class="winner">เกมถูกยกเลิก</div><div class="muted">ผู้เล่นทุกคนออกจากเกม</div><button class="ghost" style="width:100%;margin-top:12px" data-act="home">กลับหน้าแรก</button></div>`;
    else if (st.phase === 'gameOver') main = viewOver(st);
    else if (st.auction) main = viewAuction(st);
    else if (st.race) main = viewRace(st);
    const leaveBar = S.confirmLeave
      ? `<div class="panel stack"><div>ออกจากเกม? ระบบจะเล่นแทนคุณจนจบ (ยังมีสิทธิ์ชนะ) และกลับมาเป็นผู้เล่นไม่ได้</div><div class="row"><button class="danger grow" data-act="leave">ยืนยันออก</button><button class="grow" data-act="leave-cancel">เล่นต่อ</button></div></div>`
      : (['gameOver', 'cancelled'].includes(st.phase) ? '' : `<button class="ghost" style="width:100%" data-act="${watching ? 'home' : 'leave'}">${watching ? 'เลิกชม' : 'ออกจากเกม'}</button>`);
    return `<div class="top"><div><span class="code">${esc(st.code)}</span> <span class="chip">${phaseName[st.phase] || ''}</span></div><div class="timer js-timer"></div></div>
      ${watching ? `<div class="banner">${st.myLeft ? 'คุณออกจากเกมแล้ว — กำลังชม' : 'กำลังชม'} · ผู้ชม ${st.spectators} คน</div>` : ''}
      ${main}${viewBoard(st)}${viewHistory(st)}${leaveBar}`;
  }

  // ---------- render ----------
  function render() {
    const app = $('#app');
    const f = document.activeElement && document.activeElement.id;
    const sel = f && document.activeElement.selectionStart;
    const st = S.st;
    let html = '';
    if (S.everConnected && !S.connected) html += '<div class="banner">กำลังเชื่อมต่อใหม่…</div>';
    if (!st) html += viewHome();
    else if (st.phase === 'lobby') html += viewLobby(st);
    else html += S.cardsReady ? viewGame(st) : '<div class="panel muted">กำลังโหลดการ์ด…</div>';
    app.innerHTML = html;
    placeCards();
    if (f && document.getElementById(f)) {
      const el = document.getElementById(f); el.focus();
      try { if (sel != null && el.setSelectionRange && el.type !== 'number') el.setSelectionRange(sel, sel); } catch (e) { /* */ }
    }
    const r = remain();
    document.querySelectorAll('.js-timer').forEach(el => { el.textContent = r == null ? '' : r; });
  }
  render();
})();
