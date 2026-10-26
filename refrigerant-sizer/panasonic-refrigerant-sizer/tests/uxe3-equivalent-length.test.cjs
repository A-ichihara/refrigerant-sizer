const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// 優先度C・実装順序3：相当長入力（辺ごとの任意入力）。
// 相当長は子ノードの `lengthEquivalent` でのみ与える。PA-P900UXE3 に
// 相当長換算表はないため算出せず、未入力の辺を含む経路の相当長は
// 判定不可とし、実長で代用しない。不正な値（非数値・非有限・負数）は
// 未入力として扱い、危険警告を出す（実長の扱いと同じ）。
// 管径選定・BOM・実長は変更しない。相当長は監査出力だけに使う。

function makeEquivalentTree() {
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
      lengthEquivalent: 10,
      children: [
        {
          id: 'up-b2',
          name: 'Upstream branch 2',
          type: 'branch',
          length: 6,
          lengthEquivalent: 9,
          children: [
            {
              id: 'up-b3',
              name: 'Upstream branch 3',
              type: 'branch',
              length: 4,
              lengthEquivalent: 7,
              children: [{
                id: 'kit-a',
                name: 'Kit A',
                type: 'solenoid_kit',
                length: 8,
                lengthEquivalent: 8,
                children: [
                  { id: 'indoor-a', name: 'Indoor A', type: 'indoor', capacity: 5.6, length: 3, lengthEquivalent: 3, children: [] },
                  { id: 'indoor-b', name: 'Indoor B', type: 'indoor', capacity: 5.6, length: 4, lengthEquivalent: 4, children: [] }
                ]
              }]
            },
            {
              id: 'kit-b',
              name: 'Kit B',
              type: 'solenoid_kit',
              length: 5,
              lengthEquivalent: 5,
              children: [
                { id: 'indoor-c', name: 'Indoor C', type: 'indoor', capacity: 5.6, length: 7, lengthEquivalent: 7, children: [] }
              ]
            }
          ]
        },
        {
          id: 'kit-c',
          name: 'Kit C',
          type: 'solenoid_kit',
          length: 12,
          lengthEquivalent: 20,
          children: [
            { id: 'indoor-d', name: 'Indoor D', type: 'indoor', capacity: 5.6, length: 9, lengthEquivalent: 15, children: [] }
          ]
        }
      ]
    }]
  };
  // 経路長（実長）：A=31、B=32、C=28、D=31。実長基準のL1候補はB（32m）。
  // 経路長（相当長）：A=37、B=38、C=31、D=45。相当長基準のL1候補はD（45m）。
  // LM候補は LA=6＋LB=4=10m（実長）、相当長は LA=9＋LB=7=16m。
  // ΔL候補は第一分岐（up-b2）から：実長は最大16・最小12・差4、
  // 相当長は最大19・最小12・差7。
}

