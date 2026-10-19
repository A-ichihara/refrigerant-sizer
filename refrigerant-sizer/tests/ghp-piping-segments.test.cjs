const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractSegments, findMainPipeCandidates } = require('../shared/ghp-piping-segments.js');

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
