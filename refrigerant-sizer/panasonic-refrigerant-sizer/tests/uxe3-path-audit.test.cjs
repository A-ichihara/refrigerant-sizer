const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// 優先度C・実装順序1：経路の非破壊診断 auditUxE3PipePaths の回帰テスト。
// 診断は読み取り専用であり、管径選定・BOM・length・警告パネルを変更しない。
// L1候補は実長による最遠経路、LM候補・ΔL候補は決定事項D1（2026-10-26）の
// 規則に基づく区間である。相当長は入力がないため判定不可とし、実長で代用しない。

function makeMainTree() {
  return {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: 28,
    length: 0,
    children: [{
      id: 'up-b1',
      name: 'Upstream branch 1',
      type: 'branch',
      length: 10,
      children: [
        {
          id: 'up-b2',
          name: 'Upstream branch 2',
          type: 'branch',
          length: 6,
          children: [
            {
              id: 'up-b3',
              name: 'Upstream branch 3',
              type: 'branch',
              length: 4,
              children: [{
                id: 'kit-a',
                name: 'Kit A',
                type: 'solenoid_kit',
                length: 8,
                children: [
                  { id: 'indoor-a', name: 'Indoor A', type: 'indoor', capacity: 5.6, length: 3, children: [] },
                  { id: 'indoor-b', name: 'Indoor B', type: 'indoor', capacity: 5.6, length: 4, children: [] }
                ]
              }]
            },
            {
              id: 'kit-b',
              name: 'Kit B',
              type: 'solenoid_kit',
              length: 5,
              children: [
                { id: 'indoor-c', name: 'Indoor C', type: 'indoor', capacity: 5.6, length: 7, children: [] }
              ]
            }
          ]
        },
        {
          id: 'kit-c',
          name: 'Kit C',
          type: 'solenoid_kit',
          length: 12,
          children: [
            { id: 'indoor-d', name: 'Indoor D', type: 'indoor', capacity: 5.6, length: 9, children: [] }
          ]
        }
      ]
    }]
  };
  // 経路長（実長）：A=10+6+4+8+3=31、B=10+6+4+8+4=32、C=10+6+5+7=28、D=10+12+9=31。
  // L1候補はB（32m）。LM候補は LA=6（up-b1→up-b2）＋LB=4（up-b2→up-b3）=10m。
  // ΔL候補は第一分岐（up-b2）から：A=4+8+3=15、B=4+8+4=16、C=5+7=12。最大16・最小12・差4。
}

test('UXE3 path audit enumerates leaf paths and picks the farthest as the L1 candidate', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeMainTree(), 'fsv_uxe3', false);
  const pathAudit = result.pathAudit;

  assert.ok(pathAudit);
  assert.equal(pathAudit.seriesId, 'fsv_uxe3');
  assert.deepEqual(pathAudit.leafPaths.map((path) => path.lengthActualM), [31, 32, 28, 31]);
  assert.deepEqual(pathAudit.leafPaths.map((path) => path.leafId),
    ['indoor-a', 'indoor-b', 'indoor-c', 'indoor-d']);
  assert.equal(pathAudit.l1Candidate.status, 'candidate');
  assert.equal(pathAudit.l1Candidate.leafId, 'indoor-b');
  assert.equal(pathAudit.l1Candidate.lengthActualM, 32);
  // 相当長は入力がないため判定不可。実長で代用してはならない。
  assert.equal(pathAudit.l1Candidate.lengthEquivalentM, null);
  assert.equal(pathAudit.l1Candidate.equivalentStatus, 'not_determinable');
  assert.deepEqual(pathAudit.summary, {
    totalEdges: 10,
    totalLengthM: 68,
    longestEdgeM: 12,
    invalidLengthEdges: 0,
    leafPaths: 4,
    indoorLeafPaths: 4,
    truncated: false
  });
});

test('UXE3 LM candidate under decided rule D1 is LA+LB from the L1 path', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeMainTree(), 'fsv_uxe3', false);
  const lm = result.pathAudit.lmCandidate;

  assert.equal(lm.status, 'candidate');
  assert.equal(lm.lengthActualM, 10);
  assert.equal(lm.laEdgeChildId, 'up-b2');
  assert.equal(lm.lbEdgeChildId, 'up-b3');
  assert.equal(lm.outdoorFirstBranchId, 'up-b1');
  assert.equal(lm.firstBranchId, 'up-b2');
  assert.deepEqual(lm.nodeLabels, ['up-b1', 'up-b2', 'up-b3']);
  assert.ok(lm.rule.includes('決定事項D1'));
  assert.ok(lm.rule.includes('室外第一分岐'));
});

test('UXE3 delta-L candidate is measured from the first branch under decided rule D1', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeMainTree(), 'fsv_uxe3', false);
  const delta = result.pathAudit.deltaLCandidate;

  assert.equal(delta.status, 'candidate');
  assert.equal(delta.fromNodeId, 'up-b2');
  assert.equal(delta.fromNodeLabel, 'up-b2');
  assert.equal(delta.terminalCount, 3);
  assert.equal(delta.maxLengthM, 16);
  assert.equal(delta.minLengthM, 12);
  assert.equal(delta.deltaM, 4);
});

