# บิดไปสมาชิก (Bid Now, Race Later)

เกมออนไลน์สำหรับผู้เล่น 2–7 คน เล่นบนเบราว์เซอร์มือถือ แบ่งเป็น 2 ช่วง
1. **ประมูล:** ใช้ Coins ที่มีจำกัดประมูลรถแข่ง
2. **แข่ง:** นำรถที่ได้มาแข่งทีละคันเพื่อเก็บ Prize

ใครเก็บ Prize รวมได้มากที่สุดเป็นผู้ชนะ กติกาฉบับเต็มอยู่ใน Game Specification v2

## วิธีเล่น (v2.0)

ผู้เล่น 2–7 คน ประมูลรถ x รอบ (ค่าเริ่มต้น = จำนวนผู้เล่น) แล้วนำรถมาแข่ง 3D ทีละคันเพื่อเก็บ Prize ใคร Prize รวมมากสุดชนะ กติกาฉบับเต็มอยู่ใน `spec.md` (โฟลเดอร์ `Bid Now Race Later`)

**ห้องรอ (Lobby)**
- เจ้าของห้องเลือก **โหมด** และเปิดปิด **ปุ่มเสริม** ตั้งจำนวนรอบ, Coins เริ่มต้น (มีค่าแนะนำ + ปุ่มรีเซ็ต) และฉากสนาม (สุ่มทุก Race หรือล็อกฉากเดียว)
- ทุกคนเลือก **รถ 3D** ของตัวเอง 59 แบบ (สัตว์ 28 · รถแข่ง 31) หมุนดูได้ มีปุ่มลูกเต๋าสุ่ม เลือกซ้ำกันได้ (หน้าตาไม่มีผลกับกติกา)
- เจ้าของห้องเอาคนออก (✕) หรือโอนสิทธิ์เจ้าของห้อง (♛) ได้

| โหมด | วิธีประมูล | ใครจ่าย | แจกรถ | Coins เริ่มต้น |
|---|---|---|---|---|
| Classic | ผลัดกัน bid | ผู้ชนะคนเดียว | ผู้ชนะได้คันแรงสุด ที่เหลือตามที่นั่งถัดไป | ตาราง |
| Chaos | ผลัดกัน bid | ทุกคน (ยอด bid สูงสุดของตัวเอง หักทันที) | เรียงตามยอดที่ลง · คนลง 0 ใคร pass ก่อนได้คันอ่อนกว่า | ตาราง ×1.5 |
| Shadow Auction | ใส่ราคาลับพร้อมกัน 30 วิ (ขั้นต่ำ 1) | ทุกคนตามที่ใส่ | เรียงตามราคา เท่ากันเรียงตามที่นั่งจากผู้เปิด | ตาราง ×1.5 |

| ปุ่มเสริม | ทำอะไร |
|---|---|
| Nitro | ใส่ Coins ที่เหลือแบบลับตอนเลือกรถ 1 Coin = +1.5 Power สูงสุด 5 Coins/Race ใช้แล้วหาย |
| Refund | คนไม่ชนะได้คืนครึ่งของที่ลง (ปัดลง) + คันอ่อนสุด +2, รองสุดท้าย +1 (เปิดเองใน Chaos/Shadow) |
| Grand Campaign | 9 เหตุการณ์ (Reverse, Double Prize, Rain, Nitro Frenzy, Nitro Ban, Winner Takes All, Fog, Lucky Boost, Underdog) ครึ่งหนึ่งของ Race + Race สุดท้าย หรือทุก Race |
| Mystery Car | คว่ำรถ 1 คันต่อชุด เปิดตอนประกาศผลประมูล |
| Sudden Death | คะแนนเสมอตอนจบ → คนที่เสมอแข่งตัดสินด้วยรถลับคันใหม่ |

**ช่วงประมูล:** เปิดรถทีละคันกลางจอแล้วเรียงตามความแรง · ชิปบินไปกองหน้าผู้เล่น · pass แล้วมี PASS สีแดงจาง · ปุ่ม +1 / +2 / +5 / All-in (ยืนยันก่อน) · ใต้การ์ดบอกว่า "ถ้าจบตอนนี้" ใครได้คันไหน

