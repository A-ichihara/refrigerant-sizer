const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// UXE3 室内ユニット最多接続台数（PA-P900UXE3 p3「9 システム制限」）。
// 公式値は40台（システム全体の上限）。旧実装の52台は海外向け MF3 シリーズの
// 値であり、日本向け UXE3 の公式根拠はない（2026-10-28 資料調査
// REMAINING-ITEMS-RESEARCH-20261028.md トラック5で確定）。

function makeTree(indoorCount) {
  const indoors = [];
  for (let i = 0; i < indoorCount; i += 1) {
    indoors.push({
      id: `kit${i}`,
      name: `Kit ${i}`,
      type: 'solenoid_kit',
      length: 2,
      children: [{
        id: `indoor${i}`, name: `Indoor ${i}`, type: 'indoor', capacity: 2.2, length: 2, children: []
      }]
    });
  }
  return {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: 56,
    children: [{
      id: 'b1', name: 'Branch 1', type: 'branch', length: 5, children: indoors
    }]
  };
}

function countWarnings(result) {
  return result.warnings.filter((w) => w.message.includes('接続台数制限'));
}

test('fsv_uxe3 maxIndoorUnits is 40 per PA-P900UXE3 p3', () => {
  const engine = new RefrigerantSizerEngine();
  assert.equal(engine.SERIES_DATABASE.fsv_uxe3.maxIndoorUnits, 40);
});

test('UXE3 system with 41 indoor units triggers the 40-unit limit warning', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeTree(41), 'fsv_uxe3', false);
  const warnings = countWarnings(result);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, 'danger');
  assert.ok(warnings[0].message.includes('接続台数制限(40台)'));
  assert.ok(warnings[0].message.includes('現在: 41台'));
});

test('UXE3 system with exactly 40 indoor units does not trigger the limit warning', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeTree(40), 'fsv_uxe3', false);
  assert.equal(countWarnings(result).length, 0);
});