test('UXE3 equivalent length picks a different L1 farthest path than actual length', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeEquivalentTree(), 'fsv_uxe3', false);
  const pathAudit = result.pathAudit;

  assert.ok(pathAudit);
  assert.deepEqual(pathAudit.leafPaths.map((path) => path.lengthActualM), [31, 32, 28, 31]);
  assert.deepEqual(pathAudit.leafPaths.map((path) => path.lengthEquivalentM), [37, 38, 31, 45]);
  assert.deepEqual(pathAudit.leafPaths.map((path) => path.equivalentState),
    ['valid_nonnegative', 'valid_nonnegative', 'valid_nonnegative', 'valid_nonnegative']);

  // 実長基準のL1候補はBのまま。同経路の相当長も特定できる。
  assert.equal(pathAudit.l1Candidate.status, 'candidate');
  assert.equal(pathAudit.l1Candidate.leafId, 'indoor-b');
  assert.equal(pathAudit.l1Candidate.lengthActualM, 32);
  assert.equal(pathAudit.l1Candidate.lengthEquivalentM, 38);
  assert.equal(pathAudit.l1Candidate.equivalentStatus, 'determined');

  // 相当長基準のL1候補はDであり、実長基準とは別の経路になる。
  assert.equal(pathAudit.l1EquivalentCandidate.status, 'candidate');
  assert.equal(pathAudit.l1EquivalentCandidate.leafId, 'indoor-d');
  assert.equal(pathAudit.l1EquivalentCandidate.lengthEquivalentM, 45);
  assert.equal(pathAudit.l1EquivalentCandidate.lengthActualM, 31);
  assert.equal(pathAudit.l1EquivalentCandidate.equivalentStatus, 'determined');
  assert.ok(pathAudit.notes.some((note) => note.message.includes('indoor-d')));

  // LM・ΔLの相当長も特定できる。実長の値は変わらない。
  assert.equal(pathAudit.lmCandidate.status, 'candidate');
  assert.equal(pathAudit.lmCandidate.lengthActualM, 10);
  assert.equal(pathAudit.lmCandidate.lengthEquivalentM, 16);
  assert.equal(pathAudit.lmCandidate.equivalentStatus, 'determined');
  assert.equal(pathAudit.deltaLCandidate.status, 'candidate');
  assert.equal(pathAudit.deltaLCandidate.maxLengthM, 16);
  assert.equal(pathAudit.deltaLCandidate.minLengthM, 12);
  assert.equal(pathAudit.deltaLCandidate.deltaM, 4);
  assert.equal(pathAudit.deltaLCandidate.maxLengthEquivalentM, 19);
  assert.equal(pathAudit.deltaLCandidate.minLengthEquivalentM, 12);
  assert.equal(pathAudit.deltaLCandidate.deltaEquivalentM, 7);
  assert.equal(pathAudit.deltaLCandidate.equivalentStatus, 'determined');
  assert.equal(pathAudit.deltaLCandidate.equivalentTerminalCount, 3);

  // 区間監査にも相当長が載る。
  const kitC = result.segmentAudit.findings.find((finding) => finding.childId === 'kit-c');
  assert.equal(kitC.lengthEquivalentM, 20);
  assert.equal(kitC.equivalentLengthState, 'valid_nonnegative');

  // 相当長の入力は管径集計・BOM・実長を変えず、ツリーも変更しない。
  assert.equal(result.totals.totalLength, 68);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((sum, len) => sum + len, 0), 68);
  assert.ok(result.warnings.every((w) => !w.message.includes('相当長')));
  const tree = makeEquivalentTree();
  const beforeAudit = JSON.stringify(tree);
  engine.auditUxE3PipePaths(tree);
  assert.equal(JSON.stringify(tree), beforeAudit, 'audit must not mutate the tree');
});

test('UXE3 missing equivalent length on the LB edge makes LM equivalent not determinable', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeEquivalentTree();
  // LB辺（up-b3）の相当長を未入力にする。
  delete tree.children[0].children[0].children[0].lengthEquivalent;
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const pathAudit = result.pathAudit;

  // 実長基準の値は変わらない。
  assert.equal(pathAudit.l1Candidate.leafId, 'indoor-b');
  assert.equal(pathAudit.l1Candidate.lengthActualM, 32);
  assert.equal(pathAudit.lmCandidate.lengthActualM, 10);
  assert.equal(pathAudit.deltaLCandidate.maxLengthM, 16);
  assert.equal(pathAudit.deltaLCandidate.minLengthM, 12);
  assert.equal(pathAudit.deltaLCandidate.deltaM, 4);

  // LB辺を通るA・B経路の相当長は判定不可。実長で代用してはならない。
  assert.deepEqual(pathAudit.leafPaths.map((path) => path.lengthEquivalentM), [null, null, 31, 45]);
  assert.equal(pathAudit.l1Candidate.lengthEquivalentM, null);
  assert.equal(pathAudit.l1Candidate.equivalentStatus, 'not_determinable');
  assert.equal(pathAudit.lmCandidate.lengthEquivalentM, null);
  assert.equal(pathAudit.lmCandidate.equivalentStatus, 'not_determinable');

  // 相当長基準のL1候補は、相当長が特定できる経路の中から選ばれる（D・45m）。
  assert.equal(pathAudit.l1EquivalentCandidate.status, 'candidate');
  assert.equal(pathAudit.l1EquivalentCandidate.leafId, 'indoor-d');
  assert.equal(pathAudit.l1EquivalentCandidate.lengthEquivalentM, 45);

  // ΔLの相当長は、第一分岐から先の辺が有効な経路だけで決まる。
  // A・Bの後半辺はup-b3を含むため対象外となり、Cだけが残る。
  assert.equal(pathAudit.deltaLCandidate.maxLengthEquivalentM, 12);
  assert.equal(pathAudit.deltaLCandidate.minLengthEquivalentM, 12);
  assert.equal(pathAudit.deltaLCandidate.deltaEquivalentM, 0);
  assert.equal(pathAudit.deltaLCandidate.equivalentStatus, 'determined');
  assert.equal(pathAudit.deltaLCandidate.equivalentTerminalCount, 1);

  // 未入力の相当長に警告は出さない（任意入力のため）。
  assert.ok(result.warnings.every((w) => !w.message.includes('相当長')));
});

