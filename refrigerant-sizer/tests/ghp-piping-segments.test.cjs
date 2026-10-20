const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractSegments, findMainPipeCandidates, analyzeMainPipeCandidates } = require('../shared/ghp-piping-segments.js');

const node = (id, type, length = 0, children = []) => ({ id, type, length, children });

test('first branch, branch-to-branch and indoor connections', () => {
  const tree = node('out', 'outdoor', 0, [
    node('first', 'branch', 25, [
      node('second', 'branch', 15, [node('in1', 'indoor', 5)]),
      node('in2', 'indoor', 12)
    ])
  ]);
  const original = JSON.stringify(tree);
  const segments = extractSegments(tree);
  assert.deepEqual(segments.map(s => s.role), [
    'outdoor_to_first_branch', 'branch_to_branch', 'branch_to_indoor', 'branch_to_indoor'
  ]);
  assert.equal(segments.reduce((sum, s) => sum + s.actualLengthM, 0), 57);
  assert.ok(segments.every(s => s.equivalentLengthM === null && s.sizeUpRule === null));
  assert.equal(JSON.stringify(tree), original, 'original JSON must not be modified');
});

test('direct outdoor to indoor connection', () => {
  const segments = extractSegments(node('o', 'outdoor', 0, [node('i', 'indoor', 11)]));
  assert.equal(segments[0].role, 'direct_outdoor_to_indoor');
  assert.equal(segments[0].actualLengthM, 11);
});

test('connection kit and BS unit segments', () => {
  const tree = node('o', 'outdoor', 0, [
    node('kit', 'connection_kit', 6, [
      node('b', 'branch', 10, [node('bs', 'bs_unit', 7, [node('i', 'indoor', 4)])])
    ])
  ]);
  assert.deepEqual(extractSegments(tree).map(s => s.role), [
    'outdoor_to_connection_kit', 'connection_kit_to_first_branch', 'branch_to_bs', 'bs_to_indoor'
  ]);
});

test('reject negative, nonfinite and nonnumeric lengths', () => {
  for (const bad of [-1, NaN, Infinity, '12']) {
    assert.throws(() => extractSegments(node('o', 'outdoor', 0, [node('i', 'indoor', bad)])));
  }
});

test('reject duplicate ids and reused nodes', () => {
  const repeated = node('i', 'indoor', 5);
  assert.throws(() => extractSegments(node('o', 'outdoor', 0, [repeated, repeated])));
  assert.throws(() => extractSegments(node('o', 'outdoor', 0, [
    node('i', 'indoor', 5), node('i', 'indoor', 3)
  ])));
});

test('missing length remains zero and is not confused with equivalent length', () => {
  const tree = node('o', 'outdoor', 0, [{ id: 'i', type: 'indoor', children: [] }]);
  const [segment] = extractSegments(tree);
  assert.equal(segment.actualLengthM, 0);
  assert.equal(segment.equivalentLengthM, null);
});

test('main-pipe candidate is the outdoor-to-first-branch segment only', () => {
  const tree = node('out', 'outdoor', 0, [
    node('first', 'branch', 25, [
      node('second', 'branch', 15, [node('in', 'indoor', 5)])
    ])
  ]);
  assert.deepEqual(findMainPipeCandidates(tree).map(s => s.id), ['out->first']);
});

test('connection-kit upstream is excluded from structural main-pipe candidates', () => {
  const tree = node('out', 'outdoor', 0, [
    node('kit', 'connection_kit', 6, [
      node('first', 'branch', 10, [node('in', 'indoor', 4)])
    ])
  ]);
  assert.deepEqual(findMainPipeCandidates(tree).map(s => s.id), ['kit->first']);
});

test('direct outdoor-to-indoor pipe is not automatically treated as verified main pipe', () => {
  const tree = node('out', 'outdoor', 0, [node('in', 'indoor', 11)]);
  assert.deepEqual(findMainPipeCandidates(tree), []);
});

test('two parallel first branches remain ambiguous and never verified', () => {
  const tree = node('o', 'outdoor', 0, [
    node('b1', 'branch', 12, [node('i1', 'indoor', 4)]),
    node('b2', 'branch', 14, [node('i2', 'indoor', 5)])
  ]);
  const result = analyzeMainPipeCandidates(tree);
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates.map(s => s.id), ['o->b1', 'o->b2']);
  assert.equal(result.verified, false);
});

test('single candidate is not manufacturer-verified', () => {
  const result = analyzeMainPipeCandidates(node('o', 'outdoor', 0, [
    node('b', 'branch', 10, [node('i', 'indoor', 4)])
  ]));
  assert.equal(result.status, 'candidate');
  assert.equal(result.verified, false);
});

test('no first branch returns none, not a guessed pipe', () => {
  const result = analyzeMainPipeCandidates(node('o', 'outdoor', 0, [node('i', 'indoor', 11)]));
  assert.equal(result.status, 'none');
  assert.deepEqual(result.candidates, []);
});

