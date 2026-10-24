// เสียงทั้งเกม — spec v2.0 หัวข้อ 10.10
// เสียงสั้นสังเคราะห์ด้วย Web Audio · ถ้ามีไฟล์ใน public/sounds/<ชื่อ>.mp3|.ogg|.wav จะใช้ไฟล์นั้นแทน (รายชื่อไฟล์จาก /api/sounds)
// เพลงพื้นหลัง (bgm-*) ใช้ไฟล์เท่านั้น ถ้าไม่มีไฟล์ = เงียบ · เริ่มเสียงหลังการแตะครั้งแรก
(function () {
  'use strict';
  const KEY = 'bnrl-sound';
  const DEF = { music: .5, sfx: .8, engine: .5, muted: false, vibrate: true, tips: true };
  let cfg = Object.assign({}, DEF);
  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* โหมดส่วนตัว */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* */ } };
  let ac = null, files = {}, bgmEl = null, bgmName = null, engine = null;
  fetch('/api/sounds').then(r => r.json()).then(d => { files = d.files || {}; if (bgmName) { const n = bgmName; bgmName = null; bgm(n); } }).catch(() => {});

  function unlock() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
    if (bgmEl && bgmEl.paused && !cfg.muted) bgmEl.play().catch(() => {});
  }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
  const vol = k => (cfg.muted ? 0 : cfg[k]);
  function out(k) { const g = ac.createGain(); g.gain.value = vol(k); g.connect(ac.destination); return g; }
  function tone(f, d = .15, type = 'square', g = .08, when = 0, slide) {
    if (!ac || !vol('sfx')) return;
    const t = ac.currentTime + when, o = ac.createOscillator(), v = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(v).connect(out('sfx')); o.start(t); o.stop(t + d + .02);
  }
  function noise(len = .5, f0 = 300, f1 = 3000, g = .3, q = 1.2, type = 'bandpass', when = 0) {
    if (!ac || !vol('sfx')) return;
    const n = Math.floor(ac.sampleRate * len), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = buf; const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    const t = ac.currentTime + when; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + len * .7);
    const v = ac.createGain(); v.gain.setValueAtTime(.0001, t); v.gain.exponentialRampToValueAtTime(g, t + .05); v.gain.exponentialRampToValueAtTime(.0001, t + len);
    s.connect(f).connect(v).connect(out('sfx')); s.start(t);
  }
  const SYNTH = {
    click: () => tone(1200, .04, 'square', .04),
    turn: () => { tone(660, .12, 'triangle', .1); tone(990, .2, 'triangle', .1, .12); },
    bid: () => { tone(880, .06, 'square', .05); tone(1320, .08, 'square', .04, .05); },
    chip: () => { tone(1800, .05, 'square', .05); tone(2400, .04, 'square', .03, .04); },
    pass: () => tone(260, .18, 'sine', .07, 0, 180),
    tick: () => tone(1500, .03, 'square', .04),
    gavel: () => { noise(.12, 200, 120, .5, .7, 'lowpass'); tone(140, .12, 'sine', .3); },
    sold: () => { tone(523, .12, 'triangle', .1); tone(784, .2, 'triangle', .1, .1); },
    flip: () => noise(.12, 1500, 4000, .12, 1, 'highpass'),
    pick: () => { tone(784, .1, 'triangle', .1); tone(1046, .16, 'triangle', .1, .1); },
    beep: () => tone(440, .18, 'square', .08),
    go: () => tone(880, .45, 'square', .1),
    rev: () => { tone(70, .35, 'sawtooth', .06, 0, 180); },
    engineStart: () => tone(55, .4, 'sawtooth', .05, 0, 120),
    nitro: o => noise((o && o.len) || .8, 300, 3200, .35),
    nitroFar: () => noise(.5, 400, 2200, .12),
    finish: () => { tone(1320, .3, 'triangle', .1); tone(1760, .3, 'triangle', .08, .12); },
    slowmo: () => tone(300, .9, 'sine', .08, 0, 90),
    camera: () => { noise(.06, 3000, 6000, .2, 1, 'highpass'); tone(2000, .05, 'square', .04, .02); },
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, .28, 'triangle', .12, i * .13)); tone(1047, .7, 'triangle', .1, .55); },
    coin: () => { tone(1568, .08, 'square', .05); tone(2093, .14, 'square', .05, .07); },
    refund: () => { tone(988, .08, 'triangle', .07); tone(1319, .12, 'triangle', .07, .08); },
    cheer: () => noise(1.2, 600, 1200, .18, .4),
    warn: () => tone(880, .08, 'square', .06),
    'campaign-reverse': () => [0, .35, .7].forEach(w => tone(1000, .2, 'square', .07, w)),
    'campaign-double': () => [0, .08, .16, .24].forEach((w, i) => tone(1568 + i * 200, .08, 'square', .05, w)),
    'campaign-rain': () => { noise(1.6, 800, 900, .2, .3, 'lowpass'); noise(.8, 80, 60, .4, .5, 'lowpass', .6); },
    'campaign-frenzy': () => tone(80, .8, 'sawtooth', .1, 0, 600),
    'campaign-ban': () => { tone(700, .25, 'sine', .1, 0, 1000); tone(1000, .25, 'sine', .1, .25, 700); },
    'campaign-wta': () => { for (let i = 0; i < 10; i++) noise(.06, 120, 100, .4, .8, 'lowpass', i * .07); },
    'campaign-fog': () => noise(1.5, 400, 800, .12, 4),
    'campaign-lucky': () => { for (let i = 0; i < 8; i++) tone(800 + i * 60, .05, 'square', .04, i * .07); },
    'campaign-underdog': () => noise(1, 700, 1100, .2, .5)
  };
  function playFile(name) {
    const f = files[name]; if (!f || !vol('sfx')) return false;
    const a = new Audio('/sounds/' + encodeURIComponent(f)); a.volume = vol('sfx'); a.play().catch(() => {}); return true;
  }
  function play(name, opt) { if (!ac) return; if (playFile(name)) return; const fn = SYNTH[name]; if (fn) try { fn(opt); } catch (e) { /* */ } }

  // เสียงเครื่องยนต์ต่อเนื่องระหว่างแข่ง (ไฟล์ engine.* ถ้ามี ไม่มีก็สังเคราะห์)
  function engineLevel(level) {
    if (!ac) return;
    const v = level > 0 ? vol('engine') * .06 : 0;
    if (!engine && v > 0) {
      if (files.engine) { const a = new Audio('/sounds/' + encodeURIComponent(files.engine)); a.loop = true; a.volume = vol('engine'); a.play().catch(() => {}); engine = { file: a }; }
      else {
        const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
        o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 55; o2.frequency.value = 56.5; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0;
        o.connect(f); o2.connect(f); f.connect(g).connect(ac.destination); o.start(); o2.start(); engine = { o, o2, g };
      }
    }
    if (!engine) return;
    if (engine.file) { engine.file.volume = level > 0 ? vol('engine') : 0; if (level <= 0) { engine.file.pause(); engine = null; } return; }
    const t = ac.currentTime;
    engine.g.gain.setTargetAtTime(v, t, .15);
    const fq = 45 + level * 2.2; engine.o.frequency.setTargetAtTime(fq, t, .1); engine.o2.frequency.setTargetAtTime(fq * 1.02, t, .1);
    if (level <= 0) { const e = engine; engine = null; setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch (x) { /* */ } }, 600); }
  }
  // เพลงพื้นหลังแยกช่วง: lobby / auction / race / podium (ไฟล์ bgm-<ชื่อ>.* เท่านั้น)
  function bgm(name) {
    if (name === bgmName) return;
    bgmName = name;
    if (bgmEl) { bgmEl.pause(); bgmEl = null; }
    const f = name && files['bgm-' + name]; if (!f) return;
    bgmEl = new Audio('/sounds/' + encodeURIComponent(f)); bgmEl.loop = true; bgmEl.volume = vol('music');
    if (ac) bgmEl.play().catch(() => {});
  }
  function vibrate(p) { if (!cfg.vibrate || cfg.muted && false) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* iPhone ไม่รองรับ */ } }
  function set(k, v) { cfg[k] = v; save(); if (bgmEl) { bgmEl.volume = vol('music'); if (cfg.muted) bgmEl.pause(); else if (ac) bgmEl.play().catch(() => {}); } if (engine && engine.file) engine.file.volume = vol('engine'); }
  window.Sound = { unlock, play, engine: engineLevel, bgm, vibrate, get: k => cfg[k], set };
})();
