/**
 * Yanmar GHP verification corrections regression tests.
 * 実行: node --test refrigerant-sizer/tests/yanmar-ghp-corrections.test.cjs
 * 根拠: ヤンマー GHP総合カタログ 2022.09 (041F0-J00740) のテキスト抽出による照合
 * （~/workspace/refrigerant-sizer-verification/yanmar-ghp/REPORT.md）。
 * カタログ表記 φ15.9/19.1/28.6/31.8 はコードの 15.88/19.05/28.58/31.75 と同径。
 * 公式資料にない値（3管式枝管径、型式ラインアップ等）は変更しておらず、
 * このファイルでも「変更しないもの」として固定する。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEngine() {
  const file = path.join(__dirname, '..', 'yanmar-ghp-refrigerant-sizer', 'js', 'engine.js');
  const source = fs.readFileSync(file, 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source + '\n;globalThis.__Engine = RefrigerantSizerEngine;', context, { filename: file });
  return new context.__Engine();
}

let seq = 0;
function node(type, props, children = []) {
  return { id: 'n' + (seq++), type, children, ...props };
}
function twoPipeTree(outdoorKw, indoorCaps, branchLength = 10, indoorLength = 10) {
  return node('outdoor', { capacity: outdoorKw, length: 0 }, [
    node('branch', { length: branchLength }, indoorCaps.map(c => node('indoor', { capacity: c, length: indoorLength }))),
  ]);
}
function threePipeTree(outdoorKw, indoorCaps, branchLength = 10, indoorLength = 10) {
  return node('outdoor', { capacity: outdoorKw, length: 0 }, [
    node('branch', { length: branchLength }, [
      node('bs_unit', { length: 1 }, indoorCaps.map(c => node('indoor', { capacity: c, length: indoorLength }))),
    ]),
  ]);
}

// 主管（2管式）: 室外機定格容量で選定する。室内機合計は 28.0kW 固定で、
// 室外機容量だけを変えることで「下流合計で選定しない」ことを確認する。
const mainPipeCases = [
  // [室外機定格容量kW, ガス管, 液管]
  [14.0, '15.88', '9.52'],
  [22.4, '19.05', '9.52'],
  [28.0, '22.2', '9.52'],
  [35.5, '25.4', '12.7'],
  [45.0, '28.58', '12.7'],
  [56.0, '28.58', '15.88'],
  [71.0, '31.75', '19.05'],
  [85.0, '31.75', '19.05'],
];
for (const [kw, gas, liquid] of mainPipeCases) {
  test(`主管: 室外機 ${kw}kW はガス φ${gas}／液 φ${liquid}`, () => {
    const engine = loadEngine();
    const result = engine.calculateSystem(twoPipeTree(kw, [28.0]), 'yanmar_ghp_highpower', false);
    assert.equal(result.tree.pipeGas, gas);
    assert.equal(result.tree.pipeLiquid, liquid);
  });
}

test('主管: 室外機56.0kWに室内機合計22.4kWでも主管は28.58/15.88のまま', () => {
  // 接続率40%でも主管径は室外機定格で決まる。旧来は下流合計22.4kWで19.05/9.52になった。
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(56.0, [22.4]), 'yanmar_ghp_highpower', false);
  assert.equal(result.tree.pipeGas, '28.58');
  assert.equal(result.tree.pipeLiquid, '15.88');
});

test('主管: 室外機の定格容量が不明な場合は下流合計にフォールバックする', () => {
  const engine = loadEngine();
  const tree = node('outdoor', { length: 0 }, [
    node('branch', { length: 10 }, [node('indoor', { capacity: 45.0, length: 10 })]),
  ]);
  const result = engine.calculateSystem(tree, 'yanmar_ghp_highpower', false);
  assert.equal(result.tree.pipeGas, '28.58');
  assert.equal(result.tree.pipeLiquid, '12.7');
});

// 枝管（2管式）: 下流室内機合計容量で選定する。
const branchCases = [
  // [下流合計kW, ガス管, 液管]
  [5.6, '15.88', '9.52'],
  [14.0, '15.88', '9.52'],
  [22.4, '22.2', '9.52'],
  [28.0, '22.2', '9.52'],
  [33.0, '28.58', '12.7'],
  [45.0, '28.58', '12.7'],
  [47.0, '28.58', '15.88'],
  [71.0, '31.75', '19.05'],
  [100.0, '31.75', '19.05'],
];
for (const [kw, gas, liquid] of branchCases) {
  test(`枝管: 下流合計 ${kw}kW はガス φ${gas}／液 φ${liquid}`, () => {
    const engine = loadEngine();
    const result = engine.calculateSystem(twoPipeTree(85.0, [kw]), 'yanmar_ghp_highpower', false);
    assert.equal(result.tree.children[0].pipeGas, gas);
    assert.equal(result.tree.children[0].pipeLiquid, liquid);
  });
}

// 室内接続配管（2管式）: 室内機容量で選定する。
const indoorCases = [
  // [室内機容量kW, ガス管, 液管]
  [2.2, '12.7', '6.35'],
  [16.0, '15.88', '9.52'],
  [22.4, '19.05', '9.52'],
  [28.0, '22.2', '9.52'],
];
for (const [kw, gas, liquid] of indoorCases) {
  test(`室内接続: 室内機 ${kw}kW はガス φ${gas}／液 φ${liquid}`, () => {
    const engine = loadEngine();
    const result = engine.calculateSystem(twoPipeTree(45.0, [kw]), 'yanmar_ghp_highpower', false);
    const indoor = result.tree.children[0].children[0];
    assert.equal(indoor.pipeGas, gas);
    assert.equal(indoor.pipeLiquid, liquid);
  });
}

// 主管（3管式）: 室外機定格容量で選定する。
const threePipeOutdoorCases = [
  // [室外機定格容量kW, 液管, 高圧ガス管, 低圧ガス管]
  [45.0, '12.7', '19.05', '28.58'],
  [56.0, '15.88', '22.2', '28.58'],
  [71.0, '19.05', '25.4', '31.75'],
  [85.0, '19.05', '28.58', '31.75'],
];
for (const [kw, liquid, highGas, lowGas] of threePipeOutdoorCases) {
  test(`主管(3管式): 室外機 ${kw}kW は液 φ${liquid}／高圧ガス φ${highGas}／低圧ガス φ${lowGas}`, () => {
    const engine = loadEngine();
    const result = engine.calculateSystem(threePipeTree(kw, [11.2]), 'yanmar_ghp_exe_captor', false);
    assert.equal(result.tree.pipeLiquid, liquid);
    assert.equal(result.tree.pipeHighGas, highGas);
    assert.equal(result.tree.pipeLowGas, lowGas);
  });
}

test('主管(3管式): 85.0kWの吸入ガスは31.75（旧来の38.1は誤り）', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(85.0, [28.0]), 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.pipeLowGas, '31.75');
});

// 分岐管（2管式）: Y分岐管の公式品番・区分。
const joint2Cases = [
  // [下流合計kW, 品番]
  [10.0, 'RBPP22Y'],
  [22.4, 'RBPP33Y'],
  [33.0, 'RBPP72Y'],
  [71.0, 'RBPP104Y'],
];
for (const [kw, model] of joint2Cases) {
  test(`分岐管: 下流合計 ${kw}kW は ${model}`, () => {
    const engine = loadEngine();
    const result = engine.calculateSystem(twoPipeTree(85.0, [kw]), 'yanmar_ghp_highpower', false);
    assert.equal(result.tree.children[0].jointModel, model);
  });
}

test('分岐管: 第1分岐は下流112kWでRBPP218Y、第2分岐はRBPP104Y', () => {
  const engine = loadEngine();
  const tree = node('outdoor', { capacity: 85.0, length: 0 }, [
    node('branch', { length: 10 }, [
      node('branch', { length: 10 }, [28.0, 28.0, 28.0, 28.0].map(c => node('indoor', { capacity: c, length: 10 }))),
    ]),
  ]);
  const result = engine.calculateSystem(tree, 'yanmar_ghp_highpower', false);
  assert.equal(result.tree.children[0].jointModel, 'RBPP218Y');
  assert.equal(result.tree.children[0].children[0].jointModel, 'RBPP104Y');
});

// 分岐管（3管式）: 第1分岐は室外機型式、第2分岐以降は下流合計で選定する。
test('分岐管(3管式): 第1分岐は室外機56.0kWでRBPP72FY', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(56.0, [11.2]), 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.children[0].jointModel, 'RBPP72FY');
});

test('分岐管(3管式): 第1分岐は室外機85.0kWでRBPP104FY', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(85.0, [11.2]), 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.children[0].jointModel, 'RBPP104FY');
});

test('分岐管(3管式): 第2分岐は下流合計10.0kWでRBPP22FY', () => {
  const engine = loadEngine();
  const tree = node('outdoor', { capacity: 56.0, length: 0 }, [
    node('branch', { length: 10 }, [
      node('branch', { length: 10 }, [
        node('bs_unit', { length: 1 }, [node('indoor', { capacity: 10.0, length: 10 })]),
      ]),
    ]),
  ]);
  const result = engine.calculateSystem(tree, 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.children[0].children[0].jointModel, 'RBPP22FY');
});

// BSユニット: 下流合計Qと台数で選定する。
test('BS: Q11.0kW・5台はYBSVP112C', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(56.0, [2.2, 2.2, 2.2, 2.2, 2.2]), 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.children[0].children[0].modelNumber, 'YBSVP112C');
});

test('BS: Q10.8kW・6台はYBSVP180C（Qは112C範囲内だが台数超過）', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(56.0, [1.8, 1.8, 1.8, 1.8, 1.8, 1.8]), 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.children[0].children[0].modelNumber, 'YBSVP180C');
});

test('BS: Q17.6kW・8台はYBSVP180C', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(56.0, [2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2]), 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.children[0].children[0].modelNumber, 'YBSVP180C');
});

test('BS: Q28.0kWはYBSVP280C', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(56.0, [28.0]), 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.children[0].children[0].modelNumber, 'YBSVP280C');
});

test('BS: Q40.0kWは最大のYBSVP280C（公式範囲超過、未決事項）', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(85.0, [40.0]), 'yanmar_ghp_exe_captor', false);
  assert.equal(result.tree.children[0].children[0].modelNumber, 'YBSVP280C');
});

// 制限値。
test('制限値: 総配管長制限は全シリーズ640m', () => {
  const engine = loadEngine();
  for (const [id, series] of Object.entries(engine.SERIES_DATABASE)) {
    assert.equal(series.maxPipingTotal, 640, id);
  }
});

test('制限値: 最遠配管長は全シリーズ170m', () => {
  const engine = loadEngine();
  for (const [id, series] of Object.entries(engine.SERIES_DATABASE)) {
    assert.equal(series.maxFarDistance, 170, id);
  }
});

test('総配管長400mでは警告しない（旧制限300mは誤り）', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4], 390, 10), 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.totalPipingLength, 400);
  assert.ok(!result.warnings.some(w => w.includes('総配管実長')));
});

test('総配管長650mでは警告する', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4], 640, 10), 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.totalPipingLength, 650);
  assert.ok(result.warnings.some(w => w.includes('総配管実長')));
});

test('第一分岐後90mでは警告しない', () => {
  // 第一分岐後の配管長は第一分岐より下流だけを測る（室外機→第一分岐は含めない）。
  // 旧定義では分岐長80m＋室内機10m＝90mとしていたが、正しくは下流の90mで判定する。
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4], 10, 90), 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.firstBranchToIndoorMax, 90);
  assert.ok(!result.warnings.some(w => w.includes('第一分岐後')));
});

test('第一分岐後91mでは警告する', () => {
  // 旧定義では分岐長81m＋室内機10m＝91mで警告していたが、正しくは下流の91mで警告する。
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4], 10, 91), 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.firstBranchToIndoorMax, 91);
  assert.ok(result.warnings.some(w => w.includes('第一分岐後')));
});

test('第一分岐後: 室外機→第一分岐81m＋分岐→室内機10mは10mであり警告しない', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4], 81, 10), 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.firstBranchToIndoorMax, 10);
  assert.ok(!result.warnings.some(w => w.includes('第一分岐後')));
  // 総配管長・最遠配管長は室外機→第一分岐の81mを含めたまま変わらない。
  assert.equal(result.totals.longestPath, 91);
  assert.equal(result.totals.totalPipingLength, 91);
});

test('第一分岐後: 多段分岐では第一分岐より下流の合計が最大値になる', () => {
  const engine = loadEngine();
  const tree = node('outdoor', { capacity: 45.0, length: 0 }, [
    node('branch', { length: 20 }, [
      node('branch', { length: 30 }, [node('indoor', { capacity: 22.4, length: 40 })]),
    ]),
  ]);
  const result = engine.calculateSystem(tree, 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.firstBranchToIndoorMax, 70);
  assert.equal(result.totals.longestPath, 90);
  assert.ok(!result.warnings.some(w => w.includes('第一分岐後')));
});

test('第一分岐後: 複数室内機では最も遠い室内機までの下流経路が最大値になる', () => {
  const engine = loadEngine();
  const tree = node('outdoor', { capacity: 45.0, length: 0 }, [
    node('branch', { length: 81 }, [
      node('indoor', { capacity: 11.2, length: 10 }),
      node('indoor', { capacity: 11.2, length: 25 }),
      node('indoor', { capacity: 11.2, length: 15 }),
    ]),
  ]);
  const result = engine.calculateSystem(tree, 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.firstBranchToIndoorMax, 25);
  assert.ok(!result.warnings.some(w => w.includes('第一分岐後')));
});

test('第一分岐後: 下流合計ちょうど90.0mでは警告せず、90.1mでは警告する', () => {
  const engine = loadEngine();
  const build = (secondBranchLength) => node('outdoor', { capacity: 45.0, length: 0 }, [
    node('branch', { length: 5 }, [
      node('branch', { length: secondBranchLength }, [node('indoor', { capacity: 22.4, length: 50 })]),
    ]),
  ]);
  const atLimit = engine.calculateSystem(build(40), 'yanmar_ghp_highpower', false);
  assert.equal(atLimit.totals.firstBranchToIndoorMax, 90);
  assert.ok(!atLimit.warnings.some(w => w.includes('第一分岐後')));
  const overLimit = engine.calculateSystem(build(40.1), 'yanmar_ghp_highpower', false);
  assert.ok(Math.abs(overLimit.totals.firstBranchToIndoorMax - 90.1) < 1e-9);
  assert.ok(overLimit.warnings.some(w => w.includes('第一分岐後')));
});

test('第一分岐後: 下流95mの超過系では警告が残る（10m＋第2分岐50m＋室内機45m）', () => {
  const engine = loadEngine();
  const tree = node('outdoor', { capacity: 45.0, length: 0 }, [
    node('branch', { length: 10 }, [
      node('branch', { length: 50 }, [node('indoor', { capacity: 22.4, length: 45 })]),
    ]),
  ]);
  const result = engine.calculateSystem(tree, 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.firstBranchToIndoorMax, 95);
  assert.equal(result.totals.longestPath, 105);
  assert.ok(result.warnings.some(w => w.includes('第一分岐後') && w.includes('95.0')));
});

test('総配管長640mちょうどでは警告しない', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4], 630, 10), 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.totalPipingLength, 640);
  assert.ok(!result.warnings.some(w => w.includes('総配管実長')));
});

test('最遠配管長170mちょうどでは警告しない', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4], 160, 10), 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.longestPath, 170);
  assert.ok(!result.warnings.some(w => w.includes('最遠配管実長')));
});

test('最遠配管長171mでは警告する', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4], 161, 10), 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.longestPath, 171);
  assert.ok(result.warnings.some(w => w.includes('最遠配管実長') && w.includes('170')));
});

test('最遠配管長は最も遠い分岐側の経路で判定する', () => {
  const engine = loadEngine();
  const tree = node('outdoor', { capacity: 45.0, length: 0 }, [
    node('branch', { length: 100 }, [node('indoor', { capacity: 11.2, length: 10 })]),
    node('branch', { length: 165 }, [node('indoor', { capacity: 11.2, length: 10 })]),
  ]);
  const result = engine.calculateSystem(tree, 'yanmar_ghp_highpower', false);
  assert.equal(result.totals.longestPath, 175);
  assert.ok(result.warnings.some(w => w.includes('最遠配管実長')));
});

// 集計表示の0m行ガード（変更は表示処理のみ）。既存テストにDOMハーネスがないため、
// ghp-sizeup-ui-safety.test.cjs と同じソース確認方式で固定する。
test('集計表示: GHP系4アプリのrenderTotalsは長さ0の径を表示しない', () => {
  const apps = [
    'yanmar-ghp-refrigerant-sizer',
    'panasonic-ghp-refrigerant-sizer',
    'aisin-ghp-refrigerant-sizer',
    'daikin-ghp-refrigerant-sizer',
  ];
  for (const app of apps) {
    const ui = fs.readFileSync(path.join(__dirname, '..', app, 'js', 'ui.js'), 'utf8');
    for (const bucket of ['liquidPipes', 'highGasPipes', 'lowGasPipes', 'gasPipes']) {
      assert.ok(ui.includes(`if (!(totals.${bucket}[size] > 0)) continue;`), `${app}: ${bucket}`);
    }
  }
});

test('接続容量率136.9%では警告する（上限130%は変更なし）', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [28.0, 28.0, 5.6]), 'yanmar_ghp_highpower', false);
  assert.ok(result.warnings.some(w => w.includes('接続容量率')));
});

// 変更しないもの。
test('変更しないもの: 【型式・施工基準未照合】警告は維持する', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4]), 'yanmar_ghp_highpower', false);
  assert.ok(result.warnings.some(w => w.includes('【型式・施工基準未照合】')));
});

test('変更しないもの: 手動サイズアップ指定でも増径しない', () => {
  const engine = loadEngine();
  const baseline = engine.calculateSystem(twoPipeTree(45.0, [28.0]), 'yanmar_ghp_highpower', false);
  const over = engine.calculateSystem(twoPipeTree(45.0, [28.0]), 'yanmar_ghp_highpower', true);
  assert.equal(over.tree.isSizedUp, undefined);
  assert.equal(over.tree.pipeLiquid, baseline.tree.pipeLiquid);
  assert.equal(over.tree.pipeGas, baseline.tree.pipeGas);
  assert.ok(over.warnings.some(w => w.includes('【サイズアップ未適用】')));
});

test('変更しないもの: 室外機型番はYG-450HPのまま', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4]), 'yanmar_ghp_highpower', false);
  assert.equal(result.tree.modelNumber, 'YG-450HP');
});

test('変更しないもの: 室内機型番はYNP-P224Fのまま', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(twoPipeTree(45.0, [22.4]), 'yanmar_ghp_highpower', false);
  assert.equal(result.tree.children[0].children[0].modelNumber, 'YNP-P224F');
});

test('変更しないもの: シリーズ名は変更しない', () => {
  const engine = loadEngine();
  assert.equal(engine.SERIES_DATABASE.yanmar_ghp_highpower.name, 'GHP ハイパワーエグゼ (R410A)');
  assert.equal(engine.SERIES_DATABASE.yanmar_ghp_standard.name, 'GHP 標準マルチ (Jシリーズ)');
  assert.equal(engine.SERIES_DATABASE.yanmar_ghp_chiller.name, 'GHP チラー / 寒冷地対応マルチ');
  assert.equal(engine.SERIES_DATABASE.yanmar_ghp_exe_captor.name, 'GHP エグゼキャプター (冷暖同時・HR仕様・3管式)');
});

test('変更しないもの: BS下流の室内機22.4kWは22.2のまま（暫定のため適用しない）', () => {
  const engine = loadEngine();
  const result = engine.calculateSystem(threePipeTree(56.0, [22.4]), 'yanmar_ghp_exe_captor', false);
  const indoor = result.tree.children[0].children[0].children[0];
  assert.equal(indoor.pipeGas, '22.2');
  assert.equal(indoor.pipeLiquid, '9.52');
});

test('変更しないもの: 3管式枝管は旧来値のまま（5-2表未読のため未検証）', () => {
  const engine = loadEngine();
  const result20 = engine.calculateSystem(threePipeTree(56.0, [20.0]), 'yanmar_ghp_exe_captor', false);
  const branch20 = result20.tree.children[0];
  assert.equal(branch20.pipeLiquid, '9.52');
  assert.equal(branch20.pipeHighGas, '19.05');
  assert.equal(branch20.pipeLowGas, '22.2');
  const result50 = engine.calculateSystem(threePipeTree(56.0, [50.0]), 'yanmar_ghp_exe_captor', false);
  const branch50 = result50.tree.children[0];
  assert.equal(branch50.pipeLiquid, '15.88');
  assert.equal(branch50.pipeHighGas, '25.4');
  assert.equal(branch50.pipeLowGas, '28.58');
});

test('変更しないもの: 最大室内機台数は旧来値のまま（公式は機種別で単一値にできない）', () => {
  const engine = loadEngine();
  assert.equal(engine.SERIES_DATABASE.yanmar_ghp_highpower.maxIndoorUnits, 36);
  assert.equal(engine.SERIES_DATABASE.yanmar_ghp_standard.maxIndoorUnits, 30);
  assert.equal(engine.SERIES_DATABASE.yanmar_ghp_chiller.maxIndoorUnits, 24);
  assert.equal(engine.SERIES_DATABASE.yanmar_ghp_exe_captor.maxIndoorUnits, 36);
});