**ช่วงแข่ง:** เลือกรถ + Nitro ภายใน 15 วินาที → แข่ง 3D 12 วินาที (ความเร็วระหว่างทางสุ่ม ผลจริงเปิดตอนเข้าเส้นชัย) → แท่นรับรางวัลพลิกการ์ดจากท้ายขึ้นไปที่ 1 (Power + Nitro = รวม) · Race สุดท้ายระบบเลือกรถให้ (ถ้าเปิด Nitro ยังใส่ Nitro ได้)

**เจ้าของห้องระหว่างเกม:** ❚❚ หยุดชั่วคราว / ▶ เล่นต่อ (ช่วงประมูลหรือเลือกรถ) · ⏭ ข้ามคนที่ยังไม่เสร็จ (ประมูล = pass, Shadow = ส่ง 1, เลือกรถ = สุ่มรถ Nitro 0) · เจ้าของห้องหลุดเกิน 15 วิหรือออก → สิทธิ์ไปที่นั่งถัดไป

**เมนู ⋮ (ทุกหน้า):** เสียงเพลง/เอฟเฟกต์/เครื่องยนต์, ปิดเสียง, สั่น (Android), ข้อความช่วย, เต็มจอ, วิธีเล่น, ดูรถทั้ง 50 คัน, ออกจากเกม (ระบบเล่นแทนจนจบ คะแนนยังนับ)

**อื่น ๆ (เหมือนเดิม):** หลุดแล้วรีโหลดกลับที่นั่งเดิม · รหัสห้อง 4 หลัก · ผู้ชมสูงสุด 20 คน · กลับสู่ Lobby หลังจบเกม · เสมอดูจำนวนครั้งที่ได้ที่ 1

## ปรับเวลาและค่าสมดุลเอง

ตัวเลขเวลาทั้งหมดอยู่บนสุดของไฟล์ `shared/config.js` (กลุ่ม `TIME`) แต่ละบรรทัดมีคำอธิบายภาษาไทย แก้ตัวเลขแล้วอัปโหลดไฟล์นี้ขึ้น GitHub ไฟล์เดียว Render จะ deploy ใหม่เอง
- ใส่ได้เฉพาะจำนวนเต็ม 1–600 วินาที ถ้าใส่ผิด ระบบใช้ค่าเริ่มต้นและเขียนเตือนใน log
- `npm test` ใช้ค่าจากไฟล์นี้ แก้ตัวเลขแล้ว test ยังผ่าน
- ค่าเวลาใหม่ใน v2.0: `RULES_SECONDS` (ป้ายกติกาตอนเริ่ม), `LOT_REVEAL_STEP_SECONDS` (เปิดรถทีละคัน), `SHADOW_BID_SECONDS`, `SHADOW_REVEAL_SECONDS`, `CAMPAIGN_BANNER_SECONDS` · `PICK_SECONDS` = 15, `RACE_RUN_SECONDS` = 12
- กลุ่ม `BALANCE` ถัดลงมา: ตัวคูณเงิน Chaos/Shadow (1.5), Nitro ต่อ Coin (1.5) และสูงสุดต่อ Race (5), Refund (คืนครึ่ง +2/+1), ค่าของเหตุการณ์ Campaign — แก้แล้วอัปไฟล์เดียวเหมือนกัน

## รถ 3D (`models/`)

| ไฟล์ | หน้าที่ |
|---|---|
| `models/models.csv` | รายการโมเดล 59 แบบ (`id,name,tab,source,file,scale,rotY,rearZ,labelY,skipWheel`) ช่องว่าง = คำนวณอัตโนมัติ |
| `models/kenney/*.glb` | รถ Kenney Car Kit 25 คัน (CC0) |
| `models/kenney/Textures/colormap.png` | **ต้องมีเสมอ** ถ้าหาย รถ .glb เป็นสีขาว |
| `models/thumbs/<id>.webp` | ภาพย่อในหน้าเลือกรถ |

