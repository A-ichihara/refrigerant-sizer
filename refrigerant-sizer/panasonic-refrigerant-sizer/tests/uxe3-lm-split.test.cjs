const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// 優先度C・実装順序4：LM 50m 分割（表1 脚注＊3）と BOM 集計。
// 決定事項D4（2026-10-27）：50m は LM の室外機側の端（室外第一分岐）から測る。
// LM 実長が 50m を超える場合、最初の 50m の吸込管・吐出管を表7のラダーで
// 1ランク増径し、残りは表4の基準径のままとする。液管は＊3 では増径しない。
// 50m 境界は LM 経路上の位置であり、辺の途中またはノード上に落ちる。
// 辺単位に丸めない。＊2 との排他は実装順序6の対応であり、本工程では＊3 を
// LM＞50m の場合に常に適用する。GAS_SIZES / LIQUID_SIZES は変更しない。
// 分割は lmSplit として計算結果に載せ、BOM 集計へ反映する。

const REDUCER_KEY = 'レデューサー（異径継手・現地調達）';

// outdoorKw=45（16HP）：基準3管は液 12.7／吐出 19.05／吸込 28.58。
// 増径後（表7）：吐出 19.05 → 22.22、吸込 28.58 → 31.8。液は増径しない。
// 上流3管の辺：室外機→b1（ℓA）、b1→b2（LA）、b2→b3（LB）、b3→キット。
// 下流2管の辺：キット→室内機（5.6kW → 液 6.35／ガス 12.7）。
function makeLmTree({ outdoorKw = 45, lALen = 5, laLen = 30, lbLen = 30, kitLen = 8, indoorLen = 3 } = {}) {
  return {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: outdoorKw,
    length: 0,
    children: [{
      id: 'lm-b1',
      name: 'Outdoor first branch',
      type: 'branch',
      length: lALen,
      children: [{
        id: 'lm-b2',
        name: 'First branch',
        type: 'branch',
        length: laLen,
        children: [{
          id: 'lm-b3',
          name: 'Next branch',
          type: 'branch',
          length: lbLen,
          children: [{
            id: 'lm-kit',
            name: 'Kit',
            type: 'solenoid_kit',
            length: kitLen,
            children: [{ id: 'lm-indoor', name: 'Indoor', type: 'indoor', capacity: 5.6, length: indoorLen, children: [] }]
          }]
        }]
      }]
    }]
  };
}

test('UXE3 Table 7 ladder maps one rank up including the D4 notation fixes', () => {
  const engine = new RefrigerantSizerEngine();
  assert.deepEqual(engine.TABLE7_LADDER,
    [6.35, 9.52, 12.7, 15.88, 19.05, 22.22, 25.4, 28.58, 31.8, 38.1, 41.28]);
  assert.equal(engine.sizeUpOneRankTable7(38.1), 41.28);
  assert.equal(engine.sizeUpOneRankTable7(31.75), 38.1);
  // 22.2 は 22.22 の表記としてラダー上の同じ位置を読むため、1ランク上は 25.4。
  assert.equal(engine.sizeUpOneRankTable7(22.2), 25.4);
  assert.equal(engine.sizeUpOneRankTable7(22.22), 25.4);
  assert.equal(engine.sizeUpOneRankTable7(19.05), 22.22);
  assert.equal(engine.sizeUpOneRankTable7(41.28), 41.28);
  assert.equal(engine.sizeUpOneRankTable7('x'), 'x');
  assert.equal(engine.sizeUpOneRankTable7(undefined), undefined);
  // GAS_SIZES / LIQUID_SIZES は変更しない（22.2・38.1 上限のまま）。
  assert.deepEqual(engine.GAS_SIZES, [9.52, 12.7, 15.88, 19.05, 22.2, 25.4, 28.58, 31.8, 38.1]);
  assert.deepEqual(engine.LIQUID_SIZES, [6.35, 9.52, 12.7, 15.88, 19.05]);
});

test('UXE3 LM exactly 50m does not split', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLmTree({ laLen: 25, lbLen: 25 }), 'fsv_uxe3', false);
  const lmSplit = result.lmSplit;

  assert.ok(lmSplit);
  assert.equal(lmSplit.status, 'not_applied');
  assert.equal(lmSplit.lmLengthActualM, 50);
  assert.equal(lmSplit.thresholdM, 50);
  assert.equal(lmSplit.reducerCount, 0);
  assert.deepEqual(lmSplit.edges, []);
  assert.deepEqual(lmSplit.boundaries, []);

  // BOM は分割なしの従来どおり（上流3管は全長を基準径で集計）。
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 25 + 25 + 8);
  assert.equal(result.totals.lowGasPipes[31.8], undefined);
  assert.equal(result.totals.highGasPipes[19.05], 5 + 25 + 25 + 8);
  assert.equal(result.totals.highGasPipes[22.22], undefined);
  assert.equal(result.totals.joints[REDUCER_KEY], undefined);
  assert.equal(result.totals.totalLength, 5 + 25 + 25 + 8 + 3);
});