test('unsupported parent-child combinations remain unclassified instead of being guessed', () => {
  const tree = node('out', 'outdoor', 0, [
    node('unknown', 'unknown_intermediate', 3, [
      node('branch', 'branch', 8, [node('in', 'indoor', 4)])
    ]),
    node('invalid-bs-parent', 'bs_unit', 2, [
      node('branch-under-bs', 'branch', 5, [node('in2', 'indoor', 4)])
    ]),
    node('invalid-branch-parent', 'outdoor', 0, [
      node('bs-under-outdoor', 'bs_unit', 2, [node('in3', 'indoor', 4)])
    ])
  ]);
  const segments = extractSegments(tree);
  assert.equal(segments.find(s => s.id === 'unknown->branch').role, 'unclassified');
  assert.equal(segments.find(s => s.id === 'invalid-bs-parent->branch-under-bs').role, 'unclassified');
  assert.equal(segments.find(s => s.id === 'invalid-branch-parent->bs-under-outdoor').role, 'unclassified');
});


test('current 2-pipe UI sample shape maps node lengths to parent-child segments', () => {
  // Mirrors the structure and length placement used by the four current UI editors.
  const tree = node('root', 'outdoor', 0, [
    node('branch_1', 'branch', 20, [
      node('indoor_1', 'indoor', 8),
      node('branch_2', 'branch', 15, [
        node('indoor_2', 'indoor', 10),
        node('indoor_3', 'indoor', 6)
      ])
    ])
  ]);
  const segments = extractSegments(tree);
  assert.deepEqual(segments.map(s => [s.id, s.role, s.actualLengthM]), [
    ['root->branch_1', 'outdoor_to_first_branch', 20],
    ['branch_1->indoor_1', 'branch_to_indoor', 8],
    ['branch_1->branch_2', 'branch_to_branch', 15],
    ['branch_2->indoor_2', 'branch_to_indoor', 10],
    ['branch_2->indoor_3', 'branch_to_indoor', 6]
  ]);
  assert.equal(segments.reduce((sum, s) => sum + s.actualLengthM, 0), 59);
  assert.equal(analyzeMainPipeCandidates(tree).candidates[0].actualLengthM, 20);
});

test('current 3-pipe UI sample shape maps BS-unit inlet and downstream segments distinctly', () => {
  // Mirrors the HR/heat-recovery preset: first branch -> BS unit -> indoor units.
  const tree = node('root', 'outdoor', 0, [
    node('branch_1', 'branch', 15, [
      node('bs_1', 'bs_unit', 12, [
        node('indoor_1', 'indoor', 8),
        node('indoor_2', 'indoor', 10)
      ]),
      node('bs_2', 'bs_unit', 18, [
        node('indoor_3', 'indoor', 10),
        node('indoor_4', 'indoor', 8)
      ])
    ])
  ]);
  const segments = extractSegments(tree);
  assert.deepEqual(segments.map(s => s.role), [
    'outdoor_to_first_branch',
    'branch_to_bs', 'bs_to_indoor', 'bs_to_indoor',
    'branch_to_bs', 'bs_to_indoor', 'bs_to_indoor'
  ]);
  assert.equal(segments.reduce((sum, s) => sum + s.actualLengthM, 0), 81);
  assert.equal(analyzeMainPipeCandidates(tree).status, 'candidate');
  // Structural role labels do not imply a manufacturer-approved size-up rule.
  assert.ok(segments.every(s => s.sizeUpRule === null && s.sourceDocument === null));
});

test('reject invalid root node and nonzero outdoor root length', () => {
  assert.throws(() => extractSegments(node('i', 'indoor', 0)), /outdoor tree root/);
  assert.throws(() => extractSegments(node('o', 'outdoor', 5, [node('i', 'indoor', 10)])), /root length/);
  assert.throws(() => extractSegments(node('o', 'outdoor', NaN)), /root length/);
  assert.throws(() => extractSegments(node('o', 'outdoor', -1)), /root length/);
});

test('reject malformed children collection instead of silently omitting pipe segments', () => {
  const tree = node('o', 'outdoor', 0, []);
  tree.children = { id: 'i', type: 'indoor', length: 12 };
  assert.throws(() => extractSegments(tree), /children must be an array/);
  tree.children = 'not-an-array';
  assert.throws(() => extractSegments(tree), /children must be an array/);
  tree.children = [node('i', 'indoor', 10)];
  tree.children[0].children = {};
  assert.throws(() => extractSegments(tree), /children must be an array/);
});

test('valid zero-length root and missing children remain compatible', () => {
  const tree = { id: 'o', type: 'outdoor', length: 0, children: [
    { id: 'i', type: 'indoor', length: 10 }
  ] };
  assert.equal(extractSegments(tree)[0].actualLengthM, 10);
  assert.equal(analyzeMainPipeCandidates(tree).status, 'none');
});
