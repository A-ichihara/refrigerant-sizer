const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// 優先度C・実装順序5：キットグループと室外機グループの回帰テスト。
// C5（並列電磁弁キット）：下流合計が160形キットの上限 16.0kW を超える
// キットノードは、160形キット2個の並列グループとして BOM へ2個計上する。
// 品番は変えず台数だけが変わる。配管長はグループ単位の辺で1本分のみ
// 集計し、同じ長さを2本分として数えない。
// C6（複数室外機）：18HP（PA-P504UXE3）・20HP（PA-P560UXE3）の室外機
// ノードを構成ユニットに分解し、室外接続主配管 LO とバランス管 φ9.52 を
// BOM へ計上する。LO の径は表4で組合せ合計容量を基準として選定する。
// グループから最初の分岐ノードへの辺は決定事項D1の規則により ℓA であり、
// LA ではない。管径選定・＊2／＊3 の適用は変更しない。

function makeKitTree({ outdoorKw, indoorCaps, kitLength = 10, indoorLength = 8 }) {
  return {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: outdoorKw,
    children: [{
      id: 'kit',
      name: 'Kit',
      type: 'solenoid_kit',
      length: kitLength,
      children: indoorCaps.map((capacity, index) => ({
        id: `indoor-${index}`,
        name: `Indoor ${index}`,
        type: 'indoor',
        capacity,
        length: indoorLength,
        children: []
      }))
    }]
  };
}

function makeGroupTree({ outdoorKw, loLengthM }) {
  const tree = {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: outdoorKw,
    children: [{
      id: 'b1', name: 'Branch 1', type: 'branch', length: 10, children: [{
        id: 'b2', name: 'Branch 2', type: 'branch', length: 6, children: [{
          id: 'b3', name: 'Branch 3', type: 'branch', length: 4, children: [{
            id: 'kit', name: 'Kit', type: 'solenoid_kit', length: 8, children: [{
              id: 'indoor', name: 'Indoor', type: 'indoor', capacity: 5.6, length: 3, children: []
            }]
          }]
        }]
      }]
    }]
  };
  if (loLengthM !== undefined) tree.loLengthM = loLengthM;
  return tree;
}

test('UXE3 224-model indoor unit gets 2 parallel solenoid kits without doubling pipe lengths', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeKitTree({ outdoorKw: 28.0, indoorCaps: [22.4] });
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const kitNode = result.tree.children[0];

  assert.equal(result.totals.joints['CZ-P160HRV3'], 2);
  assert.equal(kitNode.parallelCount, 2);
  assert.equal(kitNode.kitGroup.parallelCount, 2);
  assert.equal(kitNode.kitGroup.modelNumber, 'CZ-P160HRV3');
  assert.equal(kitNode.kitGroup.internalBranch.branches, 2);
  assert.equal(kitNode.kitGroup.internalBranch.lengthApportionment, 'not_determinable');
  // 配管長はグループ単位で1本分のみ。2本分にしていたら totalLength は 36m になる。
  assert.equal(result.totals.totalLength, 18);
  assert.equal(result.totals.liquidPipes[9.52], 18);
  assert.equal(result.totals.lowGasPipes[22.2], 10);
  assert.equal(result.totals.gasPipes[22.2], 8);
  assert.equal(result.kitGroups.groups.length, 1);
  assert.equal(result.kitGroups.groups[0].parallelCount, 2);
  assert.equal(result.kitGroups.groups[0].isParallel, true);
  assert.equal(result.kitGroups.groups[0].modelNumber, 'CZ-P160HRV3');
  assert.equal(result.kitGroups.groups[0].downstreamKw, 22.4);
  assert.equal(result.kitGroups.groups[0].internalBranch.branches, 2);
  assert.deepEqual(result.kitGroups.summary, { kitNodes: 1, parallelGroups: 1, totalKits: 2 });
  assert.ok(result.warnings.some((w) => w.type === 'info' && w.message.includes('並列電磁弁キット')));
});

test('UXE3 280-model indoor unit gets 2 parallel solenoid kits', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeKitTree({ outdoorKw: 28.0, indoorCaps: [28.0] });
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);

  assert.equal(result.totals.joints['CZ-P160HRV3'], 2);
  assert.equal(result.tree.children[0].parallelCount, 2);
  assert.equal(result.totals.totalLength, 18);
  assert.equal(result.kitGroups.summary.totalKits, 2);
});

test('UXE3 kit with downstream total above 16.0kW is a parallel group; exactly 16.0kW stays single', () => {
  const engine = new RefrigerantSizerEngine();
  const over = engine.calculateSystem(makeKitTree({ outdoorKw: 28.0, indoorCaps: [9.0, 9.0] }), 'fsv_uxe3', false);
  assert.equal(over.totals.joints['CZ-P160HRG3'], 2);
  assert.equal(over.tree.children[0].parallelCount, 2);
  assert.equal(over.kitGroups.groups[0].downstreamKw, 18.0);

  const atLimit = engine.calculateSystem(makeKitTree({ outdoorKw: 28.0, indoorCaps: [8.0, 8.0] }), 'fsv_uxe3', false);
  assert.equal(atLimit.totals.joints['CZ-P160HRG3'], 1);
  assert.equal(atLimit.tree.children[0].parallelCount, 1);
  assert.equal(atLimit.kitGroups.groups[0].isParallel, false);
  assert.equal(atLimit.kitGroups.summary.parallelGroups, 0);

  const single160 = engine.calculateSystem(makeKitTree({ outdoorKw: 28.0, indoorCaps: [16.0] }), 'fsv_uxe3', false);
  assert.equal(single160.totals.joints['CZ-P160HRV3'], 1);
  assert.equal(single160.tree.children[0].parallelCount, 1);
});

