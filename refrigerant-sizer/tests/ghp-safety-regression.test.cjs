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
    assert.ok(!under.warnings.some(w => w.includes('【サイズアップ未適用】')));
    const sizeUpWarning = over.warnings.find(w => w.includes('【サイズアップ未適用】'));
    assert.ok(sizeUpWarning, 'over-threshold case must show the size-up warning');
    assert.ok(sizeUpWarning.includes('90mは注意表示のための暫定トリガー'), '90m must be disclosed as a provisional trigger');
    assert.ok(sizeUpWarning.includes('メーカー公式の相当長判定ではありません'), 'warning must not mislabel actual length as equivalent length');
    // 90m超判定は現行の暫定仕様の特性確認であり、メーカー公式の適用条件ではない。
  });

  test(manufacturer + ': 手動指定時の注意表示を維持する', () => {
    const result = engineFor(manufacturer).calculateSystem(makeTree(10), seriesId, true);
    assert.ok(result.warnings.some(w => w.includes('【サイズアップ未適用】')));
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

test('GHP 4社: 未検証のサイズアップ操作は画面上で無効化される', () => {
  for (const manufacturer of Object.keys(manufacturers)) {
    const appDir = path.join(__dirname, '..', manufacturer + '-ghp-refrigerant-sizer');
    const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    const ui = fs.readFileSync(path.join(appDir, 'js', 'ui.js'), 'utf8');
    assert.match(html, /id="btn-force-sizeup" disabled aria-disabled="true"/, manufacturer + ' HTML');
    assert.ok(html.includes('主管サイズUP（停止中）'), manufacturer + ' label');
    assert.ok(ui.includes('forceSUpBtn.disabled = true'), manufacturer + ' UI disable');
    assert.ok(ui.includes("forceSUpBtn.classList.remove('btn-primary')"), manufacturer + ' no active state');
  }
});


/**
 * 安全回帰テスト: 未検証の自動増径は適用せず、境界超過を警告する。
 * 正式なメーカー別ルールとBOM反映が確定するまで、室外機ノードのみを変更しない。
 */
for (const [manufacturer, seriesId] of Object.entries(manufacturers)) {
  test(manufacturer + ': 2管式で未検証の自動増径を適用しない', () => {
    const engine = engineFor(manufacturer);
    // 同一の配管長で比較し、入力実長の差をサイズアップ差と誤認しない。
    const baseline = engine.calculateSystem(makeTree(81), seriesId, false);
    const over = engine.calculateSystem(makeTree(81), seriesId, true);
    assert.ok(over.warnings.some(w => w.includes('【サイズアップ未適用】')));
    assert.equal(over.tree.isSizedUp, undefined);
    assert.equal(over.tree.pipeLiquid, baseline.tree.pipeLiquid);
    assert.equal(over.tree.pipeGas, baseline.tree.pipeGas);
    assert.equal(over.tree.children[0].pipeLiquid, baseline.tree.children[0].pipeLiquid);
    assert.equal(over.tree.children[0].pipeGas, baseline.tree.children[0].pipeGas);
    assert.deepEqual(over.totals.liquidPipes, baseline.totals.liquidPipes);
    assert.deepEqual(over.totals.gasPipes, baseline.totals.gasPipes);
  });
}


const threePipeManufacturers = {
  aisin: 'aisin_ghp_heat_recovery',
  daikin: 'daikin_ghp_hr',
  yanmar: 'yanmar_ghp_exe_captor',
  panasonic: 'panasonic_ghp_multi_free',
};

function makeThreePipeTree(branchLength) {
  return {
    id: 'root', type: 'outdoor', capacity: 56, length: 0,
    children: [{
      id: 'branch', type: 'branch', length: branchLength,
      children: [{
        id: 'bs', type: 'bs_unit', length: 1,
        children: [{ id: 'indoor', type: 'indoor', capacity: 11.2, length: 10, children: [] }],
      }],
    }],
  };
}

for (const [manufacturer, seriesId] of Object.entries(threePipeManufacturers)) {
  test(manufacturer + ': 3管式で未検証の自動増径を適用しない', () => {
    const engine = engineFor(manufacturer);
    // 同一の配管長で比較し、長さ差とサイズアップ差を分離する。
    const baseline = engine.calculateSystem(makeThreePipeTree(80), seriesId, false);
    const over = engine.calculateSystem(makeThreePipeTree(80), seriesId, true);
    assert.equal(baseline.totals.longestPath, 91);
    assert.equal(over.totals.longestPath, 91);
    assert.ok(over.warnings.some(w => w.includes('【サイズアップ未適用】')));
    assert.equal(over.tree.isSizedUp, undefined);
    assert.equal(over.tree.pipeLiquid, baseline.tree.pipeLiquid);
    assert.equal(over.tree.children[0].pipeLiquid, baseline.tree.children[0].pipeLiquid);
    assert.deepEqual(over.totals.liquidPipes, baseline.totals.liquidPipes);
    assert.deepEqual(over.totals.highGasPipes, baseline.totals.highGasPipes);
    assert.deepEqual(over.totals.lowGasPipes, baseline.totals.lowGasPipes);
  });
}

/**
 * 入力の根拠を明確にするための特性テスト。
 * これはメーカーの相当長判定ではなく、現行エンジンの入力値の扱いを確認する。
 */
for (const [manufacturer, seriesId] of Object.entries(manufacturers)) {
  test(manufacturer + ': 最遠長は入力実長の和であり継手相当長は加算しない', () => {
    const tree = {
      id: 'root', type: 'outdoor', capacity: 45, length: 0,
      children: [{
        id: 'b1', type: 'branch', length: 30,
        children: [
          { id: 'i1', type: 'indoor', capacity: 11.2, length: 20, children: [] },
          { id: 'b2', type: 'branch', length: 15, children: [
            { id: 'i2', type: 'indoor', capacity: 11.2, length: 10, children: [] }
          ] }
        ]
      }]
    };
    const result = engineFor(manufacturer).calculateSystem(tree, seriesId, false);
    assert.equal(result.totals.longestPath, 55);
    assert.equal(result.totals.totalPipingLength, 75);
    assert.ok(result.warnings.some(w => w.includes('【型式・施工基準未照合】')));
    // 分岐継手等の直管相当長は入力・加算していない。
  });

  test(manufacturer + ': 室外機ノードの長さは最遠長に入るがBOMの配管長には入らない', () => {
    const tree = makeTree(10);
    tree.length = 5; // 現行UIの通常入力は0。非ゼロの保存データ等を想定。
    const result = engineFor(manufacturer).calculateSystem(tree, seriesId, false);
    assert.equal(result.totals.longestPath, 25);
    assert.equal(result.totals.totalPipingLength, 25);
    const liquidTotal = Object.values(result.totals.liquidPipes).reduce((a, b) => a + b, 0);
    assert.equal(liquidTotal, 20);
    // 計算結果の長さとBOM長の不一致を記録。根拠なく仕様変更しない。
  });
}