test('UXE3 missing equivalent length on a side branch leaves LM and delta-L equivalents intact', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeEquivalentTree();
  // 第一分岐の外側にあるkit-c辺の相当長を未入力にする。
  delete tree.children[0].children[1].lengthEquivalent;
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const pathAudit = result.pathAudit;

  // D経路の相当長だけが判定不可になる。
  assert.deepEqual(pathAudit.leafPaths.map((path) => path.lengthEquivalentM), [37, 38, 31, null]);
  // 相当長基準のL1候補は、残る中で最遠のB（38m）になる。
  assert.equal(pathAudit.l1EquivalentCandidate.status, 'candidate');
  assert.equal(pathAudit.l1EquivalentCandidate.leafId, 'indoor-b');
  assert.equal(pathAudit.l1EquivalentCandidate.lengthEquivalentM, 38);
  // LM・ΔLの相当長は影響を受けない。
  assert.equal(pathAudit.lmCandidate.lengthEquivalentM, 16);
  assert.equal(pathAudit.lmCandidate.equivalentStatus, 'determined');
  assert.equal(pathAudit.deltaLCandidate.deltaEquivalentM, 7);
  assert.equal(pathAudit.deltaLCandidate.equivalentStatus, 'determined');
  // 実長基準の値は変わらない。
  assert.equal(pathAudit.l1Candidate.lengthActualM, 32);
  assert.equal(pathAudit.lmCandidate.lengthActualM, 10);
});

test('UXE3 non-numeric equivalent length is treated as missing with a danger warning', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeEquivalentTree();
  tree.children[0].children[1].children[0].lengthEquivalent = 'x';
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const pathAudit = result.pathAudit;

  // D経路の相当長は未入力として扱う。
  const broken = pathAudit.leafPaths.find((path) => path.leafId === 'indoor-d');
  assert.equal(broken.lengthEquivalentM, null);
  assert.equal(broken.equivalentState, 'missing_or_nonfinite');
  assert.equal(pathAudit.l1EquivalentCandidate.leafId, 'indoor-b');
  assert.equal(pathAudit.l1EquivalentCandidate.lengthEquivalentM, 38);

  // 危険警告が出る（警告パネル経由の区間監査と、経路診断の注記の両方）。
  const auditWarnings = result.warnings.filter((w) => w.message.includes('相当長'));
  assert.equal(auditWarnings.length, 1);
  assert.equal(auditWarnings[0].type, 'danger');
  assert.ok(pathAudit.notes.some((note) => note.type === 'danger' && note.message.includes('相当長')));
  const finding = result.segmentAudit.findings.find((item) => item.childId === 'indoor-d');
  assert.equal(finding.lengthEquivalentM, null);
  assert.equal(finding.equivalentLengthState, 'missing_or_nonfinite');

  // 実長基準の値とBOMは変わらない。
  assert.equal(pathAudit.l1Candidate.lengthActualM, 32);
  assert.equal(pathAudit.lmCandidate.lengthActualM, 10);
  assert.equal(result.totals.totalLength, 68);
});