test('UXE3 LM 60m splits the first 50m upsized and the remainder at base diameters', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLmTree({ laLen: 30, lbLen: 30 }), 'fsv_uxe3', false);
  const lmSplit = result.lmSplit;

  assert.ok(lmSplit);
  assert.equal(lmSplit.status, 'applied');
  assert.equal(lmSplit.applied, true);
  assert.equal(lmSplit.lmLengthActualM, 60);
  assert.deepEqual(lmSplit.baseDiameters, { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 });
  assert.deepEqual(lmSplit.upsizedDiameters, { dischargeGas: 22.22, suctionGas: 31.8 });
  assert.equal(lmSplit.reducerCount, 1);
  assert.deepEqual(lmSplit.boundaries, [{ positionM: 50, nodeId: null, edgeChildId: 'lm-b3', onNode: false }]);
  assert.deepEqual(lmSplit.totalsAdjust, {
    upsizedLengthM: 50,
    standardLengthM: 10,
    suction: { from: 28.58, to: 31.8, lengthM: 50 },
    discharge: { from: 19.05, to: 22.22, lengthM: 50 }
  });

  // 分割レコード：LA は全長増径、LB は 50m 境界で分かれる。
  assert.deepEqual(lmSplit.edges, [
    {
      segment: 'LA',
      edgeChildId: 'lm-b2',
      lengthM: 30,
      lmStartM: 0,
      segments: [
        { fromM: 0, toM: 30, lengthM: 30, kind: 'upsized', diameters: { liquid: 12.7, dischargeGas: 22.22, suctionGas: 31.8 } }
      ]
    },
    {
      segment: 'LB',
      edgeChildId: 'lm-b3',
      lengthM: 30,
      lmStartM: 30,
      segments: [
        { fromM: 30, toM: 50, lengthM: 20, kind: 'upsized', diameters: { liquid: 12.7, dischargeGas: 22.22, suctionGas: 31.8 } },
        { fromM: 50, toM: 60, lengthM: 10, kind: 'standard', diameters: { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 } }
      ]
    }
  ]);
  // 不変条件：区間長の合計＝元の辺長。
  lmSplit.edges.forEach((edge) => {
    assert.equal(edge.segments.reduce((sum, seg) => sum + seg.lengthM, 0), edge.lengthM);
  });

  // BOM 集計：増径区間 50m が増径後の径へ、残り 10m と LM 外の辺が基準径のまま。
  assert.equal(result.totals.lowGasPipes[31.8], 50);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 8 + 10);
  assert.equal(result.totals.highGasPipes[22.22], 50);
  assert.equal(result.totals.highGasPipes[19.05], 5 + 8 + 10);
  assert.equal(result.totals.joints[REDUCER_KEY], 1);
  assert.equal(result.totals.totalLength, 5 + 30 + 30 + 8 + 3);
});

test('UXE3 *3 never upsizes the liquid pipe', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLmTree({ laLen: 30, lbLen: 30 }), 'fsv_uxe3', false);

  assert.equal(result.lmSplit.status, 'applied');
  // 液管は LM 全長（5＋30＋30＋8）を基準径 12.7 のまま集計する。
  assert.equal(result.totals.liquidPipes[12.7], 5 + 30 + 30 + 8);
  assert.equal(result.totals.liquidPipes[15.88], undefined);
  assert.equal(result.totals.liquidPipes[6.35], 3);
});

test('UXE3 50m boundary falls mid-edge and segment lengths sum to the edge length', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLmTree({ laLen: 60, lbLen: 10 }), 'fsv_uxe3', false);
  const lmSplit = result.lmSplit;

  assert.equal(lmSplit.status, 'applied');
  assert.equal(lmSplit.lmLengthActualM, 70);
  assert.deepEqual(lmSplit.boundaries, [{ positionM: 50, nodeId: null, edgeChildId: 'lm-b2', onNode: false }]);
  assert.deepEqual(lmSplit.edges, [
    {
      segment: 'LA',
      edgeChildId: 'lm-b2',
      lengthM: 60,
      lmStartM: 0,
      segments: [
        { fromM: 0, toM: 50, lengthM: 50, kind: 'upsized', diameters: { liquid: 12.7, dischargeGas: 22.22, suctionGas: 31.8 } },
        { fromM: 50, toM: 60, lengthM: 10, kind: 'standard', diameters: { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 } }
      ]
    },
    {
      segment: 'LB',
      edgeChildId: 'lm-b3',
      lengthM: 10,
      lmStartM: 60,
      segments: [
        { fromM: 60, toM: 70, lengthM: 10, kind: 'standard', diameters: { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 } }
      ]
    }
  ]);
  lmSplit.edges.forEach((edge) => {
    assert.equal(edge.segments.reduce((sum, seg) => sum + seg.lengthM, 0), edge.lengthM);
  });
  assert.equal(result.totals.lowGasPipes[31.8], 50);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 10 + 10 + 8);
  assert.equal(result.totals.joints[REDUCER_KEY], 1);
});

