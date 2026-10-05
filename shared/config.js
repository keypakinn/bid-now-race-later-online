// ค่าคงที่ทั้งหมดของเกม — spec v2 หัวข้อ 3 (Config) ห้ามฝังตัวเลขที่อื่น
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BNRL_CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return Object.freeze({
    PLAYERS_MIN: 2,
    PLAYERS_MAX: 7,
    CAR_POOL_SIZE: 50,
    POWER_MIN: 1,
    POWER_MAX: 50,
    STARTING_COINS: Object.freeze({ 2: 8, 3: 10, 4: 13, 5: 15, 6: 18, 7: 20 }),
    OPENING_BID: 1,
    MIN_RAISE: 1,
    BID_TURN_SECONDS: 10,
    PICK_SECONDS: 30,
    AUCTION_RESULT_SECONDS: 5,
    INTRO_SECONDS: 2, // ป้ายประกาศ Phase / รอบ แสดงป้ายละ 2 วิ เซิร์ฟเวอร์เริ่มนับเวลาหลังป้ายจบ (L1)
    RACE_RESULT_SECONDS: 6,
    LAST_RACE_REVEAL_SECONDS: 3,
    SPECTATORS_MAX: 20,
    NAME_MAX_CHARS: 16,
    CARD_THUMB_MIN_PX: 88,
    // PRIZE_TABLE: [ค่า, น้ำหนัก %]
    PRIZE_TABLE: Object.freeze([
      [23, 16], [27, 14], [38, 13], [43, 12], [58, 10],
      [63, 9], [77, 8], [82, 7], [91, 6], [100, 5]
    ])
  });
});