- โมเดล `source = code` (สัตว์ 28 + รถ 6) สร้างจากโค้ดใน `public/models-code.js` ไม่มีไฟล์
- เพิ่มรถ .glb เอง: วางไฟล์ใน `models/kenney/` เพิ่มแถวใน `models.csv` (`source = glb`) แล้วให้ Claude สร้างภาพย่อ · ไฟล์เสียหาย → เกมใช้รถ Sport แทน ไม่ล่ม
- ห้ามอัปโฟลเดอร์ `FBX format`, `OBJ format` หรือไฟล์ zip ของ Kenney

## เสียง (`public/sounds/`)

ตอนนี้ใช้เสียงสังเคราะห์ทั้งหมด (เพลงพื้นหลังเงียบ) วางไฟล์ `.mp3/.ogg/.wav` ตามชื่อใน `public/sounds/README.md` แล้วอัปขึ้น GitHub เกมจะใช้ไฟล์แทนเอง

## รันในเครื่อง

ต้องมี Node.js 18 ขึ้นไป

```
npm install
npm start          # เปิด http://localhost:3000
npm test           # ทดสอบกติกา (test/sim.js)
```

หน้า `http://localhost:3000/preview` แสดงการ์ดรถทุกคัน พร้อมบอกจำนวนช่องที่ข้อความล้นและภาพที่หายไป

## Deploy (GitHub + Render แพ็กเกจฟรี)

1. สร้าง repo ใหม่บน GitHub แล้วกด "uploading an existing file"
2. ลาก **ของที่อยู่ข้างใน** โฟลเดอร์นี้ไปวาง ห้ามลากตัวโฟลเดอร์ และห้ามลาก `node_modules`
3. Render → New → Web Service → เลือก repo แล้วตั้งค่าดังนี้

