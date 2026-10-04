// ตัวประกอบการ์ดกลางชุด 420 — อ่านทุกอย่างจาก cards/template.json ห้ามฝังพิกัด
// ส่วนเสริมของเกมนี้: pips.round ("floor"), gauge.dash, fit ข้ามช่องที่ยังไม่แสดงผล, template สำรองเมื่อไม่มี template.json
(function (root) {
  'use strict';
  const SVGNS = 'http://www.w3.org/2000/svg';
  let T = {}, VER = '';
  // R-4.1-07 template สำรอง (ค่าเดียวกับ spec 4.1) ใช้เมื่ออ่าน template.json ไม่ได้
  const FALLBACK = {
    base: { w: 600, h: 900 }, frame: 'frame.png', art: { x: 28, y: 126, w: 544, h: 456, radius: 14 },
    fallback: { bg: '#1A1C20', color: '#F2EFE8', column: 'name' },
    slots: [
      { id: 'name', type: 'text', column: 'name', x: 30, y: 4, w: 420, h: 98, font: { family: 'Kanit', weight: 700, italic: true, size: 52, min: 28 }, color: '#101114', align: 'left', valign: 'middle', fit: 'shrink' },
      { id: 'power', type: 'number', column: 'power', x: 200, y: 740, w: 200, h: 80, font: { family: 'Orbitron', weight: 900, size: 72, min: 40 }, color: '#FF7A00', align: 'center', valign: 'middle', fit: 'shrink' }
    ]
  };
  async function load() {
    const data = await (await fetch('/api/cards', { cache: 'no-cache' })).json();
    T = data.templates || {}; if (!T.main) T.main = FALLBACK; VER = data.version;
    return data;
  }
  const pct = (v, t) => (v / t * 100) + '%';
  const cq = (px, b) => (px / b.w * 100) + 'cqw';
  function box(el, s, b) {
    el.style.left = pct(s.x, b.w); el.style.top = pct(s.y, b.h);
    if (s.w != null) el.style.width = pct(s.w, b.w);
    if (s.h != null) el.style.height = pct(s.h, b.h);
  }
  function textSlot(s, v, b, cls) {
    const el = document.createElement('div');
    el.className = `ck-slot ${cls} ck-${s.fit || 'shrink'}`; box(el, s, b);
    const f = s.font || {};
    Object.assign(el.style, {
      fontFamily: `'${f.family}', sans-serif`, fontWeight: f.weight || 400,
      fontStyle: f.italic ? 'italic' : 'normal', color: s.color || 'inherit',
      textAlign: s.align || 'left',
      justifyContent: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[s.valign || 'middle']
    });
    if (cls === 'ck-badge') { el.style.background = (s.colors || {})[v] || s.bg || 'transparent'; el.style.borderRadius = cq(s.radius || 0, b); }
    const span = document.createElement('span');
    span.textContent = (s.prefix || '') + v + (s.suffix || '');
    el.appendChild(span);
    el.dataset.size = f.size; el.dataset.min = f.min || f.size;
    return el;
  }
  function fit(el, b) { // ย่อจนพอดี ห้ามตัดคำ ถึง min แล้วยังล้น = data-overflow
    if (!el.clientWidth) { el.dataset.fitPending = '1'; return; } // ยังไม่แสดงผล ไว้ fit ใหม่ทีหลัง
    delete el.dataset.fitPending;
    let size = +el.dataset.size; const min = +el.dataset.min, span = el.firstChild;
    for (;;) {
      el.style.fontSize = cq(size, b);
      if (span.scrollWidth <= el.clientWidth + 1 && span.offsetHeight <= el.clientHeight + 1) { delete el.dataset.overflow; return; }
      if (size <= min) { el.dataset.overflow = '1'; return; }
      size = Math.max(min, size - 1);
    }
  }
  function pips(s, v, b) {
    const el = document.createElement('div'); el.className = 'ck-slot ck-pips';
    el.style.left = pct(s.x, b.w); el.style.top = pct(s.y, b.h); el.style.gap = cq(s.gap || 0, b);
    const R = Math[s.round] || Math.round; // [ส่วนเสริม] round: "floor" ตาม spec R-4.1 (ไฟติด = floor(power ÷ 5))
    const lit = Math.max(0, Math.min(s.count, R(+v / s.max * s.count)));
    for (let i = 1; i <= s.count; i++) {
      const p = document.createElement('i'), band = (s.on || []).find(o => i <= o.upTo) || {};
      p.style.width = p.style.height = cq(s.size, b);
      p.style.background = i <= lit ? band.color : (s.off || 'transparent');
      if (i <= lit && s.glow) p.style.boxShadow = `0 0 ${cq(s.size * 0.6, b)} ${band.color}`;
      el.appendChild(p);
    }
    return el;
  }
  function bar(s, v, b) {
    const el = document.createElement('div'); el.className = 'ck-slot ck-bar'; box(el, s, b);
    el.style.background = s.bg || 'transparent'; el.style.borderRadius = cq(s.radius || 0, b);
    const fill = document.createElement('div');
    fill.style.cssText = `height:100%;border-radius:inherit;background:${s.color};width:${Math.max(0, Math.min(1, +v / s.max)) * 100}%`;
    el.appendChild(fill); return el;
  }
  function gauge(s, v, b) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${b.w} ${b.h}`); svg.setAttribute('class', 'ck-layer');
    const t = Math.max(0, Math.min(1, +v / s.max)); if (!t) return svg;
    const d0 = s.startDeg ?? 180, d1 = d0 + ((s.endDeg ?? 0) - d0) * t;
    const P = d => [s.cx + s.r * Math.cos(d * Math.PI / 180), s.cy - s.r * Math.sin(d * Math.PI / 180)];
    const [x0, y0] = P(d0), [x1, y1] = P(d1);
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', `M ${x0} ${y0} A ${s.r} ${s.r} 0 ${Math.abs(d1 - d0) > 180 ? 1 : 0} ${d1 < d0 ? 1 : 0} ${x1} ${y1}`);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', s.color);
    path.setAttribute('stroke-width', s.stroke); path.setAttribute('stroke-linecap', s.cap || 'round');
    if (s.dash) path.setAttribute('stroke-dasharray', s.dash); // [ส่วนเสริม] ขีดตรงกับรางในกรอบ
    svg.appendChild(path); return svg;
  }
  function icon(s, v, b) {
    const img = new Image(); img.className = 'ck-slot'; img.alt = ''; box(img, s, b);
    img.src = `/cards/${s.src.replace('{value}', encodeURIComponent(v))}?v=${VER}`;
    img.onerror = () => img.remove(); return img;
  }
  const MAKE = { text: (s, v, b) => textSlot(s, v, b, 'ck-text'), number: (s, v, b) => textSlot(s, v, b, 'ck-text'),
    badge: (s, v, b) => textSlot(s, v, b, 'ck-badge'), pips, bar, gauge, icon };
  function fitAll(el) {
    const tpl = T.main || FALLBACK;
    el.querySelectorAll('.ck-text,.ck-badge').forEach(n => fit(n, tpl.base));
  }
  function render(card, opts = {}) {
    const tpl = T[card.template || 'main'] || FALLBACK, b = tpl.base, mode = opts.mode || 'full';
    const el = document.createElement('div');
    el.className = 'ck-card ck-' + mode; el.style.aspectRatio = `${b.w} / ${b.h}`;
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${card.name} Power ${card.power}`);
    const art = document.createElement('div'); art.className = 'ck-art'; box(art, tpl.art, b);
    art.style.borderRadius = cq(tpl.art.radius || 0, b);
    const fb = () => { art.style.background = tpl.fallback.bg; art.style.color = tpl.fallback.color;
      art.textContent = card[tpl.fallback.column || 'name'] || card.id; art.style.padding = '4cqw'; el.dataset.noart = '1'; };
    if (card.isDefault || /^car-default-/.test(card.id)) fb();
    else {
      const img = new Image(); img.alt = ''; img.loading = 'lazy';
      img.src = `/cards/art/${encodeURIComponent(card.id)}.webp?v=${VER}`;
      img.onerror = () => { img.remove(); fb(); }; // R-4.1-06
      art.appendChild(img);
    }
    el.appendChild(art);
    const fr = new Image(); fr.className = 'ck-frame'; fr.alt = '';
    fr.src = `/cards/${tpl.frame}?v=${VER}`; fr.onerror = () => { fr.remove(); el.classList.add('ck-cssframe'); };
    el.appendChild(fr);
    const hide = mode === 'thumb' ? ((tpl.thumb || {}).hide || []) : [];
    for (const s of tpl.slots) {
      const v = card[s.column];
      if (hide.includes(s.id) || v == null || v === '' || !MAKE[s.type]) continue;
      el.appendChild(MAKE[s.type](s, v, b));
    }
    document.fonts.ready.then(() => requestAnimationFrame(() => fitAll(el)));
    return el;
  }
  function back() {
    const el = document.createElement('div'); el.className = 'ck-card ck-back';
    const tpl = T.main || FALLBACK; el.style.aspectRatio = `${tpl.base.w} / ${tpl.base.h}`;
    const img = new Image(); img.alt = 'การ์ดคว่ำ'; img.className = 'ck-frame';
    img.src = `/cards/${tpl.back || 'back.png'}?v=${VER}`; img.onerror = () => { img.remove(); el.classList.add('ck-cssback'); };
    el.appendChild(img); return el;
  }
  root.CardKit = { load, render, back, fitAll, version: () => VER };
})(window);
