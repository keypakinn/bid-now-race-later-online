// ค่าคงที่ทั้งหมดของเกม — spec v2.0 หัวข้อ 3 (Config) ห้ามฝังตัวเลขที่อื่น
// ไฟล์นี้ใช้ร่วมกันทั้งเซิร์ฟเวอร์และหน้าเว็บ แก้ที่นี่ที่เดียวมีผลทั้งเกม
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BNRL_CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // =====================================================================
  //  เวลา (หน่วย: วินาที) — แก้ตัวเลขด้านล่างได้เลย แล้วอัปโหลดไฟล์นี้ขึ้น GitHub
  //  ต้องเป็นจำนวนเต็ม 1–600 ถ้าใส่ผิด ระบบจะใช้ค่าเริ่มต้นแทนและเตือนใน log
  // =====================================================================
  const TIME = {
    INTRO_SECONDS: 2,            // ป้าย PHASE / AUCTION k / x / RACE k / x แสดงป้ายละกี่วิ
    RULES_SECONDS: 4,            // ป้ายสรุปกติกาของห้องตอนเริ่มเกม (โหมด + ปุ่มที่เปิด)
    LOT_REVEAL_STEP_SECONDS: 1,  // เปิดรถในชุดทีละคันตอนเริ่มรอบประมูล (วิต่อคัน)
    BID_TURN_SECONDS: 60,        // ประมูล Classic/Chaos: เวลาคิดตาละกี่วิ
    SHADOW_BID_SECONDS: 30,      // Shadow Auction: เวลาใส่ราคาลับกี่วิ
    SHADOW_REVEAL_SECONDS: 6,    // Shadow Auction: เวลาพลิกเปิดราคากี่วิ
    AUCTION_RESULT_SECONDS: 5,   // แสดงผลประมูลแต่ละรอบกี่วิ
    CAMPAIGN_BANNER_SECONDS: 3,  // Grand Campaign: ป้ายเหตุการณ์ก่อนเลือกรถกี่วิ
    PICK_SECONDS: 15,            // เลือกรถ + Nitro กี่วิ (ทุกคนยืนยันครบ = แข่งทันที)
    PICK_REMIND_SECONDS: 6,      // เหลือกี่วิจึงขึ้นป๊อปอัปเตือนคนที่ยังไม่เลือก/ยังไม่ยืนยัน
    WARNING_SECONDS: 5,          // เหลือกี่วิจึงขึ้นตัวเลขนับถอยหลังใหญ่กลางจอ
    RACE_COUNTDOWN_SECONDS: 3,   // หน้าแข่ง: แพนกล้อง + นับ 3-2-1 ก่อนออกตัว
    RACE_RUN_SECONDS: 12,        // หน้าแข่ง: รถวิ่งจนคันสุดท้ายเข้าเส้นชัยกี่วิ (รวมช่วงเล่นช้า)
    RACE_RESULT_SECONDS: 8,      // แท่นรับรางวัลของแต่ละ Race กี่วิ
    LAST_RACE_REVEAL_SECONDS: 3  // Race สุดท้ายเมื่อปิด Nitro (ระบบเลือกรถให้): แสดงก่อนเริ่มแข่งกี่วิ
  };
  // =====================================================================

  const DEFAULT_TIME = {
    INTRO_SECONDS: 2, RULES_SECONDS: 4, LOT_REVEAL_STEP_SECONDS: 1, BID_TURN_SECONDS: 60, SHADOW_BID_SECONDS: 30,
    SHADOW_REVEAL_SECONDS: 6, AUCTION_RESULT_SECONDS: 5, CAMPAIGN_BANNER_SECONDS: 3, PICK_SECONDS: 15,
    PICK_REMIND_SECONDS: 6, WARNING_SECONDS: 5, RACE_COUNTDOWN_SECONDS: 3, RACE_RUN_SECONDS: 12,
    RACE_RESULT_SECONDS: 8, LAST_RACE_REVEAL_SECONDS: 3
  };
  for (const k of Object.keys(DEFAULT_TIME)) {
    const v = TIME[k];
    if (!(Number.isInteger(v) && v >= 1 && v <= 600)) {
      if (typeof console !== 'undefined') console.warn(`config: ${k} = ${v} ใช้ไม่ได้ (ต้องเป็นจำนวนเต็ม 1–600) ใช้ค่าเริ่มต้น ${DEFAULT_TIME[k]} แทน`);
      TIME[k] = DEFAULT_TIME[k];
    }
  }
  if (TIME.PICK_REMIND_SECONDS >= TIME.PICK_SECONDS) TIME.PICK_REMIND_SECONDS = Math.max(1, TIME.PICK_SECONDS - 1); // R-3-05
  if (TIME.WARNING_SECONDS >= TIME.PICK_SECONDS) TIME.WARNING_SECONDS = Math.max(1, TIME.PICK_SECONDS - 1);

  // =====================================================================
  //  สมดุลของโหมดและปุ่มเสริม — ค่าเริ่มต้นสำหรับ playtest ปรับได้
  // =====================================================================
  const BALANCE = {
    CHAOS_COIN_MULT: 1.5,        // Chaos / Shadow: ตัวคูณเงินเริ่มต้นจากตาราง Classic
    NITRO_POWER_PER_COIN: 1.5,   // Nitro: 1 Coin = +กี่ Power
    NITRO_MAX_COINS: 5,          // Nitro: ใช้ได้สูงสุดกี่ Coins ต่อ Race
    REFUND_RATIO: 0.5,           // Refund: คืนสัดส่วนเท่าไรของยอดที่ลง (ปัดลง)
    REFUND_BONUS_LAST: 2,        // Refund: คนได้คันอ่อนสุดได้เพิ่มกี่ Coins
    REFUND_BONUS_SECOND_LAST: 1, // Refund: คนได้คันรองสุดท้ายได้เพิ่มกี่ Coins
    RAIN_THRESHOLD: 35,          // Campaign Rain: Power เดิมตั้งแต่เท่านี้ถูกลด
    RAIN_PENALTY: 5,             // Campaign Rain: ลดกี่ Power
    FRENZY_MULT: 2,              // Campaign Nitro Frenzy: คูณอัตรา Nitro
    LUCKY_MIN: 0, LUCKY_MAX: 10, // Campaign Lucky Boost: สุ่มบวก Power
    UNDERDOG_BONUS: 10,          // Campaign Underdog: คันที่ Power เดิมต่ำสุดได้เพิ่ม
    DOUBLE_PRIZE_MULT: 2         // Campaign Double Prize
  };

  return Object.freeze(Object.assign({}, TIME, BALANCE, {
    PLAYERS_MIN: 2,
    PLAYERS_MAX: 7,
    ROUNDS_MIN: 2, // จำนวนรอบต่ำสุดที่เจ้าของห้องตั้งได้ (สูงสุด = จำนวนรถ ÷ จำนวนผู้เล่น)
    CAR_POOL_SIZE: 50,
    POWER_MIN: 1,
    POWER_MAX: 50,
    STARTING_COINS: Object.freeze({ 2: 8, 3: 10, 4: 13, 5: 15, 6: 18, 7: 20 }),
    OPENING_BID: 1,
    MIN_RAISE: 1,
    SHADOW_MIN_BID: 1,
    COINS_OVERRIDE_MIN: 1,
    COINS_OVERRIDE_MAX: 99,
    MODES: Object.freeze(['classic', 'chaos', 'shadow']),
    DEFAULT_MODE: 'classic',
    TOGGLES: Object.freeze(['nitro', 'refund', 'campaign', 'mystery', 'suddenDeath']),
    NITRO_QUICK: Object.freeze([0, 3, 5]),
    NITRO_BOOST_MIN_S: 0.8, NITRO_BOOST_PER_COIN_S: 0.5, // ระยะพุ่ง = 0.8 + 0.5 × Coins วินาที
    CAMPAIGN_EVENTS: Object.freeze(['reverse', 'double', 'rain', 'frenzy', 'ban', 'wta', 'fog', 'lucky', 'underdog']),
    SCENES: Object.freeze(['night', 'desert', 'snow', 'neon']),
    PLAYER_COLORS: Object.freeze(['#ff5a5a', '#4c94ff', '#ffc531', '#2fd27b', '#b77bff', '#ff8a3d', '#3fd6d0']),
    CARD_ABOVE_CAR_PX: 84, CARD_ABOVE_CAR_RUN_PX: 48,
    SLOWMO_FACTOR: 0.22,
    MODEL_THUMB_PX: 160,
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