| ช่อง | ค่า |
|---|---|
| Region | Singapore |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/healthz` |

**อัปเดตจาก v1 เป็น v2.0 (repo และ Render service เดิม):** โฟลเดอร์นี้มี 163 ไฟล์ แต่หน้าเว็บ GitHub รับได้ครั้งละ 100 ไฟล์ จึงแบ่ง 2 รอบ
- รอบที่ 1: ลากโฟลเดอร์ `models` (86 ไฟล์) → Commit
- รอบที่ 2: ลากทุกอย่างที่เหลือ (`cards`, `public`, `server`, `shared`, `test`, `.gitignore`, `README.md`, `game.js`, `package.json`, `package-lock.json`, `server.js` — 77 ไฟล์) → Commit แล้ว Render deploy ให้เอง
- ไม่มีไฟล์ไหนต้องลบใน GitHub

4. **อัปเดตเกมหรือการ์ดตอนไม่มีคนเล่นเท่านั้น** เพราะเมื่อ deploy ใหม่ ห้องที่กำลังเล่นจะหายหมด

| Environment variable | ใช้ทำอะไร |
|---|---|
| `PORT` | Render ตั้งให้เอง (ในเครื่องใช้ 3000) |

ข้อจำกัดของแพ็กเกจฟรี:
- ถ้าไม่มีใครเข้าประมาณ 15 นาที เซิร์ฟเวอร์จะหลับ ตอนเปิดครั้งแรกต้องรอให้ตื่นประมาณ 1 นาที
- state ของเกมเก็บในหน่วยความจำ ถ้าเซิร์ฟเวอร์รีสตาร์ท ทุกห้องจะหาย

## การ์ดรถ (`cards/`)

ไฟล์ข้อมูลรถอยู่ใน `cards/` ทั้งหมด ถ้าจะแก้รถ ไม่ต้องแก้โค้ด ดูรายละเอียดใน `cards/README.md`

| ไฟล์ | หน้าที่ |
|---|---|
| `cards/data.csv` | รถ 50 คัน (`id,name,power`) Power ต้องเป็น 1–50 ห้ามซ้ำ |
| `cards/art/<id>.webp` | ภาพรถ 1088×912 เช่น `cards/art/car-01.webp` |
| `cards/template.json` | ตำแหน่งชื่อ, ไฟ LED, เกจ และตัวเลขบนการ์ด |
| `cards/frame.png`, `cards/back.png` | กรอบการ์ด และด้านหลังการ์ด |

- ถ้าภาพรถหาย จะแสดงพื้นสีกับชื่อรถแทน
- ถ้า `data.csv` ผิดหรือหาย เซิร์ฟเวอร์จะข้ามแถวที่ผิดและเติมรถ "Car N" ให้ครบ 50 คัน เกมยังเล่นได้
- รายการแถวที่ผิดดูได้ใน log ของ Render
- อัปโหลดภาพผ่านหน้าเว็บ GitHub ได้ครั้งละไม่เกิน 100 ไฟล์ แล้วเปิด `/preview` บนมือถือเพื่อตรวจ

## โครงไฟล์สำหรับนักพัฒนา

```
server.js              Express + Socket.IO, ห้อง, /api/cards, /api/models, /api/sounds, /preview, /healthz, งานเบื้องหลัง
game.js                class Room — กติกาทั้งหมด 3 โหมด + ปุ่มเสริม + สิทธิ์ host (อ้างรหัส R-x-y ของ spec v2.0)
server/cards.js        อ่าน/ตรวจ data.csv, เติมรถ default, เลขเวอร์ชันไฟล์การ์ด
server/models.js       อ่าน/ตรวจ models/models.csv (ผิด/หาย → ใช้โมเดลจากโค้ด)
shared/config.js       ค่าคงที่ทั้งหมด (spec หัวข้อ 3) กลุ่ม TIME และ BALANCE อยู่บนสุด
shared/card-schema.js  schema ของ data.csv (spec หัวข้อ 4.1)
public/app.js          หน้าจอทั้งหมด (lobby, ประมูล, Shadow, เลือกรถ, แท่นรับรางวัล, เมนู)
public/race3d.js       หน้าแข่ง 3D, ตัวโหลดโมเดล, ตัวดูโมเดลใน lobby (Three.js r128)
public/models-code.js  โมเดลที่สร้างจากโค้ด 34 แบบ
public/sound.js        เสียงสังเคราะห์ + ไฟล์เสียงแทนที่ + ตั้งค่าเสียง/สั่น
public/vendor/         three.min.js + GLTFLoader.js (MIT) — ไม่พึ่ง CDN ภายนอก
public/sounds/         ไฟล์เสียง (ไม่บังคับ) + README รายชื่อไฟล์
models/                models.csv, kenney/*.glb, thumbs/*.webp
test/sim.js            test ตาม test scenario T-xx ของ spec (99 กรณี)
cards/                 ไฟล์การ์ด
```

- **Socket events:** `create`, `join`, `resume`, `spectate`, `leave`, `lobby`, `action {type}` · server ส่ง `kicked` ให้คนที่ถูกเอาออก
- **type ของ action:** `game:start`, `lobby:rounds`, `lobby:settings`, `lobby:model`, `host:kick`, `host:transfer`, `host:pause`, `host:resume`, `host:skip`, `auction:raise`, `auction:pass`, `shadow:bid`, `shadow:confirm`, `race:select {cardId?, nitro?}`, `race:confirm`
- **server ส่ง:** `state` แยกส่งให้แต่ละคนตามสิทธิ์ และ event สาธารณะ `auction:result`, `shadow:reveal`, `race:prizes`, `race:picked`, `race:run`, `race:result`, `suddendeath:start`, `host:changed`, `game:paused`, `game:resumed`, `game:over`, `game:cancelled`
- **ข้อมูลลับ:** ราคา Shadow, Nitro, ตาราง Campaign อนาคต, Mystery, Power/Prize ระหว่างแข่ง ไม่อยู่ใน payload ของคนที่ไม่มีสิทธิ์ (test T-38, T-61, T-68, T-76, T-84)
- **log ของเกม:** event log ทุก action และบรรทัด `telemetry:game {...}` เมื่อจบเกม (มีโหมด ปุ่มเสริม ยอดที่ลง Refund Nitro เหตุการณ์ และการกดของ host)
