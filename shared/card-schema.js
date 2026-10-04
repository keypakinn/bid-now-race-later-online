// schema ของ cards/data.csv — spec v2 หัวข้อ 4.1 (UMD)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BNRL_CARD_SCHEMA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return Object.freeze({
    columns: {
      id: { type: 'id', required: true },
      name: { type: 'text', required: true, max: 24 },
      power: { type: 'int', min: 1, max: 50, required: true, rule: true, unique: true }
    },
    secret: [],
    idPattern: /^[a-z0-9][a-z0-9-]{0,39}$/
  });
});
