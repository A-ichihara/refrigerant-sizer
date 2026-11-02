const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// 決定事項D7の実装（2026-11-03）：UXE3分岐継手の品番置き換え。
// 根拠：UXE3専用ハンドブック（空調設備機器ハンドブック 冷暖フリー
// UXE3シリーズ、2014年4月、S技-146）§4-1・§4-2-1・§4-2-2。
// - 室内ユニット用分岐配管セット：APR-RZP224B（分岐後 22.4kW以下）／
//   APR-RZP680B（22.4kW超〜68.0kW以下）／APR-RZP1350B（68.0kW超〜135.0kW以下）。
//   UXE3の分岐ノード1か所につき1個、下流合計容量で選定する。
// - 室外ユニット用分岐配管セット：CZ-680BKE3（68.0kW以下）／
//   CZ-1350BKE3（68.0kW超〜135.0kW以下）。組合せ室外機の合流部に
//   グループ単位で1組だけ、組合せ合計容量で選定する。単体機では発生しない。
// - 旧 selectJointModel の CZ-P…KB2 は公式文書に存在しない品番であり、
//   fsv_uxe3 では一切生成しない。他シリーズの selectJointModel は変更しない。
// - L3チーズ分岐は現地手配品（品番なし）であり、購入品BOMに計上しない。

function indoor(id, capacity, length = 3) {
  return { id, name: id, type: 'indoor', capacity, length, children: [] };
}

// 室外機 -> 分岐b1 -> 電磁弁キット -> [分岐b2 -> 室内機x2, 室内機x1]
// b1 の下流合計は 22.4kW、b2 の下流合計は 11.2kW。
function makeTwoBranchTree() {
  return {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 28.0,
    children: [{
      id: 'b1', name: 'Branch 1', type: 'branch', length: 5,
      children: [{
        id: 'kit', name: 'Kit', type: 'solenoid_kit', length: 5,
        children: [
          {
            id: 'b2', name: 'Branch 2', type: 'branch', length: 3,
            children: [indoor('in1', 5.6), indoor('in2', 5.6)]
          },
          indoor('in3', 11.2)
        ]
      }]
    }]
  };
}

// 室外機 -> 分岐b1 -> 電磁弁キット -> 室内機x2（b1 下流合計 28.0kW）
function make680Tree() {
  return {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 45.0,
    children: [{
      id: 'b1', name: 'Branch 1', type: 'branch', length: 5,
      children: [{
        id: 'kit', name: 'Kit', type: 'solenoid_kit', length: 5,
        children: [indoor('in1', 14.0), indoor('in2', 14.0)]
      }]
    }]
  };
}

// 組合せ室外機（PA-P504UXE3 / PA-P560UXE3）のツリー。
// 分岐ノード3か所（いずれも下流 5.6kW）+ キット + 室内機。
function makeGroupTree({ outdoorKw, loLengthM }) {
  const tree = {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: outdoorKw,
    children: [{
      id: 'b1', name: 'Branch 1', type: 'branch', length: 10, children: [{
        id: 'b2', name: 'Branch 2', type: 'branch', length: 6, children: [{
          id: 'b3', name: 'Branch 3', type: 'branch', length: 4, children: [{
            id: 'kit', name: 'Kit', type: 'solenoid_kit', length: 8,
            children: [indoor('in1', 5.6)]
          }]
        }]
      }]
    }]
  };
  if (loLengthM !== undefined) tree.loLengthM = loLengthM;
  return tree;
}

test('D7 indoor joint thresholds: 22.4 / 68 / 135 boundaries are inclusive of the lower band', () => {
  const engine = new RefrigerantSizerEngine();
  assert.equal(engine.selectUxE3IndoorJointModel(0), 'APR-RZP224B');
  assert.equal(engine.selectUxE3IndoorJointModel(22.4), 'APR-RZP224B');
  assert.equal(engine.selectUxE3IndoorJointModel(22.5), 'APR-RZP680B');
  assert.equal(engine.selectUxE3IndoorJointModel(68.0), 'APR-RZP680B');
  assert.equal(engine.selectUxE3IndoorJointModel(68.1), 'APR-RZP1350B');
  assert.equal(engine.selectUxE3IndoorJointModel(135.0), 'APR-RZP1350B');
  // 135kW超はハンドブックに区分がない。従来関数の挙動に合わせ最大区分を返す
  // （UXE3の対応範囲・最大56.0kWでは発生せず、容量外は警告側で担保する）。
  assert.equal(engine.selectUxE3IndoorJointModel(135.1), 'APR-RZP1350B');
});

test('D7 outdoor joint thresholds: 68 / 135 boundaries are inclusive of the lower band', () => {
  const engine = new RefrigerantSizerEngine();
  assert.equal(engine.selectUxE3OutdoorJointModel(0), 'CZ-680BKE3');
  assert.equal(engine.selectUxE3OutdoorJointModel(50.4), 'CZ-680BKE3');
  assert.equal(engine.selectUxE3OutdoorJointModel(56.0), 'CZ-680BKE3');
  assert.equal(engine.selectUxE3OutdoorJointModel(68.0), 'CZ-680BKE3');
  assert.equal(engine.selectUxE3OutdoorJointModel(68.1), 'CZ-1350BKE3');
  assert.equal(engine.selectUxE3OutdoorJointModel(135.0), 'CZ-1350BKE3');
  assert.equal(engine.selectUxE3OutdoorJointModel(135.1), 'CZ-1350BKE3');
});

