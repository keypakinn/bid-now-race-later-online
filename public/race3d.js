// หน้าแข่ง 3D + ตัวโหลดโมเดล + ตัวดูโมเดลใน lobby — spec v2.0 หัวข้อ 10.6 (Three.js r128)
// ทุก client ได้ runSeed เดียวกัน → เส้นทาง การแซง เวลาจุด Nitro เหมือนกันทุกเครื่อง (R-12-13)
// ลำดับเข้าเส้นชัย = run.order จาก server เสมอ (R-7-29) · ไม่แสดง Power/Nitro ระหว่างวิ่ง (R-4-05)
(function () {
  'use strict';
  const CFG = window.BNRL_CONFIG;
  const THREE = window.THREE;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(THREE && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } })();

  function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------------------
  //  โมเดล: catalog จาก /api/models · code = BNRL_MODELS.build · glb = GLTFLoader (cache)
  // ---------------------------------------------------------------------------
  const META = new Map(); let VER = '';
  const glbCache = new Map();
  const TARGET_LEN = 4.4;
  function setCatalog(api) { META.clear(); VER = api.version || ''; (api.models || []).forEach(m => META.set(m.id, m)); }
  function loadGlb(file) {
    if (!glbCache.has(file)) {
      glbCache.set(file, new Promise((res, rej) => {
        if (!THREE || !THREE.GLTFLoader) return rej(new Error('no loader'));
        new THREE.GLTFLoader().load(`/models/kenney/${encodeURIComponent(file)}?v=${VER}`, g => res(g.scene), undefined, rej);
      }));
    }
    return glbCache.get(file);
  }
  function preload(ids) { (ids || []).forEach(id => { const m = META.get(id); if (m && m.source === 'glb') loadGlb(m.file).catch(() => {}); }); }
  // คืน Promise<{obj, wheels, rearZ, labelY}> หัวรถชี้ −z ยาว TARGET_LEN ล้อแตะพื้น (R-4.2-02 fallback = code-sport)
  function makeModel(id) {
    const meta = META.get(id) || { id, source: 'code', file: 'sport', rotY: 0, skipWheel: [] };
    const finish = (inner, wheels) => {
      const holder = new THREE.Group(); const wrap = new THREE.Group();
      inner.rotation.y = (meta.rotY || 0) * Math.PI / 180; wrap.add(inner); holder.add(wrap);
      let box = new THREE.Box3().setFromObject(wrap); const size = box.getSize(new THREE.Vector3());
      const s = meta.scale ? meta.scale * (meta.source === 'glb' ? TARGET_LEN / 2.6 : 1) : TARGET_LEN / Math.max(0.5, size.z);
      wrap.scale.setScalar(s);
      box = new THREE.Box3().setFromObject(wrap); const c = box.getCenter(new THREE.Vector3());
      wrap.position.set(-c.x, -box.min.y, -c.z);
      box = new THREE.Box3().setFromObject(holder);
      return { obj: holder, wheels, rearZ: meta.rearZ != null ? meta.rearZ : box.max.z, labelY: meta.labelY != null ? meta.labelY : box.max.y + .5, size: box.getSize(new THREE.Vector3()) };
    };
    const fromCode = file => { const g = window.BNRL_MODELS.build(file); return finish(g, g.userData.wheels || []); };
    if (meta.source !== 'glb') return Promise.resolve(fromCode(meta.file));
    return loadGlb(meta.file).then(scene => {
      const g = scene.clone(true); const wheels = [];
      g.traverse(o => { if (o !== g && /wheel/i.test(o.name || '') && !(meta.skipWheel || []).includes(o.name) && o.parent === g) wheels.push(o); });
      return finish(g, wheels);
    }).catch(() => fromCode('sport'));
  }

  // ---------------------------------------------------------------------------
  //  renderer เดียวใช้ร่วมกัน (แข่ง + ตัวดูโมเดล)
  // ---------------------------------------------------------------------------
  let R = null;
  function renderer() {
    if (R) return R;
    R = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    R.outputEncoding = THREE.sRGBEncoding;
    return R;
  }
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), c); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
  const glowTex = (() => { let t = null; return () => t || (t = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })); })();

  // ---------------------------------------------------------------------------
  //  ตัวดูโมเดลใน lobby (หมุน 360° ลากหมุนเองได้)
  // ---------------------------------------------------------------------------
  let viewerState = null;
  function viewer(host, modelId) {
    if (!hasGL || !host) return;
    if (!viewerState) {
      const el = document.createElement('div'); el.className = 'mv';
      const cv = document.createElement('canvas'); el.appendChild(cv);
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.outputEncoding = THREE.sRGBEncoding;
      const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.05));
      const dl = new THREE.DirectionalLight(0xffffff, .8); dl.position.set(4, 7, 3); scene.add(dl);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, .15, 48), new THREE.MeshStandardMaterial({ color: 0x232c3a })); plate.position.y = -.08; scene.add(plate);
      const cam = new THREE.PerspectiveCamera(32, 1, .1, 100); cam.position.set(6.2, 4.6, 7.6); cam.lookAt(0, 1, 0);
      viewerState = { el, r, scene, cam, obj: null, id: null, rot: -2.4, drag: null, raf: null, token: 0 };
      cv.addEventListener('pointerdown', e => { viewerState.drag = e.clientX; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => { if (viewerState.drag != null) { viewerState.rot += (e.clientX - viewerState.drag) * .012; viewerState.drag = e.clientX; } });
      cv.addEventListener('pointerup', () => { viewerState.drag = null; });
      const loop = () => {
        const v = viewerState; if (!v) return;
        if (!document.body.contains(v.el)) { v.raf = null; return; }
        const w = v.el.clientWidth || 200, h = v.el.clientHeight || 160;
        if (v.r.domElement.width !== Math.round(w * v.r.getPixelRatio())) { v.r.setSize(w, h, false); v.cam.aspect = w / h; v.cam.updateProjectionMatrix(); }
        if (v.drag == null && !reduce) v.rot += .008;
        if (v.obj) v.obj.rotation.y = v.rot;
        v.r.render(v.scene, v.cam);
        v.raf = requestAnimationFrame(loop);
      };
      viewerState.start = () => { if (!viewerState.raf) viewerState.raf = requestAnimationFrame(loop); };
    }
    const v = viewerState;
    host.appendChild(v.el);
    if (v.id !== modelId) {
      v.id = modelId; const tk = ++v.token;
      makeModel(modelId).then(m => { if (tk !== v.token) return; if (v.obj) v.scene.remove(v.obj); v.obj = m.obj; v.scene.add(m.obj); });
    }
    v.start();
  }

  // ---------------------------------------------------------------------------
  //  ฉากสนาม
  // ---------------------------------------------------------------------------
  const L = 220, LANE = 4.4;
  const SCENES = {
    night: { sky: 0x0b0e14, fog: 0x0b0e14, ground: 0x10161d, track: 0x1b2029, hemi: [0x8fb4ff, 0x1a1208, .75], sun: .8 },
    desert: { sky: 0xe9a35c, fog: 0xf0b070, ground: 0xd6a466, track: 0x5b4a3c, hemi: [0xfff1d6, 0x8a5a2a, 1.0], sun: 1.1 },
    snow: { sky: 0xbfd3e6, fog: 0xd4e2ee, ground: 0xf2f6fa, track: 0x39424f, hemi: [0xffffff, 0x8899aa, 1.0], sun: .9 },
    neon: { sky: 0x07020f, fog: 0x0b0418, ground: 0x0a0614, track: 0x120c22, hemi: [0xb388ff, 0x110022, .7], sun: .5 }
  };
  function nameBoard(text, color) {
    return canvasTex(512, 128, g => {
      g.fillStyle = '#0e1219'; g.fillRect(0, 0, 512, 128); g.fillStyle = color; g.fillRect(0, 112, 512, 16);
      g.fillStyle = '#ffffff'; g.font = 'bold 54px Kanit, "Noto Sans Thai", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 256, 58, 480);
    });
  }
  function buildTrack(scene, sc, ev, lanes, rng) {
    const S = SCENES[sc] || SCENES.night;
    scene.background = new THREE.Color(ev === 'reverse' ? 0x1a0b2e : S.sky);
    const fogNear = ev === 'fog' ? 8 : 60, fogFar = ev === 'fog' ? 55 : 260;
    scene.fog = new THREE.Fog(ev === 'reverse' ? 0x2a1248 : ev === 'fog' ? 0x9aa6b4 : S.fog, fogNear, fogFar);
    const hemi = new THREE.HemisphereLight(S.hemi[0], S.hemi[1], S.hemi[2]); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, S.sun); sun.position.set(-30, 60, 20); scene.add(sun);
    const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .8, metalness: 0 }, o || {}));
    const W = lanes * LANE + 3;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), M(S.ground, { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.03, -L / 2); scene.add(ground);
    const wet = ev === 'rain';
    const track = new THREE.Mesh(new THREE.PlaneGeometry(W, L + 140), M(S.track, { roughness: wet ? .2 : .9, metalness: wet ? .5 : 0 })); track.rotation.x = -Math.PI / 2; track.position.set(0, 0, -L / 2 + 10); scene.add(track);
    const lineCol = ev === 'double' ? 0xffd24a : sc === 'neon' ? 0xff3fd0 : 0xdfe6ee;
    const paint = new THREE.MeshBasicMaterial({ color: lineCol });
    for (let i = 0; i <= lanes; i++) {
      const x = (i - lanes / 2) * LANE;
      if (i === 0 || i === lanes) { const s = new THREE.Mesh(new THREE.BoxGeometry(.25, .03, L + 140), paint); s.position.set(x, .01, -L / 2 + 10); scene.add(s); continue; }
      for (let z = 30; z > -L - 60; z -= 9) { const s = new THREE.Mesh(new THREE.BoxGeometry(.16, .03, 4), paint); s.position.set(x, .01, z); scene.add(s); }
    }
    if (ev === 'frenzy' || sc === 'neon') [-1, 1].forEach(sd => { const e = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, L + 140), new THREE.MeshBasicMaterial({ color: ev === 'frenzy' ? 0x38e1ff : 0xb14bff })); e.position.set(sd * (W / 2 + .3), .15, -L / 2 + 10); scene.add(e); });
    const checker = canvasTex(128, 16, g => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * 8, j * 8, 8, 8); } });
    checker.magFilter = THREE.NearestFilter;
    [0, -L].forEach(z => { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.6), new THREE.MeshBasicMaterial({ map: checker })); m.rotation.x = -Math.PI / 2; m.position.set(0, .02, z); scene.add(m); });
    // ซุ้มเส้นชัย
    const archMat = M(ev === 'double' ? 0xc99a1e : 0x2b3442);
    [-1, 1].forEach(sd => { const p = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), archMat); p.position.set(sd * (W / 2 + .8), 4.5, -L); scene.add(p); });
    const ftex = canvasTex(512, 96, g => { g.fillStyle = '#0e1219'; g.fillRect(0, 0, 512, 96); g.fillStyle = ev === 'double' ? '#ffd24a' : '#38e1ff'; g.fillRect(0, 88, 512, 8); g.fillStyle = '#fff'; g.font = 'bold 60px Orbitron, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', 256, 46); });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(W + 2.6, 2.2, .6), [archMat, archMat, archMat, archMat, new THREE.MeshBasicMaterial({ map: ftex }), archMat]); banner.position.set(0, 8, -L); scene.add(banner);
    // อัฒจันทร์ + ฝูงชน (instanced)
    const crowdCols = [0xff5a5a, 0x4c94ff, 0xffc531, 0x2fd27b, 0xb77bff, 0xe9edf2, 0x38e1ff];
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .7, .5), new THREE.MeshStandardMaterial({ roughness: .8 }), 1600);
    const dummy = new THREE.Object3D(), col = new THREE.Color(); let ci = 0; const crowdBase = [];
    const standMat = M(sc === 'snow' ? 0x56657a : 0x1a2130);
    [-1, 1].forEach(sd => {
      for (let z = 20; z > -L - 30; z -= 24) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 20), standMat); st.position.set(sd * (W / 2 + 6), 1.5, z - 10); scene.add(st);
        for (let r = 0; r < 3; r++) for (let k = 0; k < 12 && ci < 1600; k++) {
          dummy.position.set(sd * (W / 2 + 4 + r * 1.4), 3.4 + r * .5, z - 1 - k * 1.6); dummy.updateMatrix(); crowd.setMatrixAt(ci, dummy.matrix);
          crowdBase.push(dummy.position.clone()); col.setHex(crowdCols[Math.floor(rng() * crowdCols.length)]); crowd.setColorAt(ci, col); ci++;
        }
      }
    });
    crowd.count = ci; scene.add(crowd);
    // เสาไฟ
    for (let z = 0; z > -L - 40; z -= 55) [-1, 1].forEach(sd => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(.3, 14, .3), archMat); p.position.set(sd * (W / 2 + 11), 7, z); scene.add(p);
      const h = new THREE.Mesh(new THREE.BoxGeometry(2.4, .5, 1), new THREE.MeshBasicMaterial({ color: sc === 'neon' ? 0xff3fd0 : 0xfff2c8 })); h.position.set(sd * (W / 2 + 10), 14, z); scene.add(h);
    });
    // เนินและโค้งไกล ๆ (เป็นฉากเท่านั้น — X1)
    const hillMat = M(sc === 'desert' ? 0xc48a4c : sc === 'snow' ? 0xe6edf4 : sc === 'neon' ? 0x1a0f33 : 0x18222c);
    for (let i = 0; i < 8; i++) { const h = new THREE.Mesh(new THREE.SphereGeometry(25 + rng() * 25, 18, 10), hillMat); h.scale.y = .35 + rng() * .25; h.position.set((rng() < .5 ? -1 : 1) * (60 + rng() * 80), -4, -40 - rng() * (L + 120)); scene.add(h); }
    const curve = new THREE.Mesh(new THREE.RingGeometry(60, 60 + W, 48, 1, Math.PI * .5, Math.PI * .5), M(S.track, { side: THREE.DoubleSide })); curve.rotation.x = -Math.PI / 2; curve.position.set(60 + W / 2, .01, -L - 40); scene.add(curve);
    // ของประดับตามฉาก
    if (sc === 'desert') for (let i = 0; i < 24; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.4, .5, 3 + rng() * 2, 8), M(0x3f7d3a)); c.position.set((rng() < .5 ? -1 : 1) * (W / 2 + 18 + rng() * 30), 1.5, -rng() * L); scene.add(c); }
    if (sc === 'snow') for (let i = 0; i < 30; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 8), M(0x2f5d48)); t.position.set((rng() < .5 ? -1 : 1) * (W / 2 + 18 + rng() * 30), 2.5, -rng() * L); scene.add(t); }
    if (sc === 'neon') { const grid = new THREE.GridHelper(600, 120, 0xff3fd0, 0x3a1466); grid.position.set(0, -.02, -L / 2); scene.add(grid); }
    // ป้ายข้างสนามเป็นชื่อผู้เล่น (F-11) — ใส่ภายหลังโดย race()
    return { W, crowd, crowdBase, sun, hemi };
  }

  // ---------------------------------------------------------------------------
  //  แผนการวิ่ง (deterministic จาก runSeed)
  // ---------------------------------------------------------------------------
  function plan(run) {
    const rng = mulberry(run.runSeed || 1);
    const n = run.order.length;
    const T = []; T[0] = 6.6 + rng() * .3;
    for (let i = 1; i < n; i++) T[i] = T[i - 1] + (i === 1 && rng() < .4 ? .05 + rng() * .08 : .12 + rng() * .5);
    const maxT = 8.8; if (T[n - 1] > maxT) { const k = (maxT - T[0]) / (T[n - 1] - T[0]); for (let i = 1; i < n; i++) T[i] = T[0] + (T[i] - T[0]) * k; }
    const finishOf = {}; run.order.forEach((pid, i) => { finishOf[pid] = T[i]; });
    const lanes = run.lanes.map(l => {
      const Ti = finishOf[l.pid], boost = l.boost || 0;
      const d = boost ? CFG.NITRO_BOOST_MIN_S + CFG.NITRO_BOOST_PER_COIN_S * boost : 0;
      const t0 = boost ? 1.2 + rng() * Math.max(.2, Ti - d - 1.8) : Infinity;
      return { ...l, T: Ti, d, t0, B: boost ? .12 + .03 * boost : 0, A: .015 + rng() * .02, k: 1 + Math.floor(rng() * 3), ph: rng() * Math.PI * 2 };
    });
    const sStart = T[0] - .45, sEnd = T[0] + .35, f = CFG.SLOWMO_FACTOR;
    const realOf = tau => tau <= sStart ? tau : tau <= sEnd ? sStart + (tau - sStart) / f : sStart + (sEnd - sStart) / f + (tau - sEnd);
    const tauOf = real => real <= sStart ? real : real <= sStart + (sEnd - sStart) / f ? sStart + (real - sStart) * f : sEnd + (real - sStart - (sEnd - sStart) / f);
    return { lanes, T, tauOf, realOf, slow: [sStart, sEnd], aerial: [2.6, 3.4], rng };
  }
  // ระยะทาง 0…1 ของเลนที่เวลา τ (ก่อน T = เส้นชัย) — โมโนโทนเสมอ
  function frac(l, tau) {
    if (tau <= 0) return 0;
    if (tau >= l.T) return 1 + (1 - Math.exp(-(tau - l.T) * 1.2)) * .07;
    const u = tau / l.T;
    const S = l.B ? smooth(l.t0, l.t0 + l.d, tau) : 0;
    return u + l.B * (S - u) + l.A * Math.sin(Math.PI * u * l.k + l.ph) * Math.sin(Math.PI * u);
  }

  // ---------------------------------------------------------------------------
  //  การแข่ง
  // ---------------------------------------------------------------------------
  /**
   * @param host element ที่จะวาง
   * @param run {no, order, lanes[{pid, cardId, modelId, boost}], runSeed, scene, event, sudden}
   * @param ctx {me, players: Map(pid → {name, color, crown, streak}), artUrl(cardId), runAt(server ms), now() server ms, sound(name, opt), vibrate(p), ticker(text, color), onFail()}
   */
  function race(host, run, ctx) {
    if (!hasGL) { ctx.onFail && ctx.onFail(); return null; }
    const P = plan(run);
    const r = renderer();
    const el = document.createElement('div'); el.className = 'r3d';
    el.innerHTML = `<div class="r3d-labels"></div><canvas class="r3d-fx"></canvas><div class="r3d-cd" aria-live="assertive"></div><div class="r3d-photo" hidden>PHOTO FINISH</div><div class="r3d-flash"></div><div class="r3d-ticker"></div>`;
    el.prepend(r.domElement); r.domElement.className = 'r3d-gl';
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(60, 1, .1, 900);
    const n = run.lanes.length;
    const T = buildTrack(scene, run.scene, run.event, n, P.rng);
    // เลน: เรียงตามที่นั่งจากเลขรอบ (เหมือน v3)
    const laneX = i => (i - (n - 1) / 2) * LANE;
    const cars = P.lanes.map((l, i) => { // P.lanes = run.lanes + แผนการวิ่ง (T, t0, d, B, …)
      const pl = ctx.players.get(l.pid) || { name: '?', color: '#ccc' };
      const grp = new THREE.Group(); grp.position.set(laneX(i), 0, 0);
      if (run.event === 'reverse') grp.rotation.y = Math.PI;
      scene.add(grp);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 6), new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(pl.color), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = .03; grp.add(glow); // แสงใต้ท้อง (R-4.2-04)
      const c = { ...l, i, pl, grp, model: null, wheels: [], flames: null, flag: null, done: false, fx: 0, rankNow: i + 1, label: null, hop: 0 };
      makeModel(l.modelId).then(m => {
        c.model = m; grp.add(m.obj); c.wheels = m.wheels;
        // ธงสีผู้เล่น
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd })); pole.position.set(.7, m.labelY - .1, m.rearZ - .5); grp.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(.8, .5), new THREE.MeshBasicMaterial({ color: new THREE.Color(pl.color), side: THREE.DoubleSide })); flag.position.set(1.1, m.labelY + .35, m.rearZ - .5); grp.add(flag); c.flag = flag;
        if (pl.crown) { const crown = new THREE.Mesh(new THREE.CylinderGeometry(.45, .35, .4, 5, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: .7, roughness: .3, side: THREE.DoubleSide })); crown.position.set(0, m.labelY - .1, 0); grp.add(crown); }
        // เปลวไฟ Nitro ยาวตามจำนวน Coins
        const fl = new THREE.Group(); fl.visible = false;
        const dark = run.event === 'reverse', fr = run.event === 'frenzy';
        const mk = (color, rad, op, blend) => { const g = new THREE.ConeGeometry(rad, 2, 14, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 1); return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: blend, depthWrite: false, side: THREE.DoubleSide })); };
        const blend = dark ? THREE.NormalBlending : THREE.AdditiveBlending;
        const outer = mk(dark ? 0x222222 : fr ? 0x9b5bff : 0xff7a1a, .42, dark ? .7 : .85, blend), inner = mk(dark ? 0x555555 : fr ? 0x6fe9ff : 0x6fe9ff, .22, .95, blend);
        fl.add(outer, inner); fl.position.set(0, Math.min(1.2, m.labelY * .3), m.rearZ); grp.add(fl); c.flames = fl;
      });
      const lab = document.createElement('div'); lab.className = 'r3d-tag'; lab.style.setProperty('--c', pl.color);
      lab.innerHTML = `<img alt="" src="${esc(ctx.artUrl(l.cardId))}" onerror="this.style.visibility='hidden'"><span class="rk">P${i + 1}</span><span class="nm">${esc(pl.name)}</span>${l.pid === ctx.me ? '<span class="you">คุณ</span>' : ''}<span class="slot" hidden>?</span>`;
      el.querySelector('.r3d-labels').appendChild(lab); c.label = lab;
      // ป้ายข้างสนามชื่อผู้เล่น (F-11)
      const b = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: nameBoard(pl.name, pl.color) }));
      const side = i % 2 ? 1 : -1; b.position.set(side * (T.W / 2 + 1.6), 1.1, -30 - i * 28); b.rotation.y = -side * Math.PI / 2; scene.add(b);
      return c;
    });
    const mine = cars.find(c => c.pid === ctx.me) || null;
    // ---- particles: ควันสีผู้เล่น / ประกาย Nitro / ฝน / หิมะ / เหรียญ ----
    const NP = 900, pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pv = Array.from({ length: NP }, () => ({ life: 0 }));
    const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .4, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex() }));
    scene.add(points); let pi = 0;
    const emit = (x, y, z, vx, vy, vz, c, life) => { const i = pi = (pi + 1) % NP; pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; Object.assign(pv[i], { life, max: life, vx, vy, vz, r: c.r, g: c.g, b: c.b }); };
    const stepP = dt => { for (let i = 0; i < NP; i++) { const q = pv[i]; if (q.life <= 0) { pPos[i * 3 + 1] = -99; continue; } q.life -= dt; const k = Math.max(0, q.life / q.max); pPos[i * 3] += q.vx * dt; pPos[i * 3 + 1] += q.vy * dt; pPos[i * 3 + 2] += q.vz * dt; pCol[i * 3] = q.r * k; pCol[i * 3 + 1] = q.g * k; pCol[i * 3 + 2] = q.b * k; } pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; };
    // อากาศ (ฝน/หิมะ/เหรียญ) เป็นชุดแยก
    let weather = null;
    const wKind = run.event === 'rain' ? 'rain' : run.event === 'double' ? 'coin' : run.scene === 'snow' ? 'snow' : null;
    if (wKind && !reduce) {
      const WN = wKind === 'rain' ? 1400 : 600, wp = new Float32Array(WN * 3);
      for (let i = 0; i < WN; i++) { wp[i * 3] = (P.rng() - .5) * 60; wp[i * 3 + 1] = P.rng() * 30; wp[i * 3 + 2] = -P.rng() * 80; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(wp, 3));
      const mat = new THREE.PointsMaterial({ size: wKind === 'rain' ? .22 : wKind === 'coin' ? .5 : .3, color: wKind === 'rain' ? 0xcfe3ff : wKind === 'coin' ? 0xffd24a : 0xffffff, transparent: true, opacity: .85, depthWrite: false });
      weather = { pts: new THREE.Points(g, mat), wp, WN, fall: wKind === 'rain' ? 38 : wKind === 'coin' ? 9 : 4 }; scene.add(weather.pts);
    }
    // ไฟไซเรน (Nitro Ban) / สปอตไลต์ + ถ้วย (Winner Takes All)
    const sirens = [];
    if (run.event === 'ban') [0xff2a2a, 0x2a6bff].forEach((c, i) => { const l = new THREE.PointLight(c, 2.2, 60); l.position.set((i ? 1 : -1) * (T.W / 2 + 6), 8, -40); scene.add(l); sirens.push(l); });
    if (run.event === 'wta') {
      const gold = new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: .8, roughness: .25 });
      const cup = new THREE.Group();
      const at = (m, y) => { m.position.set(0, y, 0); cup.add(m); };
      at(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1, 3, 24, 1, true), gold), 2.5);
      at(new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 1.6, 12), gold), .4);
      at(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, .5, 24), gold), -.5);
      [-1, 1].forEach(sd => { const h = new THREE.Mesh(new THREE.TorusGeometry(.8, .15, 8, 16), gold); h.position.set(sd * 2.3, 2.8, 0); h.rotation.y = Math.PI / 2; cup.add(h); });
      cup.position.set(0, 12, -L - 2); scene.add(cup); sirens.push(cup);
    }
    if (run.event === 'reverse') for (let z = -10; z > -L; z -= 18) { const a = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 3), new THREE.MeshBasicMaterial({ color: 0xb77bff })); a.rotation.x = Math.PI / 2; a.position.set(0, .05, z); a.scale.y = .1; scene.add(a); }

    // ---- 2D fx: เส้นความเร็ว ----
    const fx = el.querySelector('.r3d-fx'), fg = fx.getContext('2d');
    const flashEl = el.querySelector('.r3d-flash'), cdEl = el.querySelector('.r3d-cd'), photoEl = el.querySelector('.r3d-photo'), tickEl = el.querySelector('.r3d-ticker');
    const tick = (text, color) => { const d = document.createElement('div'); d.className = 'tk'; if (color) d.style.setProperty('--c', color); d.textContent = text; tickEl.appendChild(d); while (tickEl.children.length > 3) tickEl.firstChild.remove(); setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 2400); };

    const COUNT = CFG.RACE_COUNTDOWN_SECONDS * 1000;
    let last = null, raf = null, dead = false, shake = 0, fovKick = 0, crowdWave = 0, lastTickRank = -9, lastCd = null, flashed = false, slowSoundDone = false, goDone = false;
    const camPos = new THREE.Vector3(), look = new THREE.Vector3(), lookCur = new THREE.Vector3(0, 1, -10);
    let prevRanks = null;
    function resize() {
      const w = el.clientWidth || 360, h = el.clientHeight || 520;
      if (r.domElement.width !== Math.round(w * r.getPixelRatio()) || r.domElement.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      const k = window.devicePixelRatio || 1; if (fx.width !== Math.round(w * k)) { fx.width = w * k; fx.height = h * k; }
    }
    const v3 = new THREE.Vector3();
    function frame() {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      if (!document.body.contains(el)) return;
      resize();
      const now = ctx.now(), real = (now - ctx.runAt - COUNT) / 1000; // วินาทีหลังไฟเขียว
      const dt = last == null ? 0 : Math.min(.05, (now - last) / 1000); last = now;
      const tau = P.tauOf(Math.max(0, real));
      const slow = tau > P.slow[0] && tau < P.slow[1];
      // นับถอยหลัง + เสียงเบิ้ลเครื่อง
      const cdText = real < 0 ? String(Math.ceil(-real)) : real < .7 ? 'GO!' : '';
      if (cdText !== lastCd) {
        lastCd = cdText; cdEl.textContent = cdText; cdEl.classList.remove('beat'); void cdEl.offsetWidth; if (cdText) cdEl.classList.add('beat');
        if (cdText && cdText !== 'GO!') { ctx.sound('beep'); ctx.sound('rev'); }
        if (cdText === 'GO!' && !goDone) { goDone = true; ctx.sound('go'); ctx.sound('engineStart'); ctx.vibrate(60); tick('ไฟเขียว! ออกตัวแล้ว'); }
      }
      // ตำแหน่งรถ
      const ranks = cars.slice().sort((a, b) => frac(b, tau) - frac(a, tau));
      ranks.forEach((c, i) => { c.rankNow = i + 1; });
      for (const c of cars) {
        const f = frac(c, tau), z = -f * L, prevZ = c.grp.position.z;
        c.grp.position.z = z;
        const sp = dt ? Math.abs(z - prevZ) / dt : 0;
        c.wheels.forEach(w => { w.rotation.x -= (run.event === 'reverse' ? -1 : 1) * sp * dt / .5; });
        const boosting = tau >= c.t0 && tau < c.t0 + c.d;
        if (c.flames) {
          c.flames.visible = boosting;
          if (boosting) {
            const L0 = (.6 + c.boost * .45) * (run.event === 'frenzy' ? 2 : 1); c.flames.children.forEach((m, k) => m.scale.set(1, 1, L0 * (.85 + Math.random() * .3) * (k ? .7 : 1)));
            if (!reduce) for (let k = 0; k < 2; k++) emit(c.grp.position.x + (Math.random() - .5) * .8, .8, z + (c.model ? c.model.rearZ : 2), (Math.random() - .5) * 2, Math.random() * 2, 8, run.event === 'reverse' ? { r: .3, g: .3, b: .3 } : { r: 1, g: .6, b: .2 }, .35);
          }
        }
        if (boosting && !c.fx) { // จุด Nitro
          c.fx = 1; tick(`${c.pl.name} จุด NITRO!`, c.pl.color); crowdWave = 1;
          if (c === mine) { ctx.sound('nitro', { len: c.d }); ctx.vibrate([40, 30, 80]); if (!reduce) { shake = .25 + c.boost * .07; fovKick = 4 + c.boost * 2; } }
          else ctx.sound('nitroFar');
        }
        // ควันสีผู้เล่น (F-13)
        if (real > 0 && !reduce && Math.random() < .5 && f < 1.02) { const col = new THREE.Color(c.pl.color); emit(c.grp.position.x + (Math.random() - .5) * 1.2, .35, z + 2.2, (Math.random() - .5), Math.random() * .6, 2.5, { r: col.r * .55, g: col.g * .55, b: col.b * .55 }, .9); }
        // เข้าเส้นชัย
        if (!c.done && tau >= c.T) {
          c.done = true; c.label.classList.add('done');
          const rank = run.order.indexOf(c.pid) + 1;
          if (rank === 1) { tick(`${c.pl.name} เข้าเส้นชัยเป็นอันดับ 1`, c.pl.color); ctx.sound('finish'); }
          if (c === mine) ctx.vibrate(50);
          if (run.event === 'lucky') { const s = c.label.querySelector('.slot'); s.hidden = false; s.classList.add('spin'); setTimeout(() => s.classList.remove('spin'), 1400); }
        }
        // ท่าดีใจ/เศร้าหลังเข้าเส้นชัย
        if (c.done) {
          const rank = run.order.indexOf(c.pid) + 1, since = tau - c.T;
          if (rank === 1 && c.model) { c.model.obj.position.y = Math.abs(Math.sin(since * 5)) * .8 * Math.max(0, 1 - since / 3); c.model.obj.rotation.y = Math.min(Math.PI * 2, since * 4); }
          if (rank === n && n > 1 && c.model) { c.model.obj.rotation.z = Math.min(.18, since * .3); if (!reduce && Math.random() < .3) emit(c.grp.position.x, 1.6, c.grp.position.z + 1, (Math.random() - .5) * .5, 1.2, .5, { r: .35, g: .35, b: .38 }, 1.4); }
        }
        if (c.flag) c.flag.rotation.y = Math.sin(now / 120 + c.i) * .3;
      }
      // แซง (top 2) → ผู้พากย์ + ฝูงชน
      if (prevRanks && real > .8 && tau - lastTickRank > .9) {
        for (const c of cars) { const pr = prevRanks.get(c.pid); if (pr && c.rankNow < pr && c.rankNow <= 2 && !c.done) { tick(`${c.pl.name} แซงขึ้นที่ ${c.rankNow}!`, c.pl.color); lastTickRank = tau; crowdWave = 1; break; } }
      }
      prevRanks = new Map(cars.map(c => [c.pid, c.rankNow]));
      // ฝูงชนโบกมือ
      if (crowdWave > 0) {
        const d = new THREE.Object3D();
        for (let i = 0; i < T.crowdBase.length; i++) { const b = T.crowdBase[i]; d.position.set(b.x, b.y + Math.max(0, Math.sin(now / 90 + i * .7)) * .5 * crowdWave, b.z); d.updateMatrix(); T.crowd.setMatrixAt(i, d.matrix); }
        T.crowd.instanceMatrix.needsUpdate = true; crowdWave = Math.max(0, crowdWave - dt * .9);
      }
      // เล่นช้าใกล้เส้นชัย + photo finish (C2)
      if (slow && !slowSoundDone) { slowSoundDone = true; ctx.sound('slowmo'); }
      const gap = P.T[1] != null ? P.T[1] - P.T[0] : 9;
      if (!flashed && tau >= P.T[0] && gap < .15) { flashed = true; flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); photoEl.hidden = false; ctx.sound('camera'); setTimeout(() => { photoEl.hidden = true; }, 1600); }
      // อากาศ / ไซเรน / ฟ้าแลบ
      if (weather) { const wp = weather.wp, base = (mine || ranks[0]).grp.position.z; for (let i = 0; i < weather.WN; i++) { wp[i * 3 + 1] -= weather.fall * dt; if (wp[i * 3 + 1] < 0) { wp[i * 3 + 1] = 25 + Math.random() * 5; wp[i * 3 + 2] = base - Math.random() * 70 + 10; } } weather.pts.geometry.attributes.position.needsUpdate = true; }
      sirens.forEach((s, i) => { if (s.isLight) s.intensity = 1.2 + Math.sin(now / 160 + i * Math.PI) * 1.2; else s.rotation.y += dt; });
      if (run.event === 'rain' && !reduce) T.sun.intensity = Math.random() < .004 ? 4 : T.sun.intensity > 1 ? T.sun.intensity * .85 : .8;
      // กล้อง
      const target = mine || ranks[0];
      const tz = target.grp.position.z, tx = target.grp.position.x;
      if (real < 0) { // แพนรอบเส้นสตาร์ท
        const a = (real + COUNT / 1000) / (COUNT / 1000);
        camPos.set(Math.cos(a * 1.6 + .3) * 22, 6 + a * 2, 10 - a * 2 + Math.sin(a * 1.6 + .3) * 10); look.set(0, 1, -4);
        cam.position.copy(camPos); lookCur.copy(look);
      } else {
        if (tau > P.slow[0] && P.realOf(tau) < P.realOf(P.slow[1]) + .6) { camPos.set(T.W / 2 + 6, 7, -L + 7); look.set(-T.W / 6, .5, -L - 1); } // มุมเส้นชัย
        else if (tau > P.aerial[0] && tau < P.aerial[1]) { camPos.set(tx * .3, 34, tz + 6); look.set(0, 0, tz - 16); } // มุมบนฟ้า
        else { camPos.set(tx * .45, 6.5, tz + 15); look.set(tx * .3, 1, tz - 14); }
        const k = 1 - Math.pow(.02, dt || .016);
        const cut = cam.position.distanceTo(camPos) > 40;
        if (cut) cam.position.copy(camPos); else cam.position.lerp(camPos, k);
        if (cut) lookCur.copy(look); else lookCur.lerp(look, k * 1.4);
      }
      cam.lookAt(lookCur);
      if (shake > 0) { cam.position.x += (Math.random() - .5) * shake; cam.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - dt * .8); }
      cam.fov = 60 + fovKick; fovKick = Math.max(0, fovKick - dt * 9); cam.updateProjectionMatrix();
      stepP(dt * (slow ? CFG.SLOWMO_FACTOR : 1));
      ctx.engine && ctx.engine(real > 0 && tau < P.T[n - 1] + .5 ? 20 + 18 * (mine && tau >= mine.t0 && tau < mine.t0 + mine.d ? 1 : 0) : 0);
      r.render(scene, cam);
      // ป้ายเหนือรถ: การ์ด 84 → 48 px (C4), อันดับสด
      const w = el.clientWidth, h = el.clientHeight, small = real > 0;
      for (const c of cars) {
        if (!c.model) continue;
        v3.copy(c.grp.position); v3.y += c.model.labelY + .2; v3.project(cam);
        const vis = v3.z < 1 && v3.x > -1.3 && v3.x < 1.3 && v3.y < 1.2;
        c.label.style.display = vis ? '' : 'none';
        c.label.style.transform = `translate(${(v3.x * .5 + .5) * w}px,${(-v3.y * .5 + .5) * h}px) translate(-50%,-100%)`;
        c.label.classList.toggle('small', small);
        const rk = c.label.querySelector('.rk'), txt = real > 0 ? ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][c.rankNow - 1] : 'P' + (c.i + 1);
        if (rk.textContent !== txt) rk.textContent = txt;
      }
      // เส้นความเร็วเมื่อรถตัวเองจุด Nitro
      fg.clearRect(0, 0, fx.width, fx.height);
      if (mine && !reduce && tau >= mine.t0 && tau < mine.t0 + mine.d) {
        const W2 = fx.width, H2 = fx.height, cx = W2 / 2, cy = H2 * .45; fg.save(); fg.globalAlpha = .2 + mine.boost * .05; fg.strokeStyle = '#cfefff'; fg.lineWidth = 2 * (window.devicePixelRatio || 1);
        for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, r0 = Math.min(W2, H2) * (.32 + Math.random() * .2), r1 = r0 + Math.min(W2, H2) * (.12 + Math.random() * .3); fg.beginPath(); fg.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); fg.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); fg.stroke(); }
        fg.restore();
      }
    }
    host.appendChild(el);
    raf = requestAnimationFrame(frame);
    return {
      el,
      destroy() {
        dead = true; if (raf) cancelAnimationFrame(raf);
        ctx.engine && ctx.engine(0);
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map && m.map !== glowTex()) m.map.dispose(); m.dispose(); }); });
        el.remove();
      }
    };
  }

  window.Race3D = { hasGL, setCatalog, preload, viewer, race, meta: id => META.get(id), all: () => [...META.values()] };
  window.__make = makeModel; // ใช้ตอนสร้างภาพย่อโมเดล (เครื่องมือของผู้พัฒนา)
})();
