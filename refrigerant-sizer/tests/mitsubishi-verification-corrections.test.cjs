/**
 * 三菱電機 公式照合にもとづく訂正の回帰テスト。
 * 実行: node --test refrigerant-sizer/tests/mitsubishi-verification-corrections.test.cjs
 * 根拠: D1 BCコントローラー据付説明書 CMB-P104V-J 他（SHA-256 de8c42b4...84804e）、
 * D2 PUHY-P YNW-A Installation Manual 抜粋（0736e4de...a1c99ca1）、
 * D3 PURY-P Y(S)NW-A1 Specifications（75a807fb...e1e3）、
 * D4 PURY-P YNW-A1 Installation Manual WT08432X01（068d1a7a...190a2）、
 * D5 PUHY-P YNW-A Installation Manual KJ79F137H01（0cf22318...06cc7）。
 * 詳細は ~/workspace/refrigerant-sizer-verification/mitsubishi/REPORT.md および CORRECTIONS.md。
 * Mr.Slim・国内向けEM-A機種は公式資料が得られていないため未検証（旧来のまま）。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ENGINE = path.join(__dirname, '..', 'mitsubishi-refrigerant-sizer', 'js', 'engine.js');
const UI = path.join(__dirname, '..', 'mitsubishi-refrigerant-sizer', 'js', 'ui.js');
const INDEX = path.join(__dirname, '..', 'mitsubishi-refrigerant-sizer', 'index.html');

function loadEngine() {
  const source = fs.readFileSync(ENGINE, 'utf8');
  // engine.js は末尾で window.RefrigerantSizerEngine を設定するため、window を用意する。
  const context = vm.createContext({ window: {} });
  vm.runInContext(source + '\n;globalThis.__Engine = RefrigerantSizerEngine;', context, { filename: ENGINE });
  return new context.__Engine();
}

// vm コンテキストで作られたオブジェクトはホスト側の deepStrictEqual では
// プロトタイプが異なるため失敗する。JSON 経由で正規化して比較する。
function deepEqual(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

function indoor(id, capacity, length) {
  return { id, type: 'indoor', capacity, length, children: [] };
}

function branch(id, children, length) {
  return { id, type: 'branch', length, children };
}

function bc(id, children, length) {
  return { id, type: 'bc_controller', length, children };
}

function subBc(id, children, length) {
  return { id, type: 'sub_bc_controller', length, children };
}

function outdoor(id, capacity, children) {
  return { id, type: 'outdoor', capacity, length: 0, children };
}

// ---------------------------------------------------------------- D-R2-LIQ
test('D-R2-LIQ: R2 室外機〜親BC間に液管はない（BOMにも計上しない）', () => {
  const engine = loadEngine();
  const sizes = engine.selectR2OutdoorToBCSize(45.0);
  assert.equal('liquid' in sizes, false);
  deepEqual(sizes, { highGas: 22.2, lowGas: 28.58 });

  const tree = outdoor('o', 45.0, [
    bc('bc', [indoor('i1', 5.6, 6)], 12),
  ]);
  const r = engine.calculateSystem(tree, 'city_multi_r2');
  const bcEdge = r.tree.children[0];
  assert.equal('liquid' in bcEdge.pipes, false);
  assert.equal(bcEdge.pipeSizeText.includes('液管'), false);
  assert.equal(bcEdge.pipeSizeText, '高圧ガス: φ22.2 / 低圧ガス: φ28.58');
  // 液管の BOM は室内機辺（6m）のみ。BC 辺（12m）が液管に計上されてはいけない。
  // 室内機 5.6kW の液管は D-R2B-1 訂正後の φ9.52。
  deepEqual(r.totals.liquidPipes, { 9.52: 6 });
  deepEqual(r.totals.highGasPipes, { 22.2: 12 });
  deepEqual(r.totals.lowGasPipes, { 28.58: 12 });
});

// ---------------------------------------------------------------- D-R2-1〜6
test('D-R2-1: R2 P300（33.5kW）の低圧ガスは 22.2（旧 28.58）', () => {
  deepEqual(loadEngine().selectR2OutdoorToBCSize(33.5), { highGas: 19.05, lowGas: 22.2 });
});

test('D-R2-2: R2 P350（40.0kW）の高圧ガスは 19.05（旧 22.2。空冷 PURY）', () => {
  deepEqual(loadEngine().selectR2OutdoorToBCSize(40.0), { highGas: 19.05, lowGas: 28.58 });
});

test('D-R2-3: R2 P600（67.0kW）は高圧 22.2／低圧 28.58（旧 28.58／34.93）', () => {
  deepEqual(loadEngine().selectR2OutdoorToBCSize(67.0), { highGas: 22.2, lowGas: 28.58 });
});

test('D-R2-4/D-R2-5: R2 P700・P800（80.0・90.0kW）の低圧ガスは 34.93（旧 41.28）', () => {
  const engine = loadEngine();
  deepEqual(engine.selectR2OutdoorToBCSize(80.0), { highGas: 28.58, lowGas: 34.93 });
  deepEqual(engine.selectR2OutdoorToBCSize(90.0), { highGas: 28.58, lowGas: 34.93 });
});

test('D-R2-6は適用しない: R2 P900（101.2kW）の低圧ガスは 41.28 のまま（D1・D4 とも 41.28）', () => {
  deepEqual(loadEngine().selectR2OutdoorToBCSize(101.2), { highGas: 28.58, lowGas: 41.28 });
});

test('R2 室外機〜親BC：変更のない帯域（P200/P250/P400/P500）', () => {
  const engine = loadEngine();
  deepEqual(engine.selectR2OutdoorToBCSize(22.4), { highGas: 15.88, lowGas: 19.05 });
  deepEqual(engine.selectR2OutdoorToBCSize(28.0), { highGas: 19.05, lowGas: 22.2 });
  deepEqual(engine.selectR2OutdoorToBCSize(45.0), { highGas: 22.2, lowGas: 28.58 });
  deepEqual(engine.selectR2OutdoorToBCSize(56.0), { highGas: 22.2, lowGas: 28.58 });
});

// ---------------------------------------------------------------- D-R2B-1〜3
test('D-R2B-1: BC→室内機 P56（5.6kW）は 9.52／15.88（旧 6.35／12.7）', () => {
  deepEqual(loadEngine().selectBCBranchToIndoorSize(5.6), { liquid: 9.52, gas: 15.88 });
});

test('D-R2B-2: BC→室内機 P100〜P140（10.0〜14.0kW）のガスは 15.88（旧 19.05）', () => {
  const engine = loadEngine();
  deepEqual(engine.selectBCBranchToIndoorSize(10.0), { liquid: 9.52, gas: 15.88 });
  deepEqual(engine.selectBCBranchToIndoorSize(14.0), { liquid: 9.52, gas: 15.88 });
});

test('D-R2B-3: BC→室内機 P200（22.4kW）のガスは 19.05（旧 22.2）', () => {
  deepEqual(loadEngine().selectBCBranchToIndoorSize(22.4), { liquid: 9.52, gas: 19.05 });
});

test('BC→室内機：変更のない帯域（P22〜P50、P250）', () => {
  const engine = loadEngine();
  deepEqual(engine.selectBCBranchToIndoorSize(5.0), { liquid: 6.35, gas: 12.7 });
  deepEqual(engine.selectBCBranchToIndoorSize(28.0), { liquid: 9.52, gas: 22.2 });
});

// ---------------------------------------------------------------- D-Y-1〜7
test('D-Y-1〜D-Y-7: Y 分岐〜分岐（Pipe B・C・D）の公式帯域', () => {
  const engine = loadEngine();
  deepEqual(engine.selectTwoPipeSize(14.0), { liquid: 9.52, gas: 15.88 });
  deepEqual(engine.selectTwoPipeSize(20.0), { liquid: 9.52, gas: 19.05 });
  deepEqual(engine.selectTwoPipeSize(30.0), { liquid: 9.52, gas: 22.2 });
  deepEqual(engine.selectTwoPipeSize(40.0), { liquid: 12.7, gas: 28.58 });
  deepEqual(engine.selectTwoPipeSize(45.0), { liquid: 15.88, gas: 28.58 }); // D-Y-4
  deepEqual(engine.selectTwoPipeSize(65.0), { liquid: 15.88, gas: 28.58 });
  deepEqual(engine.selectTwoPipeSize(80.0), { liquid: 19.05, gas: 34.93 });
  deepEqual(engine.selectTwoPipeSize(90.0), { liquid: 19.05, gas: 41.28 }); // D-Y-6
  deepEqual(engine.selectTwoPipeSize(120.0), { liquid: 19.05, gas: 41.28 }); // D-Y-7
});

test('Y 分岐〜分岐：変更のない帯域', () => {
  const engine = loadEngine();
  deepEqual(engine.selectTwoPipeSize(7.1), { liquid: 9.52, gas: 15.88 });
  deepEqual(engine.selectTwoPipeSize(16.0), { liquid: 9.52, gas: 19.05 });
  deepEqual(engine.selectTwoPipeSize(28.0), { liquid: 9.52, gas: 22.2 });
  deepEqual(engine.selectTwoPipeSize(56.0), { liquid: 15.88, gas: 28.58 });
});

// ---------------------------------------------------------------- D-YA-1〜4
test('D-YA-1〜D-YA-4: Y 室外機〜第一分岐（Pipe A）は室外機形番で選定', () => {
  const engine = loadEngine();
  deepEqual(engine.selectYPipeASize(33.5), { liquid: 9.52, gas: 22.2 }); // D-YA-1
  deepEqual(engine.selectYPipeASize(63.0), { liquid: 15.88, gas: 28.58 }); // D-YA-2
  deepEqual(engine.selectYPipeASize(67.0), { liquid: 15.88, gas: 28.58 }); // D-YA-2
  deepEqual(engine.selectYPipeASize(101.2), { liquid: 19.05, gas: 41.28 }); // D-YA-3
  deepEqual(engine.selectYPipeASize(113.0), { liquid: 19.05, gas: 41.28 }); // D-YA-4
});

test('Y Pipe A：変更のない帯域', () => {
  const engine = loadEngine();
  deepEqual(engine.selectYPipeASize(22.4), { liquid: 9.52, gas: 22.2 });
  deepEqual(engine.selectYPipeASize(28.0), { liquid: 9.52, gas: 22.2 });
  deepEqual(engine.selectYPipeASize(45.0), { liquid: 12.7, gas: 28.58 });
  deepEqual(engine.selectYPipeASize(80.0), { liquid: 19.05, gas: 34.93 });
});

test('Y 室外機〜第一分岐は下流合計ではなく室外機容量で決まる（端末系統）', () => {
  const engine = loadEngine();
  // 室外機 63.0kW に対し下流合計 28.0kW でも、Pipe A は 15.88／28.58。
  const tree = outdoor('o', 63.0, [branch('b', [indoor('i1', 28.0, 8)], 10)]);
  const r = engine.calculateSystem(tree, 'city_multi_y');
  deepEqual(r.tree.children[0].pipes, { type: '2pipe', liquid: 15.88, gas: 28.58 });
});

// ---------------------------------------------------------------- D-YB-1〜3
test('D-YB-1〜D-YB-3: Y 分岐〜室内機（Pipe a〜d）の公式帯域', () => {
  const engine = loadEngine();
  deepEqual(engine.selectYBranchToIndoorSize(5.6), { liquid: 6.35, gas: 12.7 }); // D-YB-1
  deepEqual(engine.selectYBranchToIndoorSize(8.0), { liquid: 9.52, gas: 15.88 }); // D-YB-2
  deepEqual(engine.selectYBranchToIndoorSize(14.0), { liquid: 9.52, gas: 15.88 }); // D-YB-2
  deepEqual(engine.selectYBranchToIndoorSize(22.4), { liquid: 9.52, gas: 19.05 }); // D-YB-3
});

test('Y 分岐〜室内機：変更のない帯域（P71、P250）', () => {
  const engine = loadEngine();
  deepEqual(engine.selectYBranchToIndoorSize(7.1), { liquid: 9.52, gas: 15.88 });
  deepEqual(engine.selectYBranchToIndoorSize(28.0), { liquid: 9.52, gas: 22.2 });
});

// ---------------------------------------------------------------- D-J-1〜3 / S-J-1
test('D-J-1〜D-J-3: 分岐ジョイント（Branch Joint）の公式境界（20.0 / 40.0 / 65.0 kW）', () => {
  const engine = loadEngine();
  assert.equal(engine.selectJointModel(20.0), 'CMY-Y102SS-G2');
  assert.equal(engine.selectJointModel(28.0), 'CMY-Y102LS-G2'); // 旧 SS-G2
  assert.equal(engine.selectJointModel(40.0), 'CMY-Y102LS-G2');
  assert.equal(engine.selectJointModel(56.0), 'CMY-Y202S-G2'); // 旧 LS-G2
  assert.equal(engine.selectJointModel(65.0), 'CMY-Y202S-G2');
  assert.equal(engine.selectJointModel(90.0), 'CMY-Y302S-G2'); // 旧 202S-G2
});

test('S-J-1: 第一分岐ジョイント（First Joint）は室外機形番で選定', () => {
  const engine = loadEngine();
  assert.equal(engine.selectFirstJointModel(22.4), 'CMY-Y102LS-G2');
  assert.equal(engine.selectFirstJointModel(45.0), 'CMY-Y102LS-G2');
  assert.equal(engine.selectFirstJointModel(50.0), 'CMY-Y202S-G2');
  assert.equal(engine.selectFirstJointModel(80.0), 'CMY-Y302S-G2');
});

test('S-J-1: 端末系統で第一分岐は First Joint、第二分岐は Branch Joint', () => {
  const engine = loadEngine();
  const tree = outdoor('o', 80.0, [
    branch('b1', [branch('b2', [indoor('i1', 28.0, 8)], 15), indoor('i2', 28.0, 8)], 20),
  ]);
  const r = engine.calculateSystem(tree, 'city_multi_y');
  assert.equal(r.tree.children[0].jointModel, 'CMY-Y302S-G2'); // 第一分岐（P700〜P800）
  assert.equal(r.tree.children[0].children[0].jointModel, 'CMY-Y102LS-G2'); // 第二分岐（下流 28.0kW）
  deepEqual(r.tree.children[0].pipes, { type: '2pipe', liquid: 19.05, gas: 34.93 }); // Pipe A
  deepEqual(r.tree.children[0].children[0].pipes, { type: '2pipe', liquid: 9.52, gas: 22.2 }); // B/C/D
});

// ---------------------------------------------------------------- D-BC-1 / D-BC-2
test('D-BC-1: 親BCの適用可否（室外機 40.0kW 以下は無印 -J、40.1kW〜は JA/KA）', () => {
  const engine = loadEngine();
  const mk = (n) => ({ type: 'bc_controller', children: Array.from({ length: n }, (_, i) => indoor('i' + i, 2.2, 0)) });
  assert.equal(engine.generateBCUnitModel(mk(4), 22.4), 'CMB-P104V-J');
  assert.equal(engine.generateBCUnitModel(mk(4), 40.0), 'CMB-P104V-J');
  assert.equal(engine.generateBCUnitModel(mk(4), 45.0), 'CMB-P108V-JA');
  assert.equal(engine.generateBCUnitModel(mk(10), 45.0), 'CMB-P1012V-JA');
  assert.equal(engine.generateBCUnitModel(mk(16), 101.2), 'CMB-P1016V-JA');
  assert.equal(engine.generateBCUnitModel(mk(4), 113.0), 'CMB-P1016V-KA');
});

test('D-BC-2: 子BCは CMB-P104V-KB のみ（CMB-P108V-KB は存在しない）', () => {
  const engine = loadEngine();
  const mk = (n) => ({ type: 'sub_bc_controller', children: Array.from({ length: n }, (_, i) => indoor('i' + i, 2.2, 0)) });
  assert.equal(engine.generateSubBCUnitModel(mk(1)), 'CMB-P104V-KB');
  assert.equal(engine.generateSubBCUnitModel(mk(6)), 'CMB-P104V-KB');
});

// ---------------------------------------------------------------- D-RATIO-1
test('D-RATIO-1: R2 の接続容量比は 50%〜150%（Y は 50%〜130% のまま）', () => {
  const engine = loadEngine();
  // R2: 室内機合計 31.4kW / 室外機 22.4kW = 140% → 警告なし
  const r2 = outdoor('o', 22.4, [bc('bc', [indoor('i1', 14.0, 5), indoor('i2', 14.0, 5), indoor('i3', 3.6, 5)], 10)]);
  const rr = engine.calculateSystem(r2, 'city_multi_r2');
  assert.equal(rr.warnings.some((w) => w.message.includes('接続室内機合計比率')), false);
  // R2: 160% → 150% の警告が出る
  const r2over = outdoor('o', 22.4, [bc('bc', [indoor('i1', 14.0, 5), indoor('i2', 14.0, 5), indoor('i3', 8.0, 5)], 10)]);
  const ro = engine.calculateSystem(r2over, 'city_multi_r2');
  assert.equal(ro.warnings.some((w) => w.message.includes('50%〜150%')), true);
  // Y: 140% → 130% の警告が出る
  const y = outdoor('o', 22.4, [branch('b', [indoor('i1', 14.0, 5), indoor('i2', 14.0, 5), indoor('i3', 3.6, 5)], 10)]);
  const ry = engine.calculateSystem(y, 'city_multi_y');
  assert.equal(ry.warnings.some((w) => w.message.includes('50%〜130%')), true);
});

// ---------------------------------------------------------------- S-3P
test('S-3P: 主管〜子BC間は3管式（Pipes C〜I）', () => {
  const engine = loadEngine();
  deepEqual(engine.selectSubBCFeedSize(20.0), { liquid: 9.52, highGas: 15.88, lowGas: 19.05 });
  deepEqual(engine.selectSubBCFeedSize(28.0), { liquid: 9.52, highGas: 19.05, lowGas: 22.2 });
  deepEqual(engine.selectSubBCFeedSize(65.0), { liquid: 15.88, highGas: 28.58, lowGas: 28.58 }); // D4 の値
  deepEqual(engine.selectSubBCFeedSize(80.0), { liquid: 19.05, highGas: 28.58, lowGas: 34.93 });
  deepEqual(engine.selectSubBCFeedSize(120.0), { liquid: 19.05, highGas: 34.93, lowGas: 41.28 });
});

test('S-3P: 端末系統で子BCへの辺が3管・BOMに3管とも計上される', () => {
  const engine = loadEngine();
  const tree = outdoor('o', 45.0, [
    bc('bc', [subBc('sbc', [indoor('i1', 14.0, 8), indoor('i2', 14.0, 8)], 10), indoor('i3', 5.6, 6)], 12),
  ]);
  const r = engine.calculateSystem(tree, 'city_multi_r2');
  const subEdge = r.tree.children[0].children[0];
  deepEqual(subEdge.pipes, { type: '3pipe', liquid: 9.52, highGas: 19.05, lowGas: 22.2 });
  assert.equal(r.totals.liquidPipes[9.52], 32); // 子BC辺 10m + 室内機辺 8+8+6m
  assert.equal(r.totals.highGasPipes[19.05], 10);
  assert.equal(r.totals.lowGasPipes[22.2], 10);
  assert.equal(subEdge.modelNumber, 'CMB-P104V-KB');
});

test('S-3P: R2 の 2分岐ジョイントは D4 §9-3-1 の型番', () => {
  const engine = loadEngine();
  assert.equal(engine.selectR2BranchJointModel(20.0), 'CMY-Y102SS-G2');
  assert.equal(engine.selectR2BranchJointModel(25.0), 'CMY-Y102LS-G2');
  const tree = outdoor('o', 22.4, [
    bc('bc', [branch('b', [indoor('i1', 5.6, 5), indoor('i2', 5.6, 5)], 8)], 10),
  ]);
  const r = engine.calculateSystem(tree, 'city_multi_r2');
  assert.equal(r.tree.children[0].children[0].jointModel, 'CMY-Y102SS-G2');
  assert.equal(r.totals.joints['CMY-Y102SS-G2'], 1);
});

// ---------------------------------------------------------------- S-SIZEUP / UI
test('S-SIZEUP: 90m 則の誤った主張が UI から除去されている', () => {
  const ui = fs.readFileSync(UI, 'utf8');
  const index = fs.readFileSync(INDEX, 'utf8');
  assert.equal(ui.includes('最遠配管相当長が90m以上の場合、液管・ガス管共に1サイズアップ'), false);
  assert.equal(ui.includes('主管サイズUP時：液φ22.2/ガスφ41.28'), false);
  assert.equal(index.includes('最遠長90m以上または手動設定時'), false);
  assert.equal(index.includes('完全準拠'), false);
  // 則が存在しない旨の注記が残っていること
  assert.equal(ui.includes('という則は公式資料にない'), true);
  assert.equal(index.includes('Mr.Slim・国内向けEM-A機種は未照合'), true);
});

test('UI: マスターテーブルが訂正後の公式値になっている', () => {
  const ui = fs.readFileSync(UI, 'utf8');
  assert.equal(ui.includes('P850 〜 P1350'), true); // Y Pipe A 表
  assert.equal(ui.includes('CMB-P104V-KB のみ'), true); // 子BC
  assert.equal(ui.includes('CMB-P108V-JA'), true); // 親BC JA 機種
  assert.equal(ui.includes('高圧・低圧ガス管の2管（液管なし）'), true); // R2 室外機〜親BC
  assert.equal(ui.includes('CMB-P108V-KB (5〜8台)'), false);
});

// ---------------------------------------------------------------- 変更しないもの
test('変更しないもの: 子BC下流 35.0kW 超の警告は従来どおり', () => {
  const engine = loadEngine();
  const tree = outdoor('o', 45.0, [
    bc('bc', [subBc('sbc', [indoor('i1', 14.0, 5), indoor('i2', 14.0, 5), indoor('i3', 14.0, 5)], 10)], 12),
  ]);
  const r = engine.calculateSystem(tree, 'city_multi_r2');
  assert.equal(r.warnings.some((w) => w.type === 'danger' && w.message.includes('35.0kW')), true);
});

test('変更しないもの: R2 で BC を経由しない接続は危険警告のままで BOM に計上しない', () => {
  const engine = loadEngine();
  const tree = outdoor('o', 22.4, [indoor('i1', 5.6, 7)]);
  const r = engine.calculateSystem(tree, 'city_multi_r2');
  assert.equal(r.warnings.some((w) => w.type === 'danger' && w.message.includes('BCコントローラーが必要です')), true);
  deepEqual(r.totals.liquidPipes, {});
  deepEqual(r.totals.highGasPipes, {});
  deepEqual(r.totals.lowGasPipes, {});
});

test('変更しないもの: Mr.Slim は従来どおり selectTwoPipeSize を全区間に用いる', () => {
  const engine = loadEngine();
  const tree = outdoor('o', 14.0, [branch('b', [indoor('i1', 5.6, 6)], 8)]);
  const r = engine.calculateSystem(tree, 'mr_slim_multi');
  deepEqual(r.tree.children[0].pipes, { type: '2pipe', liquid: 9.52, gas: 15.88 });
  deepEqual(r.tree.children[0].children[0].pipes, { type: '2pipe', liquid: 9.52, gas: 15.88 });
});

test('変更しないもの: 手動サイズアップは R2 室外機〜親BCのガス管に1ランク適用（液管は存在しない）', () => {
  const engine = loadEngine();
  deepEqual(engine.selectR2OutdoorToBCSize(22.4, true), { highGas: 19.05, lowGas: 22.2 });
  deepEqual(engine.selectYPipeASize(22.4, true), { liquid: 12.7, gas: 25.4 });
});
