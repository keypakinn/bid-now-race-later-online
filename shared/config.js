// ค่าคงที่ทั้งหมดของเกม — spec v2 หัวข้อ 3 (Config) ห้ามฝังตัวเลขที่อื่น
// ไฟล์นี้ใช้ร่วมกันทั้งเซิร์ฟเวอร์และหน้าเว็บ แก้ที่นี่ที่เดียวมีผลทั้งเกม
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BNRL_CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // =====================================================================
  //  เวลา (หน่วย: วินาที) — แก้ตัวเลขด้านล่างได้เลย แล้วอัปโหลดไฟล์นี้ขึ้น GitHub
  //  ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป ถ้าใส่ผิด ระบบจะใช้ค่าเริ่มต้นแทนและเตือนใน log
  // =====================================================================
  const TIME = {
    INTRO_SECONDS: 2,            // ป้าย PHASE 1 / AUCTION k / x / PHASE 2 / RACE k / x แสดงป้ายละกี่วิ
    BID_TURN_SECONDS: 60,        // ประมูล: เวลาคิดตาละกี่วิ (กด Bid/Pass แล้วไปคนถัดไปทันที)
    AUCTION_RESULT_SECONDS: 5,   // แสดงผลประมูลแต่ละรอบกี่วิ
    PICK_SECONDS: 60,            // เลือกรถ: เวลาเลือกกี่วิ (ทุกคนยืนยันครบ = แข่งทันที)
    PICK_REMIND_SECONDS: 13,     // เลือกรถ: เหลือกี่วิจึงขึ้นป๊อปอัปเตือนคนที่ยังไม่เลือก/ยังไม่ยืนยัน
    WARNING_SECONDS: 10,         // เหลือกี่วิจึงขึ้นตัวเลขนับถอยหลังใหญ่กลางจอ
    RACE_COUNTDOWN_SECONDS: 3,   // RACE START: นับถอยหลัง 3-2-1 ก่อนรถออกตัว
    RACE_RUN_SECONDS: 7,         // RACE START: รถวิ่งจนคันสุดท้ายถึงเส้นชัยกี่วิ
    RACE_RESULT_SECONDS: 8,      // แสดงแท่นรับรางวัลของแต่ละ Race กี่วิ
    LAST_RACE_REVEAL_SECONDS: 3  // Race สุดท้าย (ระบบเลือกรถให้): แสดงหน้าก่อนเริ่มแข่งกี่วิ
  };
  // =====================================================================

  const DEFAULT_TIME = {
    INTRO_SECONDS: 2, BID_TURN_SECONDS: 60, AUCTION_RESULT_SECONDS: 5, PICK_SECONDS: 60, PICK_REMIND_SECONDS: 13,
    WARNING_SECONDS: 10, RACE_COUNTDOWN_SECONDS: 3, RACE_RUN_SECONDS: 7, RACE_RESULT_SECONDS: 8, LAST_RACE_REVEAL_SECONDS: 3
  };
  for (const k of Object.keys(DEFAULT_TIME)) {
    const v = TIME[k];
    if (!(Number.isInteger(v) && v >= 1 && v <= 600)) {
      if (typeof console !== 'undefined') console.warn(`config: ${k} = ${v} ใช้ไม่ได้ (ต้องเป็นจำนวนเต็ม 1–600) ใช้ค่าเริ่มต้น ${DEFAULT_TIME[k]} แทน`);
      TIME[k] = DEFAULT_TIME[k];
    }
  }

  return Object.freeze(Object.assign({}, TIME, {
    PLAYERS_MIN: 2,
    PLAYERS_MAX: 7,
    ROUNDS_MIN: 2, // จำนวนรอบต่ำสุดที่เจ้าของห้องตั้งได้ (สูงสุด = จำนวนรถ ÷ จำนวนผู้เล่น)
    CAR_POOL_SIZE: 50,
    POWER_MIN: 1,
    POWER_MAX: 50,
    STARTING_COINS: Object.freeze({ 2: 8, 3: 10, 4: 13, 5: 15, 6: 18, 7: 20 }),
    OPENING_BID: 1,
    MIN_RAISE: 1,
    RACE_MIN_GAP_MS: 400, // รถเข้าเส้นชัยห่างกันอย่างน้อยกี่มิลลิวินาที (ภาพเคลื่อนไหว)
    SPECTATORS_MAX: 20,
    NAME_MAX_CHARS: 16,
    CARD_THUMB_MIN_PX: 88,
    // PRIZE_TABLE: [ค่า, น้ำหนัก %]
    PRIZE_TABLE: Object.freeze([
      [23, 16], [27, 14], [38, 13], [43, 12], [58, 10],
      [63, 9], [77, 8], [82, 7], [91, 6], [100, 5]
    ])
  }));
});