test('UXE3 negative equivalent length on the LA edge is treated as missing with a danger warning', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = makeEquivalentTree();
  tree.children[0].children[0].lengthEquivalent = -3;
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const pathAudit = result.pathAudit;

  // LA辺を通るA・B・C経路の相当長は判定不可。Dだけが残る。
  assert.deepEqual(pathAudit.leafPaths.map((path) => path.lengthEquivalentM), [null, null, null, 45]);
  assert.equal(pathAudit.l1Candidate.lengthEquivalentM, null);
  assert.equal(pathAudit.l1Candidate.equivalentStatus, 'not_determinable');
  assert.equal(pathAudit.l1EquivalentCandidate.leafId, 'indoor-d');
  assert.equal(pathAudit.l1EquivalentCandidate.lengthEquivalentM, 45);

  // LMの相当長はLA辺が不正のため判定不可。実長は変わらない。
  assert.equal(pathAudit.lmCandidate.lengthActualM, 10);
  assert.equal(pathAudit.lmCandidate.lengthEquivalentM, null);
  assert.equal(pathAudit.lmCandidate.equivalentStatus, 'not_determinable');
  const laFinding = result.segmentAudit.findings.find((item) => item.childId === 'up-b2');
  assert.equal(laFinding.lengthEquivalentM, null);
  assert.equal(laFinding.equivalentLengthState, 'invalid_negative');

  // ΔLの相当長は第一分岐から先の辺だけで決まるため、LA辺の影響を受けない。
  assert.equal(pathAudit.deltaLCandidate.maxLengthEquivalentM, 19);
  assert.equal(pathAudit.deltaLCandidate.minLengthEquivalentM, 12);
  assert.equal(pathAudit.deltaLCandidate.deltaEquivalentM, 7);
  assert.equal(pathAudit.deltaLCandidate.equivalentStatus, 'determined');

  // 危険警告が出る。
  assert.ok(result.warnings.some((w) => w.type === 'danger' && w.message.includes('相当長')));
  assert.ok(pathAudit.notes.some((note) => note.type === 'danger' && note.message.includes('相当長')));
});

test('UXE3 equivalent length is not determinable when no edge provides one', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 28, length: 0,
    children: [{
      id: 'up-b1', type: 'branch', length: 10,
      children: [{
        id: 'up-b2', type: 'branch', length: 6,
        children: [{
          id: 'up-b3', type: 'branch', length: 4,
          children: [{
            id: 'kit-a', type: 'solenoid_kit', length: 8,
            children: [{ id: 'indoor-a', type: 'indoor', capacity: 5.6, length: 3, children: [] }]
          }]
        }]
      }]
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const pathAudit = result.pathAudit;

  assert.equal(pathAudit.l1Candidate.status, 'candidate');
  assert.equal(pathAudit.l1Candidate.lengthActualM, 31);
  assert.equal(pathAudit.l1Candidate.lengthEquivalentM, null);
  assert.equal(pathAudit.l1Candidate.equivalentStatus, 'not_determinable');
  assert.equal(pathAudit.l1EquivalentCandidate.status, 'not_determinable');
  assert.equal(pathAudit.l1EquivalentCandidate.lengthEquivalentM, null);
  assert.ok(pathAudit.l1EquivalentCandidate.reason.includes('相当長'));
  assert.equal(pathAudit.lmCandidate.lengthActualM, 10);
  assert.equal(pathAudit.lmCandidate.lengthEquivalentM, null);
  assert.equal(pathAudit.lmCandidate.equivalentStatus, 'not_determinable');
  assert.equal(pathAudit.deltaLCandidate.maxLengthEquivalentM, null);
  assert.equal(pathAudit.deltaLCandidate.minLengthEquivalentM, null);
  assert.equal(pathAudit.deltaLCandidate.deltaEquivalentM, null);
  assert.equal(pathAudit.deltaLCandidate.equivalentStatus, 'not_determinable');
  assert.equal(pathAudit.deltaLCandidate.equivalentTerminalCount, 0);
  assert.ok(result.segmentAudit.findings.every(
    (finding) => finding.lengthEquivalentM === null && finding.equivalentLengthState === 'missing_or_nonfinite'
  ));
  // 相当長が一度も入力されていない場合、警告は出さない。
  assert.ok(result.warnings.every((w) => !w.message.includes('相当長')));
  assert.ok(result.pathAudit.notes.every((note) => note.type !== 'danger' || !note.message.includes('相当長')));
});