test('UXE3 50m boundary falls exactly on the first branch node', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLmTree({ laLen: 50, lbLen: 20 }), 'fsv_uxe3', false);
  const lmSplit = result.lmSplit;

  assert.equal(lmSplit.status, 'applied');
  assert.equal(lmSplit.lmLengthActualM, 70);
  assert.deepEqual(lmSplit.boundaries, [{ positionM: 50, nodeId: 'lm-b2', edgeChildId: null, onNode: true }]);
  assert.deepEqual(lmSplit.edges, [
    {
      segment: 'LA',
      edgeChildId: 'lm-b2',
      lengthM: 50,
      lmStartM: 0,
      segments: [
        { fromM: 0, toM: 50, lengthM: 50, kind: 'upsized', diameters: { liquid: 12.7, dischargeGas: 22.22, suctionGas: 31.8 } }
      ]
    },
    {
      segment: 'LB',
      edgeChildId: 'lm-b3',
      lengthM: 20,
      lmStartM: 50,
      segments: [
        { fromM: 50, toM: 70, lengthM: 20, kind: 'standard', diameters: { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 } }
      ]
    }
  ]);
  assert.equal(result.totals.lowGasPipes[31.8], 50);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 20 + 8);
  assert.equal(result.totals.joints[REDUCER_KEY], 1);
});

test('UXE3 reducer is counted once per boundary', () => {
  const engine = new RefrigerantSizerEngine();
  const applied = engine.calculateSystem(makeLmTree({ laLen: 30, lbLen: 30 }), 'fsv_uxe3', false);
  assert.equal(applied.lmSplit.boundaries.length, 1);
  assert.equal(applied.lmSplit.reducerCount, 1);
  assert.equal(applied.totals.joints[REDUCER_KEY], 1);

  const notApplied = engine.calculateSystem(makeLmTree({ laLen: 25, lbLen: 25 }), 'fsv_uxe3', false);
  assert.equal(notApplied.lmSplit.boundaries.length, 0);
  assert.equal(notApplied.lmSplit.reducerCount, 0);
  assert.equal(notApplied.totals.joints[REDUCER_KEY], undefined);
});

test('UXE3 base suction 38.1 sizes up to 41.28 on the Table 7 ladder', () => {
  const engine = new RefrigerantSizerEngine();
  // 室外機容量 61.5kW は現行マスター外のため対応容量外の警告が出るが、
  // 選定は else 分岐の最大径（液 19.05／吐出 28.58／吸込 38.1）になる。
  const result = engine.calculateSystem(makeLmTree({ outdoorKw: 61.5, laLen: 30, lbLen: 30 }), 'fsv_uxe3', false);
  const lmSplit = result.lmSplit;

  assert.equal(lmSplit.status, 'applied');
  assert.deepEqual(lmSplit.baseDiameters, { liquid: 19.05, dischargeGas: 28.58, suctionGas: 38.1 });
  assert.deepEqual(lmSplit.upsizedDiameters, { dischargeGas: 31.8, suctionGas: 41.28 });
  assert.equal(result.totals.lowGasPipes[41.28], 50);
  assert.equal(result.totals.lowGasPipes[38.1], 5 + 8 + 10);
  assert.equal(result.totals.highGasPipes[31.8], 50);
  assert.equal(result.totals.highGasPipes[28.58], 5 + 8 + 10);
  assert.equal(result.totals.joints[REDUCER_KEY], 1);
});

test('UXE3 LM split is not determinable when the L1 path has fewer than three branches', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: 45,
    length: 0,
    children: [{
      id: 'only-b1',
      name: 'Only branch',
      type: 'branch',
      length: 60,
      children: [{
        id: 'only-kit',
        name: 'Kit',
        type: 'solenoid_kit',
        length: 8,
        children: [{ id: 'only-indoor', name: 'Indoor', type: 'indoor', capacity: 5.6, length: 3, children: [] }]
      }]
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);

  assert.equal(result.pathAudit.lmCandidate.status, 'not_determinable');
  assert.equal(result.lmSplit.status, 'not_determinable');
  assert.equal(result.totals.joints[REDUCER_KEY], undefined);
  assert.equal(result.totals.lowGasPipes[28.58], 60 + 8);
});

test('UXE3 split application refuses when the base BOM buckets lack the upsized length', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLmTree({ laLen: 30, lbLen: 30 }), 'fsv_uxe3', false);
  const lmSplit = result.lmSplit;
  assert.equal(lmSplit.status, 'applied');

  // 基準径の集計に増径区間 50m が含まれていない totals では適用しない。
  const thinTotals = {
    liquidPipes: {},
    gasPipes: {},
    highGasPipes: { 19.05: 10 },
    lowGasPipes: { 28.58: 10 },
    joints: {},
    totalLength: 0
  };
  const before = JSON.parse(JSON.stringify(thinTotals));
  assert.equal(engine.applyUxE3LmSplitToTotals(thinTotals, lmSplit), false);
  assert.deepEqual(thinTotals, before);
  assert.equal(lmSplit.status, 'not_applied');
  assert.equal(lmSplit.applied, false);
});

test('UXE3 lmSplit is null for non-UXE3 series', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLmTree({ laLen: 30, lbLen: 30 }), 'fsv_ux3', false);
  assert.equal(result.lmSplit, null);
});
