/**
 * GHP安全表示・長さ集計の回帰テスト。
 * 実行: node --test refrigerant-sizer/tests/ghp-safety-regression.test.cjs
 * 公式型式と配管径の妥当性を保証するテストではない。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const manufacturers = {
  aisin: 'aisin_ghp_xair',
  daikin: 'daikin_ghp_super_combi',
  yanmar: 'yanmar_ghp_highpower',
  panasonic: 'panasonic_ghp_e_series',
};

function engineFor(manufacturer) {
  const file = path.join(__dirname, '..', manufacturer + '-ghp-refrigerant-sizer', 'js', 'engine.js');
  const source = fs.readFileSync(file, 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source + '\n;globalThis.__Engine = RefrigerantSizerEngine;', context, { filename: file });
  return new context.__Engine();
}

function makeTree(length) {
  return {
    id: 'root', type: 'outdoor', capacity: 45, length: 0,
    children: [{
      id: 'branch', type: 'branch', length,
      children: [{ id: 'indoor', type: 'indoor', capacity: 22.4, length: 10, children: [] }],
    }],
  };
}

for (const [manufacturer, seriesId] of Object.entries(manufacturers)) {
  test(manufacturer + ': 未照合警告は短距離でも表示される', () => {
    const engine = engineFor(manufacturer);
    const result = engine.calculateSystem(makeTree(10), seriesId, false);
    assert.ok(result.warnings.some(w => w.includes('【型式・施工基準未照合】')));
    assert.equal(result.totals.longestPath, 20);
    assert.equal(result.totals.totalPipingLength, 20);
  });

  test(manufacturer + ': 既存の90m超の注意表示を維持する', () => {
    const engine = engineFor(manufacturer);
    const under = engine.calculateSystem(makeTree(80), seriesId, false);
    const over = engine.calculateSystem(makeTree(81), seriesId, false);
    assert.equal(under.totals.longestPath, 90);
    assert.equal(over.totals.longestPath, 91);
    assert.ok(!under.warnings.some(w => w.includes('配管サイズアップ条件に該当する可能性')));
    assert.ok(over.warnings.some(w => w.includes('配管サイズアップ条件に該当する可能性')));
    // 90m超判定は現行の暫定仕様の特性確認であり、メーカー公式の適用条件ではない。
  });

  test(manufacturer + ': 手動指定時の注意表示を維持する', () => {
    const result = engineFor(manufacturer).calculateSystem(makeTree(10), seriesId, true);
    assert.ok(result.warnings.some(w => w.includes('配管サイズアップ条件に該当する可能性')));
  });
}

test('aisin: ハイブリッド固有の型式不一致警告', () => {
  const engine = engineFor('aisin');
  const result = engine.calculateSystem(makeTree(10), 'aisin_ghp_hybrid', false);
  assert.ok(result.warnings.some(w => w.includes('【ハイブリッドGHP要注意】')));
});

test('GHP 4社: 印刷用CSSに警告パネルの表示設定がある', () => {
  for (const manufacturer of Object.keys(manufacturers)) {
    const html = fs.readFileSync(path.join(__dirname, '..', manufacturer + '-ghp-refrigerant-sizer', 'index.html'), 'utf8');
    assert.ok(html.includes('#warning-panel, #warning-panel .alert-card'), manufacturer);
    assert.ok(!html.includes('.warning-panel {\n                display: none !important;'), manufacturer);
  }
});


/**
 * 既知不具合の再現テスト（現状を固定するための characterization）。
 * 「正しい配管選定」を示すものではない。公式条件の照合と修正後に期待値を変更する。
 */
for (const [manufacturer, seriesId] of Object.entries(manufacturers)) {
  test(manufacturer + ': 既知不具合・室外機サイズUPが子配管BOMに反映されない', () => {
    const engine = engineFor(manufacturer);
    const baseline = engine.calculateSystem(makeTree(80), seriesId, false);
    const sizeUp = engine.calculateSystem(makeTree(81), seriesId, false);
    assert.equal(sizeUp.tree.isSizedUp, true, '室外機ノードにはサイズUPフラグが立つ');
    assert.notEqual(sizeUp.tree.pipeLiquid, baseline.tree.pipeLiquid, '室外機の液管径は変わる');
    assert.notEqual(sizeUp.tree.pipeGas, baseline.tree.pipeGas, '室外機のガス管径は変わる');
    assert.equal(sizeUp.tree.children[0].isSizedUp, undefined, '長さを持つ子ノードはサイズUPされない');
    assert.deepEqual(Object.keys(sizeUp.totals.liquidPipes), Object.keys(baseline.totals.liquidPipes), 'BOMの液管径は変わらない');
    assert.deepEqual(Object.keys(sizeUp.totals.gasPipes), Object.keys(baseline.totals.gasPipes), 'BOMのガス管径は変わらない');
    assert.equal(sizeUp.tree.children[0].pipeLiquid, baseline.tree.children[0].pipeLiquid);
    assert.equal(sizeUp.tree.children[0].pipeGas, baseline.tree.children[0].pipeGas);
  });
}
