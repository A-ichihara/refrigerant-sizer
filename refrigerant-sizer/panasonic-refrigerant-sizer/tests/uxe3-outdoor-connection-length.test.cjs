const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// UXE3 室外機接続配管 ℓA の長さ判定（表1：各室外ユニットから室外第一分岐まで ≦10m）。
// 決定事項D1（2026-10-26）の規則により、L1候補経路上で最初に現れる分岐ノードを
// 室外第一分岐とし、室外機からその分岐までの配管長を ℓA とする。通常は室外機の
// 直下の辺1本だが、途中に分岐以外のノードがある場合は室外機から室外第一分岐
// までの全辺の合計である（表1の距離の定義が「室外機から室外第一分岐まで」
// であるため）。10m を超える場合は表1の上限違反として危険警告を出す。
// 管径・BOM・totals は変更しない。

function makeTree({ laLength = 6, outdoorKw = 28, loLengthM = undefined }) {
  const tree = {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: outdoorKw,
    children: [{
      id: 'b1',
      name: 'Branch 1',
      type: 'branch',
      length: laLength,
      children: [{
        id: 'b2',
        name: 'Branch 2',
        type: 'branch',
        length: 6,
        children: [{
          id: 'b3',
          name: 'Branch 3',
          type: 'branch',
          length: 4,
          children: [{
            id: 'kit',
            name: 'Kit',
            type: 'solenoid_kit',
            length: 8,
            children: [{
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

function laWarnings(result) {
  return result.warnings.filter((w) => w.message.includes('ℓA'));
}

test('UXE3 outdoor connection lA of exactly 10m is within the Table 1 limit', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeTree({ laLength: 10 }), 'fsv_uxe3', false);

  assert.equal(result.outdoorConnection.status, 'ok');
  assert.equal(result.outdoorConnection.lengthActualM, 10);
  assert.equal(result.outdoorConnection.thresholdM, 10);
  assert.equal(result.outdoorConnection.outdoorFirstBranchId, 'b1');
  assert.deepEqual(result.outdoorConnection.edgeChildIds, ['b1']);
  assert.deepEqual(laWarnings(result), []);
});

test('UXE3 outdoor connection lA over 10m adds a danger warning and leaves totals unchanged', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeTree({ laLength: 10.5 }), 'fsv_uxe3', false);

  assert.equal(result.outdoorConnection.status, 'exceeded');
  assert.equal(result.outdoorConnection.lengthActualM, 10.5);
  assert.equal(result.outdoorConnection.thresholdM, 10);
  assert.equal(result.outdoorConnection.outdoorFirstBranchId, 'b1');
  assert.equal(laWarnings(result).length, 1);
  assert.equal(laWarnings(result)[0].type, 'danger');
  assert.ok(laWarnings(result)[0].message.includes('10.5'));
  assert.ok(laWarnings(result)[0].message.includes('10m'));
  // 管径・BOM・totals は判定で変わらない（全辺長の合計 10.5+6+4+8+3=31.5）。
  assert.equal(result.totals.totalLength, 31.5);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((sum, len) => sum + len, 0), 31.5);
  // 「UXE3基準配管径未検証」の危険警告はそのまま残る。
  assert.ok(result.warnings.some((w) => w.message.includes('UXE3基準配管径未検証')));
});

test('UXE3 outdoor connection lA of zero length is within the limit', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeTree({ laLength: 0 }), 'fsv_uxe3', false);

  assert.equal(result.outdoorConnection.status, 'ok');
  assert.equal(result.outdoorConnection.lengthActualM, 0);
  assert.deepEqual(laWarnings(result), []);
});

test('UXE3 outdoor connection lA with a missing length is not determinable without a false warning', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeTree({ laLength: 6 });
  delete tree.children[0].length;
  let result;
  assert.doesNotThrow(() => { result = engine.calculateSystem(tree, 'fsv_uxe3', false); });

  assert.equal(result.outdoorConnection.status, 'not_determinable');
  assert.equal(result.outdoorConnection.lengthActualM, null);
  assert.deepEqual(laWarnings(result), []);
});

test('UXE3 outdoor connection lA measures the whole path to the first branch, not just its incoming edge', () => {
  const engine = new RefrigerantSizerEngine();
  // 室外機の直下が電磁弁キット（8m）で、その先の分岐（4m）が室外第一分岐。
  // ℓA は 8+4=12m であり、入ってくる辺だけ（4m）ではない。
  const tree = {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 28,
    children: [{
      id: 'kit', name: 'Kit', type: 'solenoid_kit', length: 8, children: [{
        id: 'b1', name: 'Branch 1', type: 'branch', length: 4, children: [{
          id: 'b2', name: 'Branch 2', type: 'branch', length: 5, children: [{
            id: 'b3', name: 'Branch 3', type: 'branch', length: 6, children: [{
              id: 'indoor', name: 'Indoor', type: 'indoor', capacity: 5.6, length: 3, children: []
            }]
          }]
        }]
      }]
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);

  assert.equal(result.pathAudit.l1Candidate.status, 'candidate');
  assert.equal(result.outdoorConnection.status, 'exceeded');
  assert.equal(result.outdoorConnection.lengthActualM, 12);
  assert.equal(result.outdoorConnection.outdoorFirstBranchId, 'b1');
  assert.deepEqual(result.outdoorConnection.edgeChildIds, ['kit', 'b1']);
  assert.equal(laWarnings(result).length, 1);
  assert.ok(laWarnings(result)[0].message.includes('12'));
});

test('UXE3 outdoor connection lA is not determinable when the L1 path has no branch', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 28,
    children: [{
      id: 'kit', name: 'Kit', type: 'solenoid_kit', length: 5, children: [{
        id: 'indoor', name: 'Indoor', type: 'indoor', capacity: 5.6, length: 3, children: []
      }]
    }]
  };
  let result;
  assert.doesNotThrow(() => { result = engine.calculateSystem(tree, 'fsv_uxe3', false); });

  assert.equal(result.pathAudit.l1Candidate.status, 'candidate');
  assert.equal(result.outdoorConnection.status, 'not_determinable');
  assert.deepEqual(laWarnings(result), []);
});

test('UXE3 outdoor connection lA is not determinable for an invalid root', () => {
  const engine = new RefrigerantSizerEngine();
  for (const badRoot of [null, undefined, {}, { type: 'branch', children: [] }]) {
    const pathAudit = engine.auditUxE3PipePaths(badRoot);
    assert.equal(pathAudit.outdoorConnectionCandidate.status, 'not_determinable');
    assert.equal(pathAudit.outdoorConnectionCandidate.lengthActualM, null);
  }
});

test('UXE3 outdoor connection lA check applies to a multi-outdoor group at group level', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(
    makeTree({ laLength: 12, outdoorKw: 50.4, loLengthM: 5 }), 'fsv_uxe3', false);

  assert.equal(result.outdoorGroups.status, 'applied');
  assert.equal(result.outdoorConnection.status, 'exceeded');
  assert.equal(result.outdoorConnection.lengthActualM, 12);
  assert.equal(laWarnings(result).length, 1);
  // 構成ユニットごとの長さ（ℓB＋LP、ℓC＋LO＋LP、ℓD＋LO＋LP）は判定対象外
  // であることを記録する（D6未決・入力なし）。
  assert.ok(result.outdoorConnection.notes.some((note) => note.includes('D6')));
  assert.ok(result.outdoorConnection.notes.some((note) => note.includes('ℓB')));
});

test('UXE3 outdoor connection lA check is null for other series', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeTree({ laLength: 12 }), 'fsv_ux3', false);

  assert.equal(result.outdoorConnection, null);
  assert.equal(result.pathAudit, null);
  assert.deepEqual(laWarnings(result), []);
});
