/**
 * Panasonic GHP 公式照合にもとづく訂正の回帰テスト。
 * 実行: node --test refrigerant-sizer/tests/panasonic-ghp-corrections.test.cjs
 * 根拠: パナソニック「冷媒配管設計」U-GZ710S1DRE（4ページ、450～710形・2管式）。
 * SHA-256 898b47d58a061a94d013e93947c9ab49f8fa0f8b975699a4f0e0c2eefe8176a8。
 * 355形・850形、3管式MF、ツインドライブ、相当長換算は同資料の対象外のため旧来値のまま。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ENGINE = path.join(__dirname, '..', 'panasonic-ghp-refrigerant-sizer', 'js', 'engine.js');
const UI = path.join(__dirname, '..', 'panasonic-ghp-refrigerant-sizer', 'js', 'ui.js');

function loadEngine() {
  const source = fs.readFileSync(ENGINE, 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source + '\n;globalThis.__Engine = RefrigerantSizerEngine;', context, { filename: ENGINE });
  return new context.__Engine();
}

function indoor(id, capacity, length) {
  return { id, type: 'indoor', capacity, length, children: [] };
}

// 室外機（容量 outdoorKw）→ 分岐（長さ branchLength）→ 室内機1台（容量 indoorKw）。
function simpleTree(outdoorKw, branchLength, indoorKw, indoorLength = 10) {
  return {
    id: 'root', type: 'outdoor', capacity: outdoorKw, length: 0,
    children: [{
      id: 'branch', type: 'branch', length: branchLength,
      children: [indoor('i1', indoorKw, indoorLength)],
    }],
  };
}

// 室外機 → 第一分岐 → 室内機（合計容量 totalKw を1台で表現）。
function branchDownstream(outdoorKw, totalKw) {
  return simpleTree(outdoorKw, 10, totalKw);
}

function calc(outdoorKw, totalKw, seriesId = 'panasonic_ghp_e_series') {
  return loadEngine().calculateSystem(branchDownstream(outdoorKw, totalKw), seriesId, false);
}

// ---------------------------------------------------------------- D-01～D-10
test('D-01/D-02: 450形・分岐後主配管 〜5.6kW は液9.52／ガス15.88（旧 6.35／12.7）', () => {
  const r = calc(45.0, 5.6);
  assert.equal(r.tree.children[0].pipeLiquid, '9.52');
  assert.equal(r.tree.children[0].pipeGas, '15.88');
});

test('D-03: 450形・16.1～28.0kW のガスは 15.88（旧 19.05／22.2）', () => {
  for (const kw of [20.0, 28.0]) {
    const r = calc(45.0, kw);
    assert.equal(r.tree.children[0].pipeLiquid, '9.52', `liquid at ${kw}`);
    assert.equal(r.tree.children[0].pipeGas, '15.88', `gas at ${kw}`);
  }
});

test('D-05/D-06: 450形・28.1～45.0kW は液9.52／ガス22.22（35.5以下）と液12.7／ガス25.4（35.6以上）', () => {
  const a = calc(45.0, 35.0);
  assert.equal(a.tree.children[0].pipeLiquid, '9.52');
  assert.equal(a.tree.children[0].pipeGas, '22.22');
  const b = calc(45.0, 40.0);
  assert.equal(b.tree.children[0].pipeLiquid, '12.7');
  assert.equal(b.tree.children[0].pipeGas, '25.4');
  const c = calc(45.0, 45.0);
  assert.equal(c.tree.children[0].pipeLiquid, '12.7');
  assert.equal(c.tree.children[0].pipeGas, '25.4');
});

test('D-07/D-08/D-09/D-10: 45.1kW超の液管は450形 12.7、560/710形 15.88。ガスは 28.58（旧 31.75／38.1）', () => {
  const a450 = calc(45.0, 50.0);
  assert.equal(a450.tree.children[0].pipeLiquid, '12.7');
  assert.equal(a450.tree.children[0].pipeGas, '28.58');
  const b450 = calc(45.0, 80.0);
  assert.equal(b450.tree.children[0].pipeLiquid, '12.7');
  assert.equal(b450.tree.children[0].pipeGas, '28.58');
  const a560 = calc(56.0, 50.0);
  assert.equal(a560.tree.children[0].pipeLiquid, '15.88');
  assert.equal(a560.tree.children[0].pipeGas, '28.58');
  const a710 = calc(71.0, 80.0);
  assert.equal(a710.tree.children[0].pipeLiquid, '15.88');
  assert.equal(a710.tree.children[0].pipeGas, '28.58');
  // 境界：ちょうど 56.0kW は 45.1～56.0 区分、ちょうど 142.0kW は表の上限。
  const edge = calc(45.0, 142.0);
  assert.equal(edge.tree.children[0].pipeLiquid, '12.7');
  assert.equal(edge.tree.children[0].pipeGas, '28.58');
});

test('D-11: 室外配管（LA）は形式固定。560/710形は下流28.0kWでも液15.88／ガス28.58', () => {
  const r560 = calc(56.0, 28.0);
  assert.equal(r560.tree.pipeLiquid, '15.88');
  assert.equal(r560.tree.pipeGas, '28.58');
  const r710 = calc(71.0, 28.0);
  assert.equal(r710.tree.pipeLiquid, '15.88');
  assert.equal(r710.tree.pipeGas, '28.58');
  const r450 = calc(45.0, 28.0);
  assert.equal(r450.tree.pipeLiquid, '12.7');
  assert.equal(r450.tree.pipeGas, '28.58');
});

test('D-12/D-13/D-14: 室内機接続配管は公式表（2.2～5.6kW 液9.52、16.0kW ガス15.88、22.4kW ガス19.05、28.0kW ガス22.22）', () => {
  const cases = [
    [2.2, '9.52', '12.7'],
    [5.6, '9.52', '12.7'],
    [16.0, '9.52', '15.88'],
    [22.4, '9.52', '19.05'],
    [28.0, '9.52', '22.22'],
  ];
  for (const [kw, liquid, gas] of cases) {
    const r = calc(45.0, kw);
    const node = r.tree.children[0].children[0];
    assert.equal(node.pipeLiquid, liquid, `indoor liquid at ${kw}kW`);
    assert.equal(node.pipeGas, gas, `indoor gas at ${kw}kW`);
  }
});

test('D-12/D-14: BS下流の室内機接続配管も公式表（MF・3管式の室内機）', () => {
  const engine = loadEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 56, length: 0,
    children: [{
      id: 'branch', type: 'branch', length: 10,
      children: [{
        id: 'bs', type: 'bs_unit', length: 1,
        children: [indoor('i1', 22.4, 10)],
      }],
    }],
  };
  const r = engine.calculateSystem(tree, 'panasonic_ghp_multi_free', false);
  const node = r.tree.children[0].children[0].children[0];
  assert.equal(node.pipeLiquid, '9.52');
  assert.equal(node.pipeGas, '19.05');
  // 小容量も公式表どおり。
  tree.children[0].children[0].children[0].capacity = 5.6;
  const r2 = engine.calculateSystem(tree, 'panasonic_ghp_multi_free', false);
  const node2 = r2.tree.children[0].children[0].children[0];
  assert.equal(node2.pipeLiquid, '9.52');
  assert.equal(node2.pipeGas, '12.7');
});

// ---------------------------------------------------------------- B-01
test('B-01: 分岐管セットは APR-P160B／APR-P680B／SGP-PCH1400K（旧 CZ-KGxxT）', () => {
  const cases = [
    [10.0, 'APR-P160B'],
    [16.0, 'APR-P160B'],
    [20.0, 'APR-P680B'],
    [35.5, 'APR-P680B'],
    [50.0, 'APR-P680B'],
    [71.0, 'APR-P680B'],
    [80.0, 'SGP-PCH1400K'],
  ];
  for (const [kw, model] of cases) {
    const r = calc(45.0, kw);
    assert.equal(r.tree.children[0].jointModel, model, `joint at ${kw}kW`);
  }
});

// ---------------------------------------------------------------- L-01/L-02/L-04
test('L-01: 室内機最多台数は全シリーズ 24台。超過で警告', () => {
  const engine = loadEngine();
  for (const seriesId of Object.keys(engine.SERIES_DATABASE)) {
    assert.equal(engine.SERIES_DATABASE[seriesId].maxIndoorUnits, 24, seriesId);
  }
  const many = {
    id: 'root', type: 'outdoor', capacity: 45, length: 0,
    children: [{
      id: 'branch', type: 'branch', length: 10,
      children: Array.from({ length: 25 }, (_, i) => indoor('i' + i, 2.2, 10)),
    }],
  };
  const over = engine.calculateSystem(many, 'panasonic_ghp_e_series', false);
  assert.ok(over.warnings.some(w => w.includes('25台') && w.includes('24台')));
  many.children[0].children.pop();
  const ok = engine.calculateSystem(many, 'panasonic_ghp_e_series', false);
  assert.equal(ok.totals.indoorCount, 24);
  assert.ok(!ok.warnings.some(w => w.includes('接続台数')));
});

test('L-02: L1上限は実長 170m。超過で警告、ちょうど 170m は警告なし', () => {
  const engine = loadEngine();
  assert.equal(engine.SERIES_DATABASE.panasonic_ghp_e_series.maxFarDistance, 170);
  const over = engine.calculateSystem(simpleTree(45.0, 100, 22.4, 80), 'panasonic_ghp_e_series', false);
  assert.equal(over.totals.longestPath, 180);
  assert.ok(over.warnings.some(w => w.includes('最遠配管実長') && w.includes('170m')));
  const ok = engine.calculateSystem(simpleTree(45.0, 100, 22.4, 70), 'panasonic_ghp_e_series', false);
  assert.equal(ok.totals.longestPath, 170);
  assert.ok(!ok.warnings.some(w => w.includes('最遠配管実長')));
});

test('L-04: 接続容量率は 50～200%。150% は警告なし、210% は 200% 超の警告', () => {
  const mid = calc(45.0, 67.5); // 150%
  assert.ok(!mid.warnings.some(w => w.includes('接続容量率')));
  const over = calc(45.0, 94.5); // 210%
  assert.ok(over.warnings.some(w => w.includes('200%')));
  const under = calc(45.0, 22.4); // 49.8%
  assert.ok(under.warnings.some(w => w.includes('50% 未満')));
});

// ---------------------------------------------------------------- L-05/L-07
test('L-05: ΔL は第一分岐からの最大長と最小長の差。70m以下は警告なし、超過で警告', () => {
  const engine = loadEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 45, length: 0,
    children: [{
      id: 'b1', type: 'branch', length: 10,
      children: [
        indoor('i1', 11.2, 80),
        { id: 'b2', type: 'branch', length: 5, children: [indoor('i2', 11.2, 5)] },
      ],
    }],
  };
  const r = engine.calculateSystem(tree, 'panasonic_ghp_e_series', false);
  // 経路：b1→i1 は 10+80=90、b1→b2→i2 は 10+5+5=20。ΔL=70。
  assert.equal(r.totals.deltaL, 70);
  assert.ok(!r.warnings.some(w => w.includes('ΔL')));
  tree.children[0].children[0].length = 90;
  const over = engine.calculateSystem(tree, 'panasonic_ghp_e_series', false);
  // 経路：10+90=100 と 20。ΔL=80。
  assert.equal(over.totals.deltaL, 80);
  assert.ok(over.warnings.some(w => w.includes('ΔL') && w.includes('70m')));
});

test('L-05: 分岐がない系統の ΔL は判定不可（null）で警告なし', () => {
  const engine = loadEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 45, length: 0,
    children: [indoor('i1', 22.4, 10)],
  };
  const r = engine.calculateSystem(tree, 'panasonic_ghp_e_series', false);
  assert.equal(r.totals.deltaL, null);
  assert.ok(!r.warnings.some(w => w.includes('ΔL')));
});

test('L-07: 分岐配管長は 30m以下。31m で警告、30m で警告なし。LA（第一分岐の長さ）は対象外', () => {
  const engine = loadEngine();
  const over = engine.calculateSystem(simpleTree(45.0, 100, 22.4, 31), 'panasonic_ghp_e_series', false);
  assert.equal(over.totals.branchPipeMaxLength, 31);
  assert.ok(over.warnings.some(w => w.includes('分岐配管長') && w.includes('30m')));
  const ok = engine.calculateSystem(simpleTree(45.0, 100, 22.4, 30), 'panasonic_ghp_e_series', false);
  assert.equal(ok.totals.branchPipeMaxLength, 30);
  assert.ok(!ok.warnings.some(w => w.includes('分岐配管長')));
});

// ---------------------------------------------------------------- L-09
test('L-09: UIは「最遠配管相当長」ではなく「最遠配管実長」と表示する', () => {
  const ui = fs.readFileSync(UI, 'utf8');
  assert.ok(ui.includes('最遠配管実長'));
  assert.ok(!ui.includes('最遠配管相当長'));
  assert.ok(ui.includes('φ22.22'));
  assert.ok(!ui.includes('φ38.10'));
});

// ---------------------------------------------------------------- 変更しないもの
test('変更しないもの: 355形・850形は公式資料の対象外のため旧来表のまま', () => {
  const r355 = calc(35.5, 28.0);
  assert.equal(r355.tree.children[0].pipeLiquid, '9.52');
  assert.equal(r355.tree.children[0].pipeGas, '22.2');
  assert.equal(r355.tree.children[0].jointModel, 'CZ-KG45T');
  const r850 = calc(85.0, 80.0);
  assert.equal(r850.tree.children[0].pipeLiquid, '19.05');
  assert.equal(r850.tree.children[0].pipeGas, '38.1');
  const i355 = calc(35.5, 5.6);
  assert.equal(i355.tree.children[0].children[0].pipeLiquid, '6.35');
});

test('変更しないもの: 3管式（MF）の管径表・継手は未照合のため旧来値のまま', () => {
  const engine = loadEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 56, length: 0,
    children: [{
      id: 'branch', type: 'branch', length: 10,
      children: [{
        id: 'bs', type: 'bs_unit', length: 1,
        children: [indoor('i1', 11.2, 10)],
      }],
    }],
  };
  const r = engine.calculateSystem(tree, 'panasonic_ghp_multi_free', false);
  // 3管式の室外機は下流容量（室内機合計 11.2kW）で選定される旧来動作のまま。
  assert.equal(r.tree.pipeLiquid, '12.7');
  assert.equal(r.tree.pipeHighGas, '19.05');
  assert.equal(r.tree.pipeLowGas, '28.58');
  assert.equal(r.tree.children[0].pipeLiquid, '9.52');
  assert.equal(r.tree.children[0].pipeHighGas, '15.88');
  assert.equal(r.tree.children[0].pipeLowGas, '19.05');
  assert.equal(r.tree.children[0].jointModel, 'CZ-P28F2R');
  // 下流合計 56.0kW の場合も旧来の3管式室外機行のまま。
  tree.children[0].children[0].children[0].capacity = 28.0;
  tree.children[0].children[0].children.push(indoor('i2', 28.0, 10));
  const r2 = engine.calculateSystem(tree, 'panasonic_ghp_multi_free', false);
  assert.equal(r2.tree.pipeLiquid, '15.88');
  assert.equal(r2.tree.pipeHighGas, '22.2');
  assert.equal(r2.tree.pipeLowGas, '28.58');
});

test('変更しないもの: サイズアップ停止と【型式・施工基準未照合】警告を維持する', () => {
  const engine = loadEngine();
  const baseline = engine.calculateSystem(simpleTree(45.0, 81, 22.4), 'panasonic_ghp_e_series', false);
  const over = engine.calculateSystem(simpleTree(45.0, 81, 22.4), 'panasonic_ghp_e_series', true);
  assert.ok(over.warnings.some(w => w.includes('【サイズアップ未適用】')));
  assert.equal(over.tree.isSizedUp, undefined);
  assert.equal(over.tree.pipeLiquid, baseline.tree.pipeLiquid);
  assert.equal(over.tree.pipeGas, baseline.tree.pipeGas);
  assert.equal(over.tree.children[0].pipeLiquid, baseline.tree.children[0].pipeLiquid);
  assert.equal(over.tree.children[0].pipeGas, baseline.tree.children[0].pipeGas);
  assert.ok(baseline.warnings.some(w => w.includes('【型式・施工基準未照合】')));
});

test('変更しないもの: 総配管実長の制限値（300/250/200m）は公式対応値がないため変更しない', () => {
  const engine = loadEngine();
  assert.equal(engine.SERIES_DATABASE.panasonic_ghp_e_series.maxPipingTotal, 300);
  assert.equal(engine.SERIES_DATABASE.panasonic_ghp_standard.maxPipingTotal, 250);
  assert.equal(engine.SERIES_DATABASE.panasonic_ghp_cold.maxPipingTotal, 200);
});
