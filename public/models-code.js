// โมเดลรถที่สร้างจากโค้ด 34 แบบ (สัตว์ 28 + รถแข่ง 6) — spec v2.0 หัวข้อ 4.2
// BNRL_MODELS.build(file) → THREE.Group หัวรถชี้ไปทาง −z, userData.wheels = ล้อที่หมุนได้
(function () {
  'use strict';
  const THREE = window.THREE;
  const mats = {};
  const M = (c, o = {}) => { const k = c + JSON.stringify(o); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .55, metalness: .1 }, o))); };
  const B = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const S = (r, m, sx = 1, sy = 1, sz = 1) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m); s.scale.set(sx, sy, sz); return s; };
  const C = (rt, rb, h, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  const K = (r, h, m, seg = 14) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  const T = (pts, r, m) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 24, r, 10, false), m);
  const P = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
  const tyre = M(0x15171b, { roughness: .9 }), hubM = M(0xc9d0d8, { metalness: .7, roughness: .3 }), eyeW = M(0xffffff), eyeB = M(0x111111), pink = M(0xff9fb3);
  function addWheel(g, x, y, z, r, w) {
    const wg = new THREE.Group();
    const t = C(r, r, w, tyre, 18); t.rotation.z = Math.PI / 2; wg.add(t);
    const h = C(r * .45, r * .45, w + .02, hubM, 10); h.rotation.z = Math.PI / 2; wg.add(h);
    const sp = B(w + .04, r * 1.3, r * .18, hubM); wg.add(sp); // ซี่ล้อ ให้เห็นว่าหมุน
    wg.position.set(x, y, z); g.add(wg); (g.userData.wheels || (g.userData.wheels = [])).push(wg);
  }
  function wheels(g, xs, zs, r, w = .4) { xs.forEach(x => zs.forEach(z => addWheel(g, x, r, z, r, w))); }
  function eyes(g, x, y, z, r = .16) { [-x, x].forEach(ex => { g.add(P(S(r, eyeW), ex, y, z)); g.add(P(S(r * .55, eyeB), ex, y, z - r * .7)); }); }

  const ANIMALS = {

 turtle:{th:'เต่า',card:'เต่าเทอร์โบ',f(g){ const shell=M(0x3f8f4a), skin=M(0x9bcf6a);
   g.add(P(B(2.1,.35,3.8,skin),0,.75,0)); const d=S(1.45,shell,1,.62,1.35); d.position.set(0,1,.1); g.add(d);
   [[0,1.85,.1],[.7,1.6,-.8],[-.7,1.6,-.8],[.7,1.6,1],[-.7,1.6,1]].forEach(p=>g.add(P(S(.38,M(0x2c6b35),1,.35,1),...p)));
   g.add(P(C(.28,.32,.8,skin),0,1.05,-2.1,Math.PI/2.6)); g.add(P(S(.5,skin,1,.85,1.1),0,1.4,-2.55)); eyes(g,.22,1.6,-2.95,.1);
   g.add(P(K(.18,.6,skin),0,.8,2.2,Math.PI/2)); wheels(g,[-1.15,1.15],[-1.3,1.3],.48); }},
 snail:{th:'หอยทาก',card:'หอยทากเทอร์โบ',f(g){ const body=M(0xd9b27c), sh=M(0xc0623a), sh2=M(0xe8935f);
   g.add(P(B(1.4,.45,4.2,body),0,.65,0)); g.add(P(S(.62,body,1,.9,1.2),0,1.05,-2));
   const t1=new THREE.Mesh(new THREE.TorusGeometry(1.05,.42,14,30),sh); t1.position.set(0,1.95,.6); t1.rotation.y=Math.PI/2; g.add(t1);
   const t2=new THREE.Mesh(new THREE.TorusGeometry(.52,.26,12,24),sh2); t2.position.set(.18,2.05,.55); t2.rotation.y=Math.PI/2; g.add(t2); g.add(P(S(.22,sh),.32,2.1,.55));
   [-.25,.25].forEach(x=>{ g.add(P(C(.05,.05,.9,body,8),x,1.85,-2.3,-.4)); g.add(P(S(.13,eyeB),x,2.3,-2.5)); });
   wheels(g,[-.95,.95],[-1.4,1.4],.42); }},
 crab:{th:'ปู',card:'ปูยักษ์เรซซิ่ง',f(g){ const red=M(0xe2483a), lt=M(0xf47a5c);
   g.add(P(S(1.5,red,1.1,.45,.95),0,1.05,0));
   [-1,1].forEach(s=>{ g.add(P(C(.14,.14,1.3,lt,8),s*1.2,1.05,-1.5,Math.PI/2.4,0,s*.5)); g.add(P(S(.55,red,1,.7,1.2),s*1.5,1.15,-2.35));
     g.add(P(K(.22,.8,lt),s*1.25,1.3,-2.95,-Math.PI/2)); g.add(P(K(.22,.8,lt),s*1.75,1.3,-2.95,-Math.PI/2));
     for(let k=0;k<3;k++) g.add(P(C(.07,.07,1.2,red,6),s*1.85,1,-.4+k*.6,0,0,s*1.0)); });
   [-.35,.35].forEach(x=>{ g.add(P(C(.05,.05,.5,red,6),x,1.65,-1.05)); g.add(P(S(.13,eyeB),x,1.92,-1.05)); });
   wheels(g,[-1.25,1.25],[-.9,1.2],.42); }},
 kraken:{th:'คราเคน',card:'คราเคน GT',f(g){ const pu=M(0x7a3fb8), lt=M(0xb07ae6);
   g.add(P(B(1.8,.45,3.4,pu),0,.7,-.3)); g.add(P(S(1.05,pu,1,1.35,1.05),0,2.05,.6)); eyes(g,.42,2.1,-.35,.2);
   for(let k=0;k<6;k++){ const a=(k/6)*Math.PI*2; const x=Math.cos(a)*.9, z=.8+Math.sin(a)*.6;
     g.add(T([[x*.6,1.2,z],[x*1.3,.6,z+.5],[x*1.6,.4,z+1.3],[x*1.2,.8,z+1.8]],.17,k%2?lt:pu)); }
   wheels(g,[-1.05,1.05],[-1.5,.6],.45); }},
 cow:{th:'วัว / ควาย',card:'วัวซูเปอร์คาร์',f(g){ const w=M(0xf3f3ef), bk=M(0x1e1e1e), horn=M(0xe9d9b0);
   g.add(P(B(2,1.05,3.8,w),0,1.1,0)); [[.6,1.4,.6],[-.5,1.2,-.7],[.2,1.65,1.2],[-.7,1.5,1.3]].forEach(p=>g.add(P(S(.42,bk,1,.25,1.3),...p)));
   g.add(P(B(1.3,1,1.1,w),0,1.75,-2.2)); g.add(P(B(1.1,.5,.4,pink),0,1.4,-2.8)); eyes(g,.35,2.0,-2.75,.12);
   [-1,1].forEach(s=>{ g.add(P(T([[s*.5,2.2,-2.2],[s*1.0,2.4,-2.2],[s*1.15,2.85,-2.35]],.09,horn),0,0,0)); g.add(P(S(.22,w,1.4,.4,.8),s*.82,1.95,-2.0)); });
   wheels(g,[-1.1,1.1],[-1.3,1.3],.5); }},
 pig:{th:'หมูมีปีก',card:'หมูติดปีก',f(g){ const pk=M(0xffaec3), wh=M(0xffffff);
   g.add(P(S(1.35,pk,.9,.85,1.55),0,1.35,0)); g.add(P(C(.38,.38,.35,M(0xff8aa8)),0,1.4,-2.15,Math.PI/2)); eyes(g,.4,1.85,-1.85,.13);
   [-1,1].forEach(s=>{ g.add(P(K(.28,.5,pk),s*.55,2.45,-1.3,-.3,0,s*-.3)); const wg=B(1.6,.08,.9,wh); wg.position.set(s*1.75,1.9,.1); wg.rotation.z=s*.5; g.add(wg); const wg2=B(1.2,.08,.6,wh); wg2.position.set(s*1.9,2.05,.6); wg2.rotation.z=s*.6; g.add(wg2); });
   const tl=new THREE.Mesh(new THREE.TorusGeometry(.18,.05,8,16,Math.PI*1.6),pk); tl.position.set(0,1.6,2.1); g.add(tl);
   wheels(g,[-1,1],[-1.1,1.2],.45); }},
 fox:{th:'จิ้งจอก 9 หาง',card:'จิ้งจอก 9 หางเจ็ต',f(g){ const or=M(0xf07c24), wh=M(0xfff5e8), dk=M(0x3a2414);
   g.add(P(B(1.6,.7,3.4,or),0,1,0)); g.add(P(S(.62,or,1,.95,1),0,1.65,-1.75)); g.add(P(K(.32,.8,wh),0,1.5,-2.45,-Math.PI/2)); g.add(P(S(.1,dk),0,1.5,-2.85));
   eyes(g,.25,1.85,-2.15,.1); [-1,1].forEach(s=>g.add(P(K(.22,.6,or),s*.32,2.35,-1.7)));
   for(let k=0;k<9;k++){ const a=-1.0+k*.25; const tl=new THREE.Group(); const c=K(.26,1.9,or); c.position.y=.95; tl.add(c); const tip=K(.14,.5,wh); tip.position.y=2.0; tl.add(tip); tl.position.set(0,1.2,1.6); tl.rotation.set(1.0,0,a); g.add(tl); }
   wheels(g,[-1,1],[-1.2,1.2],.45); }},
 rabbit:{th:'กระต่าย',card:'กระต่ายเจ็ต',f(g){ const w=M(0xf6f2ee), gr=M(0x6b7380);
   g.add(P(S(1.2,w,.85,.7,1.6),0,1.15,0)); g.add(P(S(.62,w),0,1.75,-1.75)); g.add(P(S(.1,pink),0,1.7,-2.37)); eyes(g,.26,1.95,-2.2,.11);
   [-1,1].forEach(s=>{ const e=S(.22,w,1,4.2,.6); e.position.set(s*.25,2.95,-1.6); e.rotation.z=s*-.15; g.add(e); const ei=S(.12,pink,1,3.6,.4); ei.position.set(s*.25,2.95,-1.72); ei.rotation.z=s*-.15; g.add(ei);
     const j=C(.32,.42,1.3,gr); j.rotation.x=Math.PI/2; j.position.set(s*.75,1.2,1.7); g.add(j); });
   g.add(P(S(.3,w),0,1.4,1.95)); wheels(g,[-1,1],[-1.2,1.1],.42); }},
 frog:{th:'กบ',card:'กบ No.8',f(g){ const gr=M(0x46b04a), lt=M(0xc6e88a);
   g.add(P(S(1.4,gr,1,.5,1.45),0,1,0)); g.add(P(S(1.2,lt,.8,.3,1.1),0,.85,-.3));
   [-1,1].forEach(s=>{ g.add(P(S(.42,gr),s*.65,1.75,-1.2)); g.add(P(S(.3,eyeW),s*.65,1.85,-1.45)); g.add(P(S(.17,eyeB),s*.65,1.88,-1.68)); g.add(P(S(.45,gr,.6,.6,1.4),s*1.3,.9,1.1)); });
   const mo=new THREE.Mesh(new THREE.TorusGeometry(.7,.05,6,20,Math.PI),M(0x1d4d20)); mo.position.set(0,1.1,-1.85); mo.rotation.set(Math.PI/2.2,0,Math.PI); g.add(mo);
   wheels(g,[-1.15,1.15],[-1.1,1.2],.42); }},
 goose:{th:'ห่าน',card:'ห่าน GT',f(g){ const w=M(0xf7f7f2), ob=M(0xff9b1f);
   g.add(P(S(1.25,w,.85,.62,1.6),0,1.1,.2)); g.add(T([[0,1.5,-1.3],[0,2.2,-1.7],[0,2.9,-1.6],[0,3.2,-1.9]],.24,w)); g.add(P(S(.36,w),0,3.25,-2.0));
   g.add(P(K(.16,.6,ob),0,3.18,-2.55,-Math.PI/2)); eyes(g,.2,3.38,-2.2,.08);
   [-1,1].forEach(s=>{ const wg=S(.8,M(0xdedcd6),.25,.45,1.4); wg.position.set(s*1.0,1.4,.4); g.add(wg); });
   g.add(P(K(.4,.7,w),0,1.4,2.2,Math.PI/2.4)); wheels(g,[-1,1],[-1.1,1.3],.42); }},
 mammoth:{th:'แมมมอธ',card:'แมมมอธ Hyper Turbo',f(g){ const br=M(0x7a4a2c), dk=M(0x5a3420), tusk=M(0xf2ead5);
   g.add(P(S(1.5,br,.95,.75,1.4),0,1.7,.3)); g.add(P(S(.9,dk,1,.9,.9),0,2.05,-1.7)); eyes(g,.42,2.3,-2.4,.11);
   g.add(T([[0,1.9,-2.45],[0,1.2,-2.75],[0,.6,-2.6],[0,.5,-2.3]],.2,dk));
   [-1,1].forEach(s=>{ g.add(T([[s*.4,1.6,-2.3],[s*.55,1.0,-2.9],[s*.5,1.25,-3.4],[s*.3,1.7,-3.5]],.1,tusk)); g.add(P(S(.45,dk,.3,1,1),s*.9,2.2,-1.5)); });
   wheels(g,[-1.25,1.25],[-1.2,1.4],.68,.55); }},
 shark:{th:'ฉลาม',card:'(ไม่มีการ์ด)',f(g){ const gy=M(0x6f8394), wb=M(0xe9eef2);
   const bd=C(.85,.95,3.4,gy,20); bd.rotation.x=Math.PI/2; bd.position.set(0,1.15,.2); g.add(bd);
   g.add(P(K(.85,1.4,gy,20),0,1.15,-2.25,-Math.PI/2)); g.add(P(S(.85,wb,1,.45,2.2),0,.85,-.2));
   g.add(P(K(.5,1.3,gy,4),0,2.2,0,0,Math.PI/4,0)); const tf=B(.12,1.5,.7,gy); tf.position.set(0,1.6,2.2); tf.rotation.x=-.4; g.add(tf); const tf2=B(.12,.9,.6,gy); tf2.position.set(0,.7,2.1); tf2.rotation.x=.5; g.add(tf2);
   [-1,1].forEach(s=>{ const f=B(1.1,.1,.6,gy); f.position.set(s*1.1,.9,-.6); f.rotation.z=s*-.4; g.add(f); g.add(P(S(.1,eyeB),s*.55,1.35,-1.95)); });
   for(let k=0;k<7;k++) g.add(P(K(.06,.18,eyeW,4),-.42+k*.14,.85,-2.6,Math.PI));
   wheels(g,[-1,1],[-1.2,1.3],.45); }},

 dog:{th:'หมา',f(g){ const b=M(0xc98a4b), w=M(0xf5e6d0), dk=M(0x5a3a20);
   g.add(P(B(1.7,.8,3.4,b),0,1.05,0)); g.add(P(S(.75,b),0,1.85,-1.8)); g.add(P(S(.42,w,1,.8,1.1),0,1.65,-2.4)); g.add(P(S(.13,dk),0,1.8,-2.85)); eyes(g,.3,2.1,-2.3,.11);
   [-1,1].forEach(s=>g.add(P(S(.3,dk,.5,1.3,.8),s*.72,1.75,-1.75,0,0,s*.25))); g.add(P(C(.08,.12,.9,b,8),0,1.7,1.9,-.9)); g.add(P(S(.5,M(0xd23a3a),1,.15,1),0,1.5,-1.4));
   wheels(g,[-1,1],[-1.2,1.2],.45); }},
 cat:{th:'แมว',f(g){ const gr=M(0x8a8f98), st=M(0x5c616a), w=M(0xf4f4f4);
   g.add(P(S(1.2,gr,.85,.6,1.55),0,1.15,0)); [-.4,.3,1].forEach(z=>g.add(P(B(1.5,.06,.25,st),0,1.62,z)));
   g.add(P(S(.72,gr),0,1.85,-1.75)); [-1,1].forEach(s=>{ g.add(P(K(.28,.55,gr,4),s*.38,2.5,-1.7,0,Math.PI/4,0)); for(let k=0;k<2;k++) g.add(P(C(.012,.012,.9,w,4),s*.55,1.7-k*.12,-2.35,0,0,Math.PI/2)); });
   g.add(P(S(.11,pink),0,1.78,-2.45)); eyes(g,.28,1.98,-2.3,.13); g.add(T([[0,1.3,1.7],[0,2.0,2.2],[0,2.7,2.0],[0,2.9,1.6]],.12,gr)); wheels(g,[-1,1],[-1.1,1.2],.42); }},
 panda:{th:'แพนด้า',f(g){ const w=M(0xf6f6f2), bk=M(0x1c1c1c);
   g.add(P(S(1.35,w,.95,.8,1.4),0,1.35,.1)); g.add(P(S(1.0,bk,1.15,.55,.6),0,1.35,-.4)); g.add(P(S(.85,w),0,2.15,-1.5));
   [-1,1].forEach(s=>{ g.add(P(S(.3,bk),s*.6,2.85,-1.4)); g.add(P(S(.22,bk,1,1.3,.5),s*.3,2.25,-2.2)); g.add(P(S(.08,eyeW),s*.3,2.28,-2.32)); });
   g.add(P(S(.12,bk),0,2.0,-2.33)); wheels(g,[-1.05,1.05],[-1.1,1.2],.48); }},
 penguin:{th:'เพนกวิน',f(g){ const bk=M(0x1f2833), w=M(0xf7f7f7), ob=M(0xffa41b);
   g.add(P(S(1.0,bk,1,1.5,1.05),0,1.9,0)); g.add(P(S(.8,w,.9,1.3,.6),0,1.75,-.5)); g.add(P(K(.2,.55,ob),0,2.85,-1.05,-Math.PI/2)); eyes(g,.3,3.1,-.85,.12);
   [-1,1].forEach(s=>{ const f=S(.5,bk,.25,1.1,.7); f.position.set(s*1.05,1.8,0); f.rotation.z=s*.35; g.add(f); g.add(P(S(.3,ob,1.2,.3,1.6),s*.4,.55,-.9)); });
   wheels(g,[-1,1],[-1.1,1.1],.42); }},
 elephant:{th:'ช้าง',f(g){ const gy=M(0x9aa5b1), dk=M(0x7d8794);
   g.add(P(S(1.45,gy,1,.8,1.4),0,1.7,.3)); g.add(P(S(.95,gy),0,2.1,-1.6)); eyes(g,.45,2.4,-2.35,.11);
   g.add(T([[0,1.9,-2.4],[0,1.2,-2.8],[0,.7,-2.9],[0,.75,-3.35]],.2,dk));
   [-1,1].forEach(s=>{ const e=S(.85,M(0xb7c0ca),.2,1,.95); e.position.set(s*.95,2.2,-1.35); e.rotation.y=s*.4; g.add(e); g.add(T([[s*.35,1.7,-2.3],[s*.45,1.2,-2.8],[s*.4,1.35,-3.15]],.08,M(0xf2ead5))); });
   wheels(g,[-1.2,1.2],[-1.1,1.4],.62,.5); }},
 giraffe:{th:'ยีราฟ',f(g){ const y=M(0xf2c14e), br=M(0xa0602a);
   g.add(P(S(1.1,y,.8,.62,1.5),0,1.4,.4));
   const neck=[[0,1.7,-.7],[0,2.6,-1.0],[0,3.4,-1.6],[0,3.9,-2.3]];
   g.add(T(neck,.27,y));
   [[0,2.25,-.85],[0,2.95,-1.25],[0,3.55,-1.8]].forEach(p=>g.add(P(S(.15,br,1.6,.6,.5),...p)));
   [[.55,1.85,.9],[-.5,1.85,0],[.15,1.95,1.4],[-.6,1.75,1.2],[.6,1.7,-.2]].forEach(p=>g.add(P(S(.24,br,1.1,.25,1),...p)));
   g.add(P(S(.42,y,.85,.75,1.35),0,4.0,-2.6)); g.add(P(S(.25,M(0xe0a94a),.9,.7,1),0,3.9,-3.1));
   eyes(g,.28,4.15,-2.75,.09);
   [-1,1].forEach(s=>{ g.add(P(C(.045,.045,.45,br,6),s*.16,4.45,-2.45)); g.add(P(S(.09,br),s*.16,4.7,-2.45)); g.add(P(K(.08,.3,y,6),s*.38,4.2,-2.4,0,0,s*1.2)); });
   g.add(T([[0,1.5,1.9],[0,1.2,2.4],[0,.9,2.6]],.05,y)); g.add(P(S(.12,br),0,.85,2.65));
   wheels(g,[-.95,.95],[-.8,1.5],.45); }}, trex:{th:'ไดโนเสาร์',f(g){ const gn=M(0x4f9a52), lt=M(0x9ad08a), w=M(0xffffff), dk=M(0x2f6b33);
   g.add(P(S(1.2,gn,.85,.75,1.55),0,1.45,.3));
   g.add(P(B(1.35,.9,1.7,gn),0,2.45,-1.75)); g.add(P(B(1.2,.28,1.5,lt),0,1.9,-1.9,.28)); // หัวใหญ่ + กรามล่างอ้า
   for(let k=0;k<6;k++){ g.add(P(K(.06,.2,w,4),-.45+k*.18,2.0,-2.55,Math.PI)); g.add(P(K(.05,.16,w,4),-.4+k*.16,1.95,-2.45)); }
   [-1,1].forEach(s=>{ g.add(P(S(.17,eyeW),s*.5,2.75,-2.2)); g.add(P(S(.09,eyeB),s*.56,2.77,-2.28)); g.add(P(S(.12,dk,1,.5,1),s*.3,2.92,-2.35));
     g.add(P(C(.07,.06,.55,gn,6),s*.55,1.6,-1.05,1.1)); g.add(P(S(.42,gn,.7,1.1,.9),s*.75,1.0,.6)); });
   g.add(T([[0,1.5,1.6],[0,1.45,2.6],[0,1.6,3.5],[0,1.9,4.1]],.32,gn)); g.add(P(K(.2,.6,gn),0,1.95,4.4,-Math.PI/2.6));
   for(let k=0;k<6;k++) g.add(P(K(.15,.38,dk,4),0,2.3-k*.1,-.9+k*.55));
   wheels(g,[-1,1],[-1.2,1.3],.48); }}, dragon:{th:'มังกร',f(g){ const rd=M(0xc22a2a), gd=M(0xf2b632), mb=M(0x7a1414);
   g.add(P(S(1.2,rd,.85,.6,1.7),0,1.25,.2)); g.add(P(S(.7,rd,.9,.75,1.3),0,1.9,-2.0)); g.add(P(B(.7,.35,.6,rd),0,1.7,-2.7));
   [-1,1].forEach(s=>{ g.add(P(K(.12,.7,gd),s*.3,2.55,-1.8,-.5)); const wg=new THREE.Mesh(new THREE.ConeGeometry(1.4,2.2,3),mb); wg.scale.set(1,1,.1); wg.position.set(s*1.6,2.1,.2); wg.rotation.set(0,0,s*-1.2); g.add(wg); });
   eyes(g,.3,2.1,-2.5,.1); for(let k=0;k<6;k++) g.add(P(K(.14,.4,gd,4),0,1.9-k*.05,-1.1+k*.55));
   g.add(T([[0,1.3,1.9],[.5,1.2,2.8],[-.2,1.4,3.5],[.3,1.7,3.9]],.14,rd)); wheels(g,[-1,1],[-1.2,1.3],.45); }},
 bee:{th:'ผึ้ง',f(g){ const y=M(0xffcf26), bk=M(0x1c1c1c), wg=M(0xdff4ff,{transparent:true,opacity:.7});
   g.add(P(S(1.15,y,.9,.85,1.65),0,1.45,.2)); [-0.4,.4,1.1].forEach(z=>{ const r=new THREE.Mesh(new THREE.TorusGeometry(.98,.12,8,24),bk); r.position.set(0,1.45,z); r.scale.set(.95,.9,1); g.add(r); });
   g.add(P(S(.65,bk),0,1.75,-1.75)); eyes(g,.32,1.9,-2.25,.14); [-1,1].forEach(s=>{ g.add(P(C(.03,.03,.7,bk,6),s*.25,2.6,-1.8,-.3)); g.add(P(S(.1,bk),s*.25,2.92,-1.95));
     const w=S(.7,wg,1.1,.12,.6); w.position.set(s*.9,2.6,.1); w.rotation.z=s*-.5; g.add(w); });
   g.add(P(K(.1,.5,bk),0,1.4,2.15,Math.PI/2)); wheels(g,[-1,1],[-1.1,1.2],.42); }},
 ladybug:{th:'เต่าทอง',f(g){ const rd=M(0xe0302a), bk=M(0x1a1a1a);
   g.add(P(S(1.5,rd,1,.6,1.35),0,1.05,.1)); g.add(P(B(.06,.9,3.6,bk),0,1.4,.2)); [[.65,1.75,-.3],[-.65,1.75,-.3],[.8,1.5,.8],[-.8,1.5,.8],[.45,1.85,.5],[-.45,1.85,.5]].forEach(p=>g.add(P(S(.24,bk,1,.4,1),...p)));
   g.add(P(S(.6,bk,1,.8,.9),0,1.1,-1.9)); [-1,1].forEach(s=>{ g.add(P(S(.13,eyeW),s*.28,1.25,-2.35)); g.add(P(C(.03,.03,.6,bk,6),s*.22,1.65,-2.05,-.4)); });
   wheels(g,[-1.2,1.2],[-1.0,1.2],.42); }},
 lion:{th:'สิงโต',f(g){ const y=M(0xe8b04a), mn=M(0xa65a1c), dk=M(0x3b2210);
   g.add(P(S(1.15,y,.8,.6,1.55),0,1.3,.4));
   const mane=new THREE.Mesh(new THREE.TorusGeometry(.72,.38,12,24),mn); mane.position.set(0,2.0,-1.55); g.add(mane);
   g.add(P(S(.78,mn,1,1,.6),0,2.0,-1.3)); g.add(P(S(.66,y),0,2.0,-1.75)); g.add(P(S(.36,M(0xf6dca0),1,.7,.8),0,1.8,-2.3));
   g.add(P(S(.12,dk),0,1.95,-2.6)); eyes(g,.26,2.18,-2.25,.1); [-1,1].forEach(s=>g.add(P(S(.17,y),s*.48,2.6,-1.75)));
   g.add(T([[0,1.35,1.9],[0,1.15,2.6],[0,1.2,3.2],[0,1.5,3.5]],.07,y)); g.add(P(S(.2,mn),0,1.6,3.6));
   wheels(g,[-1,1],[-1.2,1.3],.46); }}, hippo:{th:'ฮิปโป',f(g){ const pu=M(0x8e7fa6), pk=M(0xd9a7b8);
   g.add(P(S(1.5,pu,1,.72,1.5),0,1.4,.2)); g.add(P(S(1.0,pu,1.05,.8,1.15),0,1.6,-1.8)); g.add(P(B(1.6,.55,.9,pk),0,1.25,-2.45));
   [-1,1].forEach(s=>{ g.add(P(S(.12,M(0x4a3c5c)),s*.35,1.55,-2.9)); g.add(P(S(.22,pu),s*.55,2.45,-1.55)); g.add(P(K(.1,.3,eyeW,4),s*.5,1.0,-2.85,Math.PI)); });
   eyes(g,.4,2.25,-2.15,.13); wheels(g,[-1.2,1.2],[-1.1,1.3],.5); }},
 croc:{th:'จระเข้',f(g){ const gn=M(0x3e7a3a), lt=M(0x8bb46a), w=M(0xffffff);
   g.add(P(B(1.6,.6,3.4,gn),0,.95,.4)); g.add(P(B(1.1,.45,2.0,gn),0,1.0,-1.9)); g.add(P(B(1.0,.25,1.9,lt),0,.72,-1.9));
   for(let k=0;k<7;k++) [-1,1].forEach(s=>g.add(P(K(.05,.18,w,4),s*.5,.82,-2.7+k*.22,Math.PI)));
   [-1,1].forEach(s=>{ g.add(P(S(.2,gn),s*.35,1.35,-1.05)); g.add(P(S(.1,M(0xe8d84a)),s*.35,1.42,-1.2)); });
   for(let k=0;k<6;k++) g.add(P(B(.3,.2,.3,M(0x2c5a2a)),0,1.32,-.6+k*.55)); g.add(P(K(.5,2.2,gn,4),0,.95,3.0,Math.PI/2));
   wheels(g,[-1,1],[-1.3,1.2],.42); }},
 duck:{th:'เป็ด',f(g){ const y=M(0xffd93b), ob=M(0xff8a1a);
   g.add(P(S(1.25,y,.9,.65,1.5),0,1.15,.2)); g.add(P(S(.75,y),0,2.15,-1.3)); g.add(P(S(.38,ob,1.1,.35,1.3),0,2.0,-2.0)); eyes(g,.3,2.4,-1.85,.11);
   [-1,1].forEach(s=>{ const wg=S(.65,M(0xf2c62c),.3,.5,1.2); wg.position.set(s*1.05,1.35,.3); g.add(wg); }); g.add(P(K(.35,.6,y),0,1.55,1.9,Math.PI/2.8));
   wheels(g,[-1,1],[-1.1,1.2],.42); }},
 owl:{th:'นกฮูก',f(g){ const br=M(0x8a5a36), lt=M(0xe8d2ae), ob=M(0xffa41b);
   g.add(P(S(1.15,br,1,1.25,1.05),0,1.85,0)); g.add(P(S(.85,lt,.9,1,.5),0,1.65,-.55));
   [-1,1].forEach(s=>{ g.add(P(S(.36,eyeW),s*.38,2.55,-.85)); g.add(P(S(.2,eyeB),s*.38,2.58,-1.12)); g.add(P(S(.42,ob,1,1,.3),s*.38,2.55,-.75)); g.add(P(K(.18,.55,br,4),s*.6,3.3,-.2,0,0,s*-.3));
     const wg=S(.55,M(0x6b4428),.25,1.0,.8); wg.position.set(s*1.1,1.9,.1); g.add(wg); });
   g.add(P(S(.36,eyeW),.38,2.55,-.85)); g.add(P(K(.12,.35,ob,4),0,2.3,-1.05,-Math.PI/2)); wheels(g,[-1,1],[-1.0,1.1],.42); }},
 unicorn:{th:'ยูนิคอร์น',f(g){ const w=M(0xfaf7ff), mn=[M(0xff7ab6),M(0xffd34d),M(0x7ad7ff),M(0xb38bff)], gd=M(0xf3c53a);
   g.add(P(S(1.1,w,.78,.7,1.6),0,1.45,.35));
   g.add(T([[0,1.9,-.9],[0,2.6,-1.3],[0,3.0,-1.7]],.36,w));
   g.add(P(S(.5,w,.85,.85,1.45),0,3.05,-2.15)); g.add(P(S(.3,M(0xffd6e6),1,.8,.9),0,2.85,-2.75));
   g.add(P(K(.12,1.0,gd),0,3.75,-2.3,-.45)); eyes(g,.32,3.2,-2.4,.1);
   [-1,1].forEach(s=>g.add(P(K(.12,.35,w,6),s*.25,3.5,-1.9)));
   mn.forEach((m,k)=>g.add(P(S(.2,m,.6,1,1.5),0,3.0-k*.32,-1.55+k*.32)));
   mn.forEach((m,k)=>g.add(T([[(k-1.5)*.1,1.6,1.9],[(k-1.5)*.14,1.4,2.5],[(k-1.5)*.16,1.0,2.8]],.09,m)));
   wheels(g,[-1,1],[-1.2,1.4],.45); }},  };

  // ---------- รถแข่ง 6 แบบ ----------
  const box = B, cyl = (rt, rb, h, m, seg = 12) => C(rt, rb, h, m, seg);
  const glass = M(0x0d1520, { metalness: .6, roughness: .15 }), dark = M(0x22262d), hub = hubM;
  function wheel(g, x, y, z, r, w) { addWheel(g, x, y, z, r, w); }
  const BODY = {
  sport(g,m,w){ const b=box(2,.6,4.2,m); b.position.y=.62; g.add(b); const n=box(1.9,.32,1.1,m); n.position.set(0,.5,-2.4); g.add(n);
    const c=box(1.45,.5,1.6,glass); c.position.set(0,1.15,.2); g.add(c); const sp=box(2.1,.1,.5,dark); sp.position.set(0,1.35,1.95); g.add(sp);
    [-.7,.7].forEach(x=>{const p=box(.1,.45,.1,dark); p.position.set(x,1.1,1.95); g.add(p);});
    [[-1.05,-1.35],[1.05,-1.35],[-1.05,1.35],[1.05,1.35]].forEach(([x,z])=>wheel(g,x,.45,z,.45,.4,w)); return 2.2; },
  muscle(g,m,w){ const b=box(2.2,.8,4.4,m); b.position.y=.78; g.add(b); const c=box(1.8,.62,2,glass); c.position.set(0,1.48,.35); g.add(c);
    const s=box(.6,.25,.9,dark); s.position.set(0,1.28,-1.3); g.add(s); const st=box(.45,.02,4.42,M(0xf2f4f7)); st.position.set(0,1.19,0); g.add(st);
    [[-1.1,-1.45],[1.1,-1.45],[-1.1,1.45],[1.1,1.45]].forEach(([x,z])=>wheel(g,x,.5,z,.5,.45,w)); return 2.3; },
  formula(g,m,w){ const n=cyl(.18,.45,3,m,10); n.rotation.x=-Math.PI/2; n.position.set(0,.55,-1.5); g.add(n);
    const b=box(.95,.55,2.4,m); b.position.set(0,.6,.7); g.add(b); const ck=box(.6,.3,.8,dark); ck.position.set(0,.95,.15); g.add(ck);
    const fw=box(2.5,.08,.6,m); fw.position.set(0,.25,-2.9); g.add(fw); const rw=box(2.1,.1,.6,m); rw.position.set(0,1.45,1.85); g.add(rw);
    [-.6,.6].forEach(x=>{const p=box(.08,.7,.1,dark); p.position.set(x,1.1,1.85); g.add(p);});
    [[-1.2,-1.6,.48],[1.2,-1.6,.48],[-1.2,1.35,.55],[1.2,1.35,.55]].forEach(([x,z,r])=>wheel(g,x,r,z,r,.6,w)); return 2.2; },
  buggy(g,m,w){ const b=box(1.6,.32,3,m); b.position.y=.75; g.add(b); const seat=box(.8,.5,.8,dark); seat.position.set(0,1.15,.3); g.add(seat);
    const bar=M(0xd8dde3,{metalness:.7}); [[-.7,-.5],[.7,-.5],[-.7,1],[.7,1]].forEach(([x,z])=>{const p=cyl(.06,.06,1.5,bar,6); p.position.set(x,1.6,z); g.add(p);});
    [-.5,1].forEach(z=>{const t=cyl(.06,.06,1.4,bar,6); t.rotation.z=Math.PI/2; t.position.set(0,2.35,z); g.add(t);});
    [-.7,.7].forEach(x=>{const t=cyl(.06,.06,1.5,bar,6); t.rotation.x=Math.PI/2; t.position.set(x,2.35,.25); g.add(t);});
    [[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]].forEach(([x,z])=>wheel(g,x,.65,z,.65,.6,w)); return 1.9; },
  truck(g,m,w){ const b=box(2.2,1,3.6,m); b.position.y=1.55; g.add(b); const c=box(2,.8,1.6,glass); c.position.set(0,2.4,-.45); g.add(c);
    const rim=box(2.2,.3,.2,dark); rim.position.set(0,2.15,1.7); g.add(rim); const li=box(1.6,.15,.1,new THREE.MeshBasicMaterial({color:0xfff2c8})); li.position.set(0,1.8,-1.82); g.add(li);
    [[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]].forEach(([x,z])=>wheel(g,x,.9,z,.9,.7,w)); return 2.0; },
  jet(g,m,w){ const f=cyl(.62,.75,4,m,16); f.rotation.x=Math.PI/2; f.position.set(0,.95,0); g.add(f);
    const nc=new THREE.Mesh(new THREE.ConeGeometry(.62,1.3,16),m); nc.rotation.x=-Math.PI/2; nc.position.set(0,.95,-2.65); g.add(nc);
    const cp=new THREE.Mesh(new THREE.SphereGeometry(.45,14,10,0,Math.PI*2,0,Math.PI/2),glass); cp.position.set(0,1.45,-.7); g.add(cp);
    const fin=box(.08,1,1,m); fin.position.set(0,1.9,1.5); g.add(fin); [-1,1].forEach(s=>{const wg=box(1.4,.08,.9,m); wg.position.set(s*1,.9,1.2); g.add(wg);});
    const nz=cyl(.5,.38,.4,dark,14); nz.rotation.x=Math.PI/2; nz.position.set(0,.95,2.15); g.add(nz);
    [[-.9,-1.4],[.9,-1.4],[-.9,1.3],[.9,1.3]].forEach(([x,z])=>wheel(g,x,.35,z,.35,.35,w)); return 2.35; },
};

  const PAINT = { sport: 0xff5a5a, muscle: 0x4c94ff, formula: 0xffc531, buggy: 0x2fd27b, truck: 0xb77bff, jet: 0x38e1ff };
  function build(file) {
    const g = new THREE.Group(); g.userData.wheels = [];
    if (ANIMALS[file]) ANIMALS[file].f(g);
    else if (BODY[file]) BODY[file](g, M(PAINT[file], { metalness: .45, roughness: .35 }), g.userData.wheels);
    else BODY.sport(g, M(0x999999), g.userData.wheels);
    return g;
  }
  window.BNRL_MODELS = { build, has: f => !!(ANIMALS[f] || BODY[f]) };
})();