test('D7 BOM integration: each UXE3 branch node counts one APR-RZP set by downstream capacity', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeTwoBranchTree(), 'fsv_uxe3', false);

  const b1 = result.tree.children[0];
  const b2 = b1.children[0].children[0];
  assert.equal(b1.jointModel, 'APR-RZP224B'); // 下流合計 22.4kW（境界ちょうど）
  assert.equal(b2.jointModel, 'APR-RZP224B'); // 下流合計 11.2kW
  assert.equal(result.totals.joints['APR-RZP224B'], 2);
  // 単体室外機では室外ユニット用セットは発生しない。
  assert.equal(result.totals.joints['CZ-680BKE3'], undefined);
  assert.equal(result.totals.joints['CZ-1350BKE3'], undefined);
});

test('D7 BOM integration: branch downstream above 22.4kW counts APR-RZP680B', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(make680Tree(), 'fsv_uxe3', false);

  assert.equal(result.tree.children[0].jointModel, 'APR-RZP680B');
  assert.equal(result.totals.joints['APR-RZP680B'], 1);
  assert.equal(result.totals.joints['APR-RZP224B'], undefined);
});

test('D7 BOM integration: combination outdoor unit counts one CZ-680BKE3 for the group junction', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeGroupTree({ outdoorKw: 50.4, loLengthM: 5 }), 'fsv_uxe3', false);

  assert.equal(result.totals.joints['CZ-680BKE3'], 1);
  assert.equal(result.totals.joints['CZ-1350BKE3'], undefined);
  assert.equal(result.outdoorGroups.branchJoint.model, 'CZ-680BKE3');
  assert.equal(result.outdoorGroups.branchJoint.capacityBasisKw, 50.4);
  assert.equal(result.outdoorGroups.branchJoint.counted, true);
  // 分岐ノード3か所は室内側セットとして別に計上される。
  assert.equal(result.totals.joints['APR-RZP224B'], 3);

  const p560 = engine.calculateSystem(makeGroupTree({ outdoorKw: 56.0, loLengthM: 5 }), 'fsv_uxe3', false);
  assert.equal(p560.totals.joints['CZ-680BKE3'], 1);
  assert.equal(p560.outdoorGroups.branchJoint.model, 'CZ-680BKE3');
});

test('D7 outdoor joint is counted even when LO length is not entered', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeGroupTree({ outdoorKw: 50.4 }), 'fsv_uxe3', false);

  // LOの長さ集計は判定不可のままだが、合流部の継手そのものは計上する。
  assert.equal(result.outdoorGroups.status, 'not_determinable');
  assert.equal(result.totals.joints['CZ-680BKE3'], 1);
  assert.equal(result.outdoorGroups.branchJoint.counted, true);
});

test('D7: no KB2 model is ever produced for fsv_uxe3', () => {
  const engine = new RefrigerantSizerEngine();
  for (let kw = 0; kw <= 140; kw += 0.7) {
    assert.ok(!engine.selectUxE3IndoorJointModel(kw).includes('KB2'), `indoor ${kw}`);
    assert.ok(!engine.selectUxE3OutdoorJointModel(kw).includes('KB2'), `outdoor ${kw}`);
  }
  const trees = [
    makeTwoBranchTree(),
    make680Tree(),
    makeGroupTree({ outdoorKw: 50.4, loLengthM: 5 }),
    makeGroupTree({ outdoorKw: 56.0, loLengthM: 5 })
  ];
  for (const tree of trees) {
    const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
    for (const model of Object.keys(result.totals.joints)) {
      assert.ok(!model.includes('KB2'), `joint key ${model}`);
    }
    const walk = (node) => {
      assert.ok(!(node.jointModel || '').includes('KB2'), `node ${node.id}`);
      (node.children || []).forEach(walk);
    };
    walk(result.tree);
  }
});

test('D7 scope: other Panasonic series still use the legacy selectJointModel unchanged', () => {
  const engine = new RefrigerantSizerEngine();
  assert.equal(engine.selectJointModel(22.4), 'CZ-P160KB2');
  assert.equal(engine.selectJointModel(68.0), 'CZ-P224KB2');
  assert.equal(engine.selectJointModel(100.0), 'CZ-P680KB2');

  const ux3Tree = {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 28.0,
    children: [{
      id: 'b1', name: 'Branch 1', type: 'branch', length: 5,
      children: [indoor('in1', 11.2), indoor('in2', 11.2)]
    }]
  };
  const result = engine.calculateSystem(ux3Tree, 'fsv_ux3', false);
  assert.equal(result.tree.children[0].jointModel, 'CZ-P160KB2');
  assert.equal(result.totals.joints['CZ-P160KB2'], 1);
  assert.equal(result.totals.joints['APR-RZP224B'], undefined);
});