test('UXE3 kit downstream above the parallel-pair range is flagged but still counts 2 kits', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeKitTree({ outdoorKw: 45.0, indoorCaps: [28.0, 14.0] });
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);

  assert.equal(result.totals.joints['CZ-P160HRG3'], 2);
  assert.equal(result.kitGroups.groups[0].beyondParallelPair, true);
  assert.equal(result.kitGroups.groups[0].downstreamKw, 42.0);
  assert.ok(result.warnings.some((w) => w.type === 'danger' && w.message.includes('32.0kW')));
});

test('UXE3 PA-P504UXE3 combination gets an outdoor group with LO edges and a balance pipe in the BOM', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeGroupTree({ outdoorKw: 50.4, loLengthM: 5 }), 'fsv_uxe3', false);
  const groups = result.outdoorGroups;

  assert.equal(groups.status, 'applied');
  assert.equal(groups.groupModel, 'PA-P504UXE3');
  assert.equal(groups.groupCapacityKw, 50.4);
  assert.deepEqual(groups.members, [
    { model: 'CU-P280UXE3', capacity: 28.0, position: 'near' },
    { model: 'CU-P224UXE3', capacity: 22.4, position: 'tip' }
  ]);
  assert.equal(groups.loEdges.length, 1);
  assert.deepEqual(groups.loEdges[0].diameters, { liquid: 15.88, dischargeGas: 22.2, suctionGas: 28.58 });
  assert.equal(groups.loEdges[0].lengthM, 5);
  assert.equal(groups.loEdges[0].lengthState, 'valid');
  assert.deepEqual(groups.balancePipe, { diameter: 9.52, lengthM: 5, lengthState: 'valid' });
  assert.equal(groups.firstBranchEdge, 'lA');
  // LO の3管（5m）とバランス管（5m）が BOM へ加算される。主管の辺長は LA＋LB＝10m のまま。
  assert.equal(result.totals.liquidPipes[15.88], 33);
  assert.equal(result.totals.highGasPipes[22.2], 33);
  assert.equal(result.totals.lowGasPipes[28.58], 33);
  assert.equal(result.totals.balancePipes[9.52], 5);
  // totalLength はツリーの辺のみ。LO はグループ内部の辺のため含まない。
  assert.equal(result.totals.totalLength, 31);
  // 経路診断は変わらない。LM は LA（6m）＋LB（4m）＝10m のまま。
  assert.equal(result.pathAudit.lmCandidate.lengthActualM, 10);
  assert.ok(result.warnings.some((w) => w.type === 'info' && w.message.includes('組合せ室外機')));
});

test('UXE3 PA-P560UXE3 combination decomposes into two CU-P280UXE3 units', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeGroupTree({ outdoorKw: 56.0, loLengthM: 4 }), 'fsv_uxe3', false);

  assert.equal(result.outdoorGroups.status, 'applied');
  assert.equal(result.outdoorGroups.groupModel, 'PA-P560UXE3');
  assert.deepEqual(result.outdoorGroups.members, [
    { model: 'CU-P280UXE3', capacity: 28.0, position: 'near' },
    { model: 'CU-P280UXE3', capacity: 28.0, position: 'tip' }
  ]);
  assert.deepEqual(result.outdoorGroups.loEdges[0].diameters, { liquid: 15.88, dischargeGas: 22.2, suctionGas: 28.58 });
  assert.equal(result.totals.balancePipes[9.52], 4);
  assert.equal(result.totals.liquidPipes[15.88], 32);
});

test('UXE3 single outdoor and single kit trees are unchanged (no groups, counts as before)', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeKitTree({ outdoorKw: 28.0, indoorCaps: [5.6] });
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);

  assert.equal(result.outdoorGroups.status, 'not_applicable');
  assert.equal(result.totals.joints['CZ-P56HRV3'], 1);
  assert.equal(result.tree.children[0].parallelCount, 1);
  assert.equal(result.tree.children[0].kitGroup, undefined);
  assert.deepEqual(result.kitGroups.summary, { kitNodes: 1, parallelGroups: 0, totalKits: 1 });
  assert.deepEqual(result.totals.balancePipes, {});
  assert.ok(result.warnings.every((w) => !w.message.includes('並列電磁弁キット')));
});

test('UXE3 outdoor group without an LO length is not_determinable and adds nothing to the BOM', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeGroupTree({ outdoorKw: 50.4 }), 'fsv_uxe3', false);

  assert.equal(result.outdoorGroups.status, 'not_determinable');
  assert.equal(result.outdoorGroups.groupModel, 'PA-P504UXE3');
  assert.equal(result.outdoorGroups.balancePipe.lengthM, null);
  assert.deepEqual(result.totals.balancePipes, {});
  assert.equal(result.totals.liquidPipes[15.88], 28);
  assert.ok(result.warnings.every((w) => !w.message.includes('バランス管')));
  assert.ok(result.warnings.every((w) => !w.message.includes('組合せ室外機')));
});

test('UXE3 outdoor group with an invalid LO length warns and adds nothing to the BOM', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeGroupTree({ outdoorKw: 50.4, loLengthM: 'x' }), 'fsv_uxe3', false);

  assert.equal(result.outdoorGroups.status, 'not_determinable');
  assert.deepEqual(result.totals.balancePipes, {});
  assert.ok(result.warnings.some((w) => w.type === 'danger' && w.message.includes('LO')));
});

test('UXE3 group audits return null for other series', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeKitTree({ outdoorKw: 28.0, indoorCaps: [5.6] });
  const result = engine.calculateSystem(tree, 'fsv_ux3', false);

  assert.equal(result.kitGroups, null);
  assert.equal(result.outdoorGroups, null);
  assert.deepEqual(result.totals.balancePipes, {});
});
