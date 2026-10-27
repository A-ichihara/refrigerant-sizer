/**
 * Aisin GHP 訂正の回帰テスト。
 * 実行: node --test refrigerant-sizer/tests/aisin-ghp-corrections.test.cjs
 * 根拠: アイシン GHP 総合カタログ 2026年10月版「施工情報」D1 p.223（冷媒配管サイズ選定）、
 * D2 室外ユニット仕様表、D3 ハイブリッド総合カタログ。
 * 値の表記はコードのインチ表記（15.88＝15.9、28.58＝28.6、31.75＝31.8、19.05＝19.1、9.52＝9.5 と同一呼び径）。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const enginePath = path.join(__dirname, '..', 'aisin-ghp-refrigerant-sizer', 'js', 'engine.js');
const uiPath = path.join(__dirname, '..', 'aisin-ghp-refrigerant-sizer', 'js', 'ui.js');

function loadEngine() {
  const source = fs.readFileSync(enginePath, 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source + '\n;globalThis.__Engine = RefrigerantSizerEngine;', context, { filename: enginePath });
  return new context.__Engine();
}

function indoor(id, kw, length = 10) {
  return { id, type: 'indoor', capacity: kw, length, children: [] };
}
function branch(id, length, children) {
  return { id, type: 'branch', length, children };
}
function bsUnit(id, length, children) {
  return { id, type: 'bs_unit', length, children };
}
function outdoor(kw, children) {
  return { id: 'root', type: 'outdoor', capacity: kw, length: 0, children };
}
function calc(tree, seriesId, manual = false) {
  return loadEngine().calculateSystem(tree, seriesId, manual);
}

// 主管（2管式）は室外機形式で選定される。D1 p.223。
test('主管（2管式）: 室外機形式ごとの公式値', () => {
  const cases = [
    [35.5, '12.7', '25.4'],
    [45.0, '15.88', '28.58'],
    [56.0, '15.88', '28.58'],
    [71.0, '15.88', '31.75'],
    [85.0, '19.05', '31.75'],
  ];
  for (const [kw, liquid, gas] of cases) {
    const result = calc(outdoor(kw, [branch('b', 10, [indoor('i', 11.2)])]), 'aisin_ghp_xair');
    assert.equal(result.tree.pipeLiquid, liquid, `outdoor ${kw} liquid`);
    assert.equal(result.tree.pipeGas, gas, `outdoor ${kw} gas`);
  }
});

// 主管は下流合計容量で変わらない（構造誤りの訂正）。
test('主管（2管式）: 下流合計容量が変わっても室外機形式の値のまま', () => {
  const result = calc(outdoor(45.0, [branch('b', 10, [indoor('i1', 14.0), indoor('i2', 16.0)])]), 'aisin_ghp_xair');
  assert.equal(result.tree.pipeLiquid, '15.88');
  assert.equal(result.tree.pipeGas, '28.58');
  // 分岐は下流合計 30.0kW の帯（22.4〜33.0kW未満）。
  assert.equal(result.tree.children[0].pipeLiquid, '9.52');
  assert.equal(result.tree.children[0].pipeGas, '22.2');
});

// 分岐〜分岐（2管式）の帯。境界は公式の「未満」どおり。
test('分岐〜分岐（2管式）: 公式の容量帯と境界', () => {
  const cases = [
    [11.2, '9.52', '15.88'],
    [22.3, '9.52', '15.88'],
    [22.4, '9.52', '22.2'],
    [32.9, '9.52', '22.2'],
    [33.0, '12.7', '28.58'],
    [46.9, '12.7', '28.58'],
    [47.0, '15.88', '28.58'],
    [70.9, '15.88', '28.58'],
    [71.0, '19.05', '31.75'],
    [103.9, '19.05', '31.75'],
    [104.0, '19.05', '38.1'],
  ];
  for (const [down, liquid, gas] of cases) {
    const result = calc(outdoor(85.0, [branch('b', 10, [indoor('i', down)])]), 'aisin_ghp_xair');
    assert.equal(result.tree.children[0].pipeLiquid, liquid, `down ${down} liquid`);
    assert.equal(result.tree.children[0].pipeGas, gas, `down ${down} gas`);
  }
});

// 主管（冷暖フリー・3管式）。D1 p.223。
test('主管（3管式）: 室外機形式ごとの公式値', () => {
  const cases = [
    [56.0, '15.88', '22.2', '28.58'],
    [71.0, '19.05', '25.4', '31.75'],
    [85.0, '19.05', '28.58', '31.75'],
  ];
  for (const [kw, liquid, highGas, lowGas] of cases) {
    const result = calc(outdoor(kw, [branch('b', 10, [indoor('i', 11.2)])]), 'aisin_ghp_heat_recovery');
    assert.equal(result.tree.pipeLiquid, liquid, `outdoor ${kw} liquid`);
    assert.equal(result.tree.pipeHighGas, highGas, `outdoor ${kw} highGas (高低圧)`);
    assert.equal(result.tree.pipeLowGas, lowGas, `outdoor ${kw} lowGas (吸入)`);
  }
});

// 450形冷暖フリーは公式に存在しない。旧来の≤45帯を維持し、未照合として記録する。
test('主管（3管式）: 450形冷暖フリーは公式にないため旧来値を維持する', () => {
  const result = calc(outdoor(45.0, [branch('b', 10, [indoor('i', 11.2)])]), 'aisin_ghp_heat_recovery');
  assert.equal(result.tree.pipeLiquid, '12.7');
  assert.equal(result.tree.pipeHighGas, '19.05');
  assert.equal(result.tree.pipeLowGas, '28.58');
});

// 分岐〜分岐・BSユニット（冷暖フリー・3管式）。D1 p.223。
test('分岐（3管式）: 公式の容量帯と境界', () => {
  const cases = [
    [11.2, '9.52', '12.7', '15.88'],
    [16.0, '9.52', '15.88', '19.05'],
    [22.4, '9.52', '19.05', '22.2'],
    [33.0, '12.7', '19.05', '28.58'],
    [47.0, '15.88', '25.4', '28.58'],
    [71.0, '19.05', '25.4', '31.75'],
    [104.0, '19.05', '28.58', '38.1'],
  ];
  for (const [down, liquid, highGas, lowGas] of cases) {
    const result = calc(outdoor(56.0, [branch('b', 10, [indoor('i', down)])]), 'aisin_ghp_heat_recovery');
    const b = result.tree.children[0];
    assert.equal(b.pipeLiquid, liquid, `down ${down} liquid`);
    assert.equal(b.pipeHighGas, highGas, `down ${down} highGas (高低圧)`);
    assert.equal(b.pipeLowGas, lowGas, `down ${down} lowGas (吸入)`);
  }
});

// 室内機接続配管。D1 p.223「分岐・BSユニット〜室内ユニット」。
test('室内機接続配管: 形式（容量）ごとの公式値', () => {
  const cases = [
    [5.6, '6.35', '12.7'],
    [16.0, '9.52', '15.88'],
    [22.4, '9.52', '19.05'],
    [28.0, '12.7', '22.2'],
  ];
  for (const [kw, liquid, gas] of cases) {
    const result = calc(outdoor(85.0, [branch('b', 10, [indoor('i', kw)])]), 'aisin_ghp_xair');
    const node = result.tree.children[0].children[0];
    assert.equal(node.pipeLiquid, liquid, `indoor ${kw} liquid`);
    assert.equal(node.pipeGas, gas, `indoor ${kw} gas`);
  }
});

// 280形の液管は BS下流でも非下流でも公式値になる（旧コードは両経路で誤り）。
test('室内機接続配管: 280形はBS下流でも液管 φ12.7', () => {
  const result = calc(
    outdoor(56.0, [branch('b', 10, [bsUnit('bs', 1, [indoor('i', 28.0)])])]),
    'aisin_ghp_heat_recovery'
  );
  const node = result.tree.children[0].children[0].children[0];
  assert.equal(node.pipeLiquid, '12.7');
  assert.equal(node.pipeGas, '22.2');
});

// 分岐管の型式。第一分岐は室外機形式、第二分岐以降は下流合計容量。D1 p.223。
test('分岐管（2管式）: 第一分岐は室外機形式で選定される', () => {
  const cases = [
    [35.5, 'ABP-AS72Y01'],
    [45.0, 'ABP-AS72Y01'],
    [56.0, 'ABP-AS72Y01'],
    [71.0, 'ABP-AS104Y01'],
    [85.0, 'ABP-AS104Y01'],
  ];
  for (const [kw, joint] of cases) {
    const result = calc(outdoor(kw, [branch('b', 10, [indoor('i', 11.2)])]), 'aisin_ghp_xair');
    assert.equal(result.tree.children[0].jointModel, joint, `outdoor ${kw} first branch`);
  }
});

test('分岐管（2管式）: 第二分岐以降は下流合計容量で選定される', () => {
  const cases = [
    [20.0, 'ABP-AS22Y01'],
    [22.4, 'ABP-AS33Y01'],
    [33.0, 'ABP-AS72Y01'],
    [71.0, 'ABP-AS104Y01'],
    [104.0, 'ABP-AS218Y01'],
  ];
  for (const [down, joint] of cases) {
    const result = calc(
      outdoor(85.0, [branch('b1', 10, [branch('b2', 10, [indoor('i', down)])])]),
      'aisin_ghp_xair'
    );
    assert.equal(result.tree.children[0].children[0].jointModel, joint, `down ${down} later branch`);
  }
});

test('分岐管（3管式）: 第一分岐と第二分岐以降', () => {
  const first = calc(outdoor(56.0, [branch('b', 10, [indoor('i', 11.2)])]), 'aisin_ghp_heat_recovery');
  assert.equal(first.tree.children[0].jointModel, 'ABP-AS72FY01');
  const first710 = calc(outdoor(71.0, [branch('b', 10, [indoor('i', 11.2)])]), 'aisin_ghp_heat_recovery');
  assert.equal(first710.tree.children[0].jointModel, 'ABP-AS104FY01');
  const cases = [
    [10.0, 'ABP-AS22FY01'],
    [22.4, 'ABP-AS33FY01'],
    [33.0, 'ABP-AS72FY01'],
    [71.0, 'ABP-AS104FY01'],
  ];
  for (const [down, joint] of cases) {
    const result = calc(
      outdoor(56.0, [branch('b1', 10, [branch('b2', 10, [indoor('i', down)])])]),
      'aisin_ghp_heat_recovery'
    );
    assert.equal(result.tree.children[0].children[0].jointModel, joint, `down ${down} later branch`);
  }
});

// 総配管実長の上限は全シリーズ 520m（D1）。
test('総配管実長: 520m以下が上限', () => {
  const over = calc(
    outdoor(45.0, [branch('b', 300, [indoor('i1', 22.4, 150), indoor('i2', 22.4, 71)])]),
    'aisin_ghp_xair'
  );
  assert.equal(over.totals.totalPipingLength, 521);
  assert.ok(over.warnings.some(w => w.includes('総配管実長') && w.includes('520m')));
  const atLimit = calc(
    outdoor(45.0, [branch('b', 300, [indoor('i1', 22.4, 150), indoor('i2', 22.4, 70)])]),
    'aisin_ghp_xair'
  );
  assert.equal(atLimit.totals.totalPipingLength, 520);
  assert.ok(!atLimit.warnings.some(w => w.includes('総配管実長')));
});

// 変更しないもの: サイズアップ停止、未照合警告、ハイブリッド警告、BSユニット型式、90型の追加。
test('変更しないもの: 手動指定でも主管は増径しない', () => {
  const tree = () => outdoor(45.0, [branch('b', 81, [indoor('i', 22.4)])]);
  const baseline = calc(tree(), 'aisin_ghp_xair', false);
  const manual = calc(tree(), 'aisin_ghp_xair', true);
  assert.equal(baseline.tree.pipeLiquid, '15.88');
  assert.equal(baseline.tree.pipeGas, '28.58');
  assert.equal(manual.tree.pipeLiquid, baseline.tree.pipeLiquid);
  assert.equal(manual.tree.pipeGas, baseline.tree.pipeGas);
  assert.equal(manual.tree.isSizedUp, undefined);
  assert.ok(manual.warnings.some(w => w.includes('【サイズアップ未適用】')));
});

test('変更しないもの: 未照合警告とハイブリッド警告を維持する', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(outdoor(45.0, [branch('b', 10, [indoor('i', 11.2)])]), 'aisin_ghp_xair');
  assert.ok(result.warnings.some(w => w.includes('【型式・施工基準未照合】')));
  const hybrid = engine.calculateSystem(outdoor(45.0, [branch('b', 10, [indoor('i', 11.2)])]), 'aisin_ghp_hybrid');
  assert.ok(hybrid.warnings.some(w => w.includes('【ハイブリッドGHP要注意】')));
  assert.ok(hybrid.warnings.some(w => w.includes('ASGP450F2ZD')));
});

test('変更しないもの: BSユニットの型式・区分は旧来のまま（選定規則が公式資料にないため）', () => {
  const small = calc(outdoor(56.0, [branch('b', 10, [bsUnit('bs', 1, [indoor('i', 5.6)])])]), 'aisin_ghp_heat_recovery');
  assert.equal(small.tree.children[0].children[0].modelNumber, 'MSU-P80A');
  const large = calc(outdoor(56.0, [branch('b', 10, [bsUnit('bs', 1, [indoor('i', 11.2)])])]), 'aisin_ghp_heat_recovery');
  assert.equal(large.tree.children[0].children[0].modelNumber, 'MSU-P160A');
});

test('室内機容量の選択肢: 公式の90型（9.0kW）が追加される', () => {
  const engine = loadEngine();
  const found = engine.INDOOR_CAPACITIES.find(c => Math.abs(c.kw - 9.0) < 0.01);
  assert.ok(found, '90型 9.0kW must be listed');
  assert.equal(found.type, '90型 (3.2馬力相当)');
});

// UI: 凡例表と表示ラベルの訂正。
test('UI: 凡例表は公式の分岐〜分岐表、ラベルは実長・高低圧／吸入ガス管', () => {
  const ui = fs.readFileSync(uiPath, 'utf8');
  assert.ok(ui.includes('22.4 〜 33.0kW 未満'));
  assert.ok(ui.includes('71.0 〜 104.0kW 未満'));
  assert.ok(ui.includes('104.0kW 以上'));
  assert.ok(!ui.includes('〜 14.0 (5馬力)'), 'old band table must be gone');
  assert.ok(ui.includes('最遠配管実長:'));
  assert.ok(!ui.includes('最遠配管相当長:'), 'actual length must not be labeled equivalent length');
  assert.ok(ui.includes('高低圧ガス管'));
  assert.ok(ui.includes('吸入ガス管'));
  assert.ok(!ui.includes('(高圧ガス管)'), 'old high-gas label must be gone');
  assert.ok(!ui.includes('(低圧ガス管)'), 'old low-gas label must be gone');
});
