// หน้าเว็บ บิดไปสมาชิก — state เดียว S, render() สร้างหน้าใหม่จาก state ทุกครั้ง
(function () {
  'use strict';
  const CFG = window.BNRL_CONFIG;
  const KEY = 'bnrl-session';
  const socket = io();
  const S = {
    st: null, session: null, spectating: null, connected: false, everConnected: false,
    cards: new Map(), cardsReady: false, offset: 0, drafts: {}, confirmLeave: false,
    ui: { remain: true, hist: false, histTab: 'auction', histA: null }
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
  function cardBox(id, where, w, extra) { // w = 0 → กว้างเต็มช่องของ grid
    const c = card(id), x = extra || {};
    return `<div class="cardbox ${w ? 'w' + w : 'fill'} ${x.cls || ''}"><div class="cslot" data-card="${esc(id)}" data-where="${esc(where)}"></div>` +
      (x.cap === false ? '' : `<div class="cap" title="${esc(c.name)} · ${esc(c.power)}"><b>${esc(c.power)}</b> ${esc(c.name)}</div>`) + `${x.after || ''}</div>`;
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
    if (st.phase !== 'auction') { delete S.drafts.bid; delete S.drafts.bidSeq; }
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
          if (!res.ok) return;
          history.replaceState(null, '', '?room=' + res.code);
          if (res.spectator) { // L6: เกมเริ่มแล้วหรือห้องเต็ม → ผู้ชมอัตโนมัติ
            S.spectating = res.code;
            toast(res.reason === 'ROOM_FULL' ? 'ห้องเต็มแล้ว — เข้าเป็นผู้ชม' : 'เกมเริ่มไปแล้ว — เข้าเป็นผู้ชม');
          } else { S.session = { code: res.code, playerId: res.playerId, token: res.token }; store.set(S.session); }
        });
        break;
      case 'fold': S.ui[b.dataset.key] = !S.ui[b.dataset.key]; render(); break;
      case 'tab': S.ui.histTab = b.dataset.tab; render(); break;
      case 'hist-a': S.ui.histA = Number(b.dataset.no); render(); break;
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
        const cur = $('#in-bid') ? Number($('#in-bid').value) : a2.minBid;
        const v = (Number.isFinite(cur) ? cur : a2.minBid) + (a === 'bid-inc' ? 1 : -1);
        S.drafts.bid = Math.max(a2.minBid, Math.min(me.coins, v)); S.drafts.bidSeq = a2.seq; render(); break;
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
    if (e.target.id === 'in-bid') { S.drafts.bid = e.target.value; S.drafts.bidSeq = S.st && S.st.auction ? S.st.auction.seq : null; }
    if (e.target.id === 'in-name') S.drafts.name = e.target.value;
    if (e.target.id === 'in-code') S.drafts.code = e.target.value;
  });

  // ---------- เวลา (คำนวณจาก endsAt ของ server — R-10-02) ----------
  function remain() { return S.st && S.st.endsAt && !introStep() ? Math.max(0, Math.ceil((S.st.endsAt - (Date.now() + S.offset)) / 1000)) : null; }
  let introKey = '';
  setInterval(() => {
    const s = introStep(), k = s ? s.kind + s.no : '';
    if (k !== introKey) { introKey = k; render(); } // เปลี่ยนป้าย / ป้ายจบ
    const r = remain();
    document.querySelectorAll('.js-timer').forEach(el => { el.textContent = r == null ? '' : r; el.classList.toggle('low', r != null && r <= 3); });
  }, 250);

  // ---------- views (layout v2) ----------
  const of = (a, b) => `${a} / ${b}`; // ตัวนับรอบแบบ "2 / 7"
  const PH = { auction: 1, auctionResult: 1, racePick: 2, raceResult: 2 };
  const phaseLabel = { auction: 'PHASE 1 · ประมูล', auctionResult: 'PHASE 1 · ผลประมูล', racePick: 'PHASE 2 · เลือกรถ', raceResult: 'PHASE 2 · ผล Race', gameOver: 'จบเกม', cancelled: 'ยกเลิก' };
  const meCls = id => (S.st && id === S.st.me ? 'me' : '');

  function viewHome() {
    const code = S.drafts.code != null ? S.drafts.code : roomFromUrl();
    return `<h1>บิดไปสมาชิก<span class="en">BID NOW, RACE LATER</span></h1><div class="stripe"></div>
    <div class="panel stack">
      <label class="small muted" for="in-name">ชื่อของคุณ</label>
      <input id="in-name" maxlength="${CFG.NAME_MAX_CHARS}" autocomplete="nickname" value="${esc(S.drafts.name || '')}">
      ${code ? '' : `<button class="primary" data-act="create">สร้างห้องใหม่</button><div class="small muted center">หรือเข้าห้องเพื่อน</div>`}
      <label class="small muted" for="in-code">รหัสห้อง</label>
      <input id="in-code" maxlength="4" autocapitalize="characters" value="${esc(code)}" style="text-transform:uppercase;letter-spacing:.2em">
      <button class="join" data-act="join">เข้าร่วม</button>
      <div class="small muted center">ถ้าเกมในห้องเริ่มไปแล้ว จะเข้าเป็นผู้ชมให้อัตโนมัติ</div>
    </div>
    <div class="panel small muted">ประมูลรถด้วย Coins ที่มีจำกัด แล้วนำรถมาแข่งทีละคันเพื่อเก็บ Prize · ผู้เล่น 2–7 คน</div>`;
  }

  function viewLobby(st) {
    const isHost = st.me === st.hostId, n = st.players.length;
    const canStart = n >= CFG.PLAYERS_MIN && n <= CFG.PLAYERS_MAX;
    return `<div class="top"><div><span class="muted small">ห้อง</span> <span class="code">${esc(st.code)}</span></div><button class="ghost" data-act="copy">คัดลอกลิงก์</button></div>
    <div class="panel"><h2>ผู้เล่น ${of(n, CFG.PLAYERS_MAX)}</h2>
      ${st.players.map(p => `<div class="row player ${meCls(p.id)}"><span class="pname grow">${esc(p.name)}</span>${p.id === st.hostId ? '<span class="chip hot">เจ้าของห้อง</span>' : ''}${p.connected ? '' : '<span class="chip bad">หลุด</span>'}</div>`).join('')}
    </div>
    ${st.me ? (isHost ? `<button class="primary" style="width:100%" data-act="start" ${canStart ? '' : 'disabled'}>เริ่มเกม</button>${canStart ? '' : '<div class="small muted center" style="margin-top:6px">ต้องมีผู้เล่น 2–7 คน</div>'}` : '<div class="panel muted">รอเจ้าของห้องกดเริ่มเกม…</div>') : '<div class="panel muted">กำลังชม รอเกมเริ่ม…</div>'}
    <div style="margin-top:12px"><button class="ghost" style="width:100%" data-act="${st.me ? 'leave' : 'home'}">ออกจากห้อง</button></div>`;
  }

  // ---------- ป้ายประกาศ (L1) ----------
  function introStep() {
    const st = S.st; if (!st || !st.intro) return null;
    const now = Date.now() + S.offset;
    return st.intro.steps.find(s => s.endsAt > now) || null;
  }
  function viewIntro(st, s) {
    const p = s.kind === 'phase' ? s.no : (s.kind === 'auction' ? 1 : 2);
    let inner;
    if (s.kind === 'phase') {
      const sub = s.no === 1 ? `ประมูล ${st.x} รอบ · คนละ ${CFG.STARTING_COINS[st.x] || '-'} Coins` : `แข่ง ${st.x} Race · ใช้รถได้คันละครั้ง`;
      inner = `<div class="lbl">PHASE ${s.no}</div><div class="ttl">${s.no === 1 ? 'ประมูล' : 'แข่งขัน'}</div><div class="bar"></div><div class="sub">${sub}</div>`;
    } else if (s.kind === 'auction') {
      const a = st.auction, open = a && a.log && a.log[0];
      inner = `<div class="rnd-a">AUCTION</div><div class="rnd-n">${of(s.no, st.x)}</div>` +
        (a ? `<div class="sub">ผู้เปิด ${esc(P(a.openerId).name)} · bid เปิด ${open ? open.amount : 0} Coin</div>` : '');
    } else {
      const r = st.race;
      inner = `<div class="rnd-a">RACE</div><div class="rnd-n">${of(s.no, st.x)}</div>` +
        (r ? `<div class="sub">${r.last ? 'Race สุดท้าย — ระบบเลือกรถให้อัตโนมัติ' : `Prize อันดับ 1 = ${r.prizes[0]} · เลือกรถภายใน ${CFG.PICK_SECONDS} วิ`}</div>` : '');
    }
    return `<div class="intro p${p} k-${s.kind}" role="status" aria-live="polite">${inner}</div>`;
  }

  // ---------- Phase 1: ประมูล ----------
  function bidLog(st) {
    const a = st.auction;
    let curIdx = -1; a.log.forEach((e, i) => { if (e.kind === 'open' || e.kind === 'raise') curIdx = i; });
    const rows = a.log.map((e, i) => {
      const isBid = e.kind === 'open' || e.kind === 'raise';
      const note = e.kind === 'open' ? 'เปิดอัตโนมัติ' : e.kind === 'out' ? 'Coins ไม่พอ' : e.reason === 'timeout' ? 'หมดเวลา' : '';
      const v = isBid ? e.amount : e.kind === 'out' ? 'ออก' : 'Pass';
      return `<div class="bl ${isBid ? '' : 'pass'} ${i === curIdx ? 'cur' : ''}"><span class="n">${i + 1}</span><span class="who ${meCls(e.pid)}">${esc(P(e.pid).name)}</span><span class="note">${note}</span><span class="v">${v}</span></div>`;
    }).reverse().join('');
    return `<div class="bidlog"><div class="row"><b class="grow">ประวัติ bid รอบนี้</b><span class="small muted">ล่าสุดอยู่บน</span></div><div class="bidlog-list">${rows}</div></div>`;
  }
  function playerStatus(p) {
    return p.left ? '<span class="chip">ออกแล้ว (ระบบเล่นแทน)</span>' : p.connected ? '' : '<span class="chip bad">หลุด</span>';
  }
  function playerList(st) { // L4: เรียงตาม Coins ตอนเริ่มรอบ เท่ากันเรียงตามที่นั่งจากผู้เปิด
    const a = st.auction, x = st.x, o = P(a.openerId).seat;
    const sc = p => (a.startCoins && a.startCoins[p.id] != null ? a.startCoins[p.id] : p.coins);
    const list = st.players.slice().sort((p, q) => sc(q) - sc(p) || ((p.seat - o + x) % x) - ((q.seat - o + x) % x));
    return `<div class="panel plist"><div class="row"><h2 class="grow" style="margin:0">ผู้เล่น</h2><span class="small muted">เรียงตาม Coins ตอนเริ่มรอบนี้</span></div>
      ${list.map(p => `<div class="pl"><div class="l"><span class="pname ${meCls(p.id)}">${esc(p.name)}</span><span class="coins">🪙 ${p.coins}</span>${playerStatus(p)}</div>
        <div class="cars">${p.cars.length ? p.cars.map(id => `<div class="carline"><span>${esc(card(id).name)}</span><b>${card(id).power}</b></div>`).join('') : '<span class="muted">ยังไม่มีรถ</span>'}</div></div>`).join('')}
    </div>`;
  }
  function allocGrid(st, res, where) {
    const rows = Object.entries(res.allocation).sort((x, y) => card(y[1]).power - card(x[1]).power);
    return `<div class="grid g2">${rows.map(([pid, cid]) => cardBox(cid, where, 0, { cap: false,
      after: `<div class="got"><span class="small muted">ได้โดย</span> <b class="${meCls(pid)}">${esc(P(pid).name)}</b></div>` })).join('')}</div>`;
  }
  function viewAuction(st) {
    const a = st.auction;
    const head = `<div class="row"><h2 class="grow">Auction ${of(a.no, st.x)}</h2><span class="small muted">ผู้เปิด ${esc(P(a.openerId).name)}</span></div>`;
    if (st.phase === 'auctionResult') {
      const res = st.auctionHistory[st.auctionHistory.length - 1];
      return `<div class="panel">${head}<div class="winner" style="margin-bottom:10px">${esc(P(res.winnerId).name)} ชนะ ${res.price} Coins</div>${allocGrid(st, res, 'ares')}</div>`;
    }
    const me = st.me ? P(st.me) : null;
    const myTurn = a.turnId && a.turnId === st.me && !st.myLeft;
    const outs = Object.keys(a.out).map(pid => esc(P(pid).name)).join(', ');
    let html = `<div class="panel">${head}<div class="small muted">ผู้ชนะได้คันซ้ายบนสุด (Power สูงสุด)</div>
      <div class="grid g3" style="margin-top:8px">${a.set.map(id => cardBox(id, 'set', 0)).join('')}</div>
      ${bidLog(st)}
      <div class="row small" style="margin-top:8px"><span class="grow muted">${outs ? `ออกจากรอบ: <span style="color:var(--ink)">${outs}</span>` : ''}</span><span>${a.turnId ? `ตาของ <b>${esc(P(a.turnId).name)}</b>` : ''}</span></div>`;
    if (myTurn) {
      const draft = S.drafts.bidSeq === a.seq ? Number(S.drafts.bid) : a.minBid; // ค่าเริ่มต้น = ขั้นต่ำ ทุกครั้งที่ถึงตา
      const v = Math.max(a.minBid, Math.min(me.coins, Number.isFinite(draft) ? draft : a.minBid));
      html += `<div class="panel stack myturn"><div class="pname">ถึงตาคุณ · มี ${me.coins} Coins</div>
        <div class="stepper"><button data-act="bid-dec" aria-label="ลด">−</button><input id="in-bid" type="number" inputmode="numeric" min="${a.minBid}" max="${me.coins}" value="${v}"><button data-act="bid-inc" aria-label="เพิ่ม">+</button>
        <span class="small muted">ขั้นต่ำ ${a.minBid}</span></div>
        <div class="row"><button class="bid grow" data-act="raise">Bid</button><button class="pass grow" data-act="pass">Pass</button></div></div>`;
    }
    return html + '</div>' + playerList(st);
  }

  // ---------- Phase 2: แข่งขัน ----------
  function remainingBox(st) {
    const open = S.ui.remain;
    const r = st.race;
    return `<div class="panel"><button class="fold" data-act="fold" data-key="remain" aria-expanded="${open}"><span>${open ? '▾' : '▸'} รถที่เหลือของผู้เล่นแต่ละคน</span><span class="small muted">${open ? 'กดเพื่อยุบ' : 'กดเพื่อเปิด'}</span></button>
      ${open ? st.players.map(p => `<div class="pl"><div class="l"><span class="pname ${meCls(p.id)}">${esc(p.name)}</span>
        <span class="small muted">${p.left ? 'ออกแล้ว' : r.confirmed.includes(p.id) ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}</span></div>
        <div class="chips">${p.cars.map(id => `<span class="carchip"><b>${card(id).power}</b> ${esc(card(id).name)}</span>`).join('') || '<span class="muted small">ไม่มีรถเหลือ</span>'}</div></div>`).join('') : ''}
    </div>`;
  }
  function summaryTable(st, order) { // แต่ละช่อง = Power,อันดับ (L3)
    const n = st.x, hs = st.raceHistory;
    return `<div class="tscroll"><table class="sum"><tr><th class="nm">ชื่อ</th>${Array.from({ length: n }, (_, i) => `<th>R${i + 1}</th>`).join('')}</tr>
      ${order.map(pid => `<tr><td class="nm ${meCls(pid)}">${esc(P(pid).name)}</td>${Array.from({ length: n }, (_, i) => {
        const row = hs[i] && hs[i].rows.find(x => x.playerId === pid);
        return row ? `<td class="${row.rank === 1 ? 'first' : ''}">${row.power},${row.rank}</td>` : '<td class="dash">–</td>';
      }).join('')}</tr>`).join('')}</table></div>`;
  }
  function viewRace(st) {
    const r = st.race;
    if (st.phase === 'raceResult') {
      const res = st.raceHistory[st.raceHistory.length - 1];
      return `<div class="panel"><h2>ผล Race ${of(res.no, st.x)}</h2>
        ${res.rows.map(row => `<div class="rr"><div class="rk ${row.rank === 1 ? 'first' : ''}">${row.rank}</div>${cardBox(row.cardId, 'rr', 58, { cap: false })}
          <div class="info"><span class="pname ${meCls(row.playerId)}">${esc(P(row.playerId).name)}</span>
          <span class="small ell">${esc(card(row.cardId).name)} · <b class="pw">${row.power}</b></span>${row.auto ? '<span class="small muted">ระบบสุ่มให้</span>' : ''}</div>
          <div class="pz">+${row.prize}</div></div>`).join('')}</div>
        <div class="panel"><h2>สรุปทุกรอบ</h2><div class="small muted" style="margin-bottom:4px">แต่ละช่อง = Power, อันดับ</div>${summaryTable(st, res.rows.map(x => x.playerId))}</div>`;
    }
    const me = st.me ? P(st.me) : null;
    let body = '';
    if (r.last) body = '<div class="banner">Race สุดท้าย — ทุกคนเหลือรถคันเดียว ระบบเลือกให้อัตโนมัติ</div>';
    else if (me && !st.myLeft) {
      if (st.myConfirmed) body = `<div class="panel" style="background:var(--panel2)">ยืนยันแล้ว: <b>${esc(card(st.myPick).name)} · ${card(st.myPick).power}</b><div class="small muted">รอคนอื่นเลือก…</div></div>`;
      else body = `<div class="small muted" style="margin-top:10px">เลือกรถที่จะใช้ (เปลี่ยนได้จนกดยืนยัน)</div>
        <div class="grid g3" style="margin-top:8px">${me.cars.map(id => cardBox(id, 'pick', 0, { cls: st.myPick === id ? 'sel' : '',
          after: `<button class="${st.myPick === id ? 'primary' : ''}" data-act="pick" data-card="${esc(id)}">${st.myPick === id ? 'เลือกอยู่' : 'ใช้คันนี้'}</button>` })).join('')}</div>
        <button class="primary" style="width:100%;margin-top:10px" data-act="confirm" ${st.myPick ? '' : 'disabled'}>ยืนยันรถ</button>`;
    }
    const waiting = st.players.filter(p => !r.confirmed.includes(p.id));
    body += `<div class="small muted" style="margin-top:8px">${waiting.length ? 'ยังไม่เลือก: ' + waiting.map(p => esc(p.name)).join(', ') : 'ทุกคนเลือกแล้ว'}</div>`;
    return `<div class="panel"><h2>Race ${of(r.no, st.x)}</h2>
      <div class="grid g4">${r.prizes.map((v, i) => `<div class="prize"><span class="r">อันดับ ${i + 1}</span><span class="v">${v}</span></div>`).join('')}</div>${body}</div>${remainingBox(st)}`;
  }

  // ---------- จบเกม ----------
  function viewOver(st) {
    const winners = st.standings.filter(s => s.winner), n = st.x, hs = st.raceHistory;
    const tb = { prize: 'ตัดสินด้วย Prize รวม', firstPlaces: 'Prize เท่ากัน ตัดสินด้วยจำนวนครั้งที่ได้อันดับ 1', shared: 'Prize และจำนวนอันดับ 1 เท่ากัน — ชนะร่วม' }[st.tieBreak] || '';
    return `<div class="panel"><div class="small muted">WINNER</div><div class="winner">${winners.map(w => esc(P(w.playerId).name)).join(' · ')}${winners.length > 1 ? ' (ชนะร่วม)' : ''}</div><div class="small muted">${tb}</div>
      <div class="tscroll" style="margin-top:8px"><table class="sum"><tr><th>#</th><th class="nm">ชื่อ</th>${Array.from({ length: n }, (_, i) => `<th>R${i + 1}</th>`).join('')}<th class="tot">Total</th></tr>
      ${st.standings.map(s => `<tr><td class="${s.rank === 1 ? 'first' : ''}">${s.rank}</td><td class="nm ${meCls(s.playerId)}">${esc(P(s.playerId).name)}${s.left ? ' <span class="chip">ออกแล้ว</span>' : ''}</td>${Array.from({ length: n }, (_, i) => {
        const row = hs[i] && hs[i].rows.find(x => x.playerId === s.playerId);
        return row ? `<td class="${row.rank === 1 ? 'first' : ''}">${row.prize}</td>` : '<td class="dash">–</td>';
      }).join('')}<td class="tot">${s.prizeTotal}</td></tr>`).join('')}</table></div>
      <button class="ghost" style="width:100%;margin-top:12px" data-act="home">กลับหน้าแรก</button></div>`;
  }

  // ---------- กล่องผลที่ผ่านมา (L5: เปิดดูผลประมูลได้ทุกเฟส) ----------
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
          <div class="small muted">Auction ${of(res.no, st.x)} · ผู้เปิด ${esc(P(res.openerId).name)} · <span style="color:var(--ink)">${esc(P(res.winnerId).name)} ชนะ ${res.price} Coins</span></div>${allocGrid(st, res, 'hist')}`;
      } else {
        const order = st.players.slice().sort((a, b) => b.prizeTotal - a.prizeTotal).map(p => p.id);
        inner += st.raceHistory.length ? `<div class="small muted">แต่ละช่อง = Power, อันดับ</div>${summaryTable(st, order)}` : '<div class="small muted">ยังไม่มีผลการแข่ง</div>';
      }
    }
    return `<div class="panel stack"><button class="fold" data-act="fold" data-key="hist" aria-expanded="${open}"><span>${open ? '▾' : '▸'} ผลการแข่งและการประมูลที่ผ่านมา</span><span class="small muted">${open ? 'กดเพื่อยุบ' : ''}</span></button>${inner}</div>`;
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
    const step = introStep();
    return `<div class="top"><div class="row"><span class="code">${esc(st.code)}</span> <span class="pill">${phaseLabel[st.phase] || ''}</span></div><div class="timer js-timer"></div></div>
      ${watching ? `<div class="banner">${st.myLeft ? 'คุณออกจากเกมแล้ว — กำลังชม' : 'กำลังชม'} · ผู้ชม ${st.spectators} คน</div>` : ''}
      ${main}${viewHistory(st)}${leaveBar}${step ? viewIntro(st, step) : ''}`;
  }

  // ---------- render ----------
  function render() {
    const app = $('#app');
    const f = document.activeElement && document.activeElement.id;
    const sel = f && document.activeElement.selectionStart;
    const st = S.st;
    document.body.className = st && PH[st.phase] ? 'p' + PH[st.phase] : '';
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