test('UXE3 path audit does not change sizing, BOM or the input tree', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeMainTree();
  const beforeAudit = JSON.stringify(tree);
  const direct = engine.auditUxE3PipePaths(tree);
  assert.equal(JSON.stringify(tree), beforeAudit, 'audit must not mutate the tree');
  assert.equal(direct.l1Candidate.lengthActualM, 32);

  const result = engine.calculateSystem(makeMainTree(), 'fsv_uxe3', false);
  // 診断の接続前後で管径集計が変わらないこと。
  assert.equal(result.totals.totalLength, 68);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((sum, len) => sum + len, 0), 68);
  assert.equal(Object.values(result.totals.highGasPipes).reduce((sum, len) => sum + len, 0), 45);
  assert.equal(Object.values(result.totals.lowGasPipes).reduce((sum, len) => sum + len, 0), 45);
  assert.equal(Object.values(result.totals.gasPipes).reduce((sum, len) => sum + len, 0), 23);
  // 診断の注記は警告パネルへ追加しない（UIへの表示は別途の対応）。
  assert.ok(result.pathAudit.notes.length > 0);
  assert.ok(result.warnings.every((w) => !w.message.includes('経路診断')));
});

test('UXE3 LM and delta-L are not determinable when the L1 path has fewer than three branches', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 28, length: 0,
    children: [{
      id: 'branch', type: 'branch', length: 7,
      children: [{
        id: 'kit', type: 'solenoid_kit', length: 11,
        children: [{ id: 'indoor', type: 'indoor', capacity: 5.6, length: 3, children: [] }]
      }]
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);

  assert.equal(result.pathAudit.l1Candidate.status, 'candidate');
  assert.equal(result.pathAudit.l1Candidate.lengthActualM, 21);
  assert.equal(result.pathAudit.lmCandidate.status, 'not_determinable');
  assert.ok(result.pathAudit.lmCandidate.reason.includes('分岐ノードが3つ'));
  assert.ok(result.pathAudit.lmCandidate.rule.includes('決定事項D1'));
  assert.equal(result.pathAudit.deltaLCandidate.status, 'not_determinable');
});

test('UXE3 path audit reports invalid pipe lengths instead of guessing them', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeMainTree();
  // indoor-d への辺の長さを非数値にする（監査メソッドの直接呼び出しで検証する。
  // calculateSystem 経由では既存の processNodeSizing が不正な長さをそのまま
  // 合算するため、このテストでは監査の扱いだけを固定する）。
  tree.children[0].children[1].children[0].length = 'x';
  const pathAudit = engine.auditUxE3PipePaths(tree);

  const broken = pathAudit.leafPaths.find((path) => path.leafId === 'indoor-d');
  assert.equal(broken.lengthActualM, null);
  assert.equal(broken.lengthState, 'missing_or_nonfinite');
  // L1候補は有効な経路の中から選ばれる。
  assert.equal(pathAudit.l1Candidate.leafId, 'indoor-b');
  assert.equal(pathAudit.l1Candidate.lengthActualM, 32);
  assert.equal(pathAudit.summary.invalidLengthEdges, 1);
  assert.equal(pathAudit.summary.totalLengthM, 59);
});

test('UXE3 path audit handles an invalid root without throwing', () => {
  const engine = new RefrigerantSizerEngine();
  for (const badRoot of [null, undefined, {}, { type: 'branch', children: [] }]) {
    const pathAudit = engine.auditUxE3PipePaths(badRoot);
    assert.equal(pathAudit.l1Candidate.status, 'not_determinable');
    assert.equal(pathAudit.lmCandidate.status, 'not_determinable');
    assert.equal(pathAudit.deltaLCandidate.status, 'not_determinable');
    assert.deepEqual(pathAudit.leafPaths, []);
    assert.ok(pathAudit.notes.length > 0);
  }
});

test('UXE3 path audit is null for other series', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 28, length: 0,
    children: [{ id: 'indoor', type: 'indoor', capacity: 5.6, length: 8, children: [] }]
  };
  const result = engine.calculateSystem(tree, 'fsv_ux3', false);
  assert.equal(result.pathAudit, null);
  assert.equal(result.segmentAudit, null);
});

test('UXE3 path audit terminates on a cyclic tree', () => {
  const engine = new RefrigerantSizerEngine();
  // 循環参照は JSON 由来のツリーでは生じないが、監査自体は終了しなければならない。
  // calculateSystem 経由では既存の processNodeSizing に循環ガードがないため、
  // ここでは監査メソッドの直接呼び出しだけを検証する。
  const branch = { id: 'loop', type: 'branch', length: 5, children: [] };
  branch.children.push(branch);
  const tree = { id: 'root', type: 'outdoor', capacity: 28, length: 0, children: [branch] };
  let pathAudit;
  assert.doesNotThrow(() => { pathAudit = engine.auditUxE3PipePaths(tree); });
  assert.equal(pathAudit.summary.truncated, true);
  assert.ok(pathAudit.notes.some((note) => note.message.includes('循環参照')));
});
