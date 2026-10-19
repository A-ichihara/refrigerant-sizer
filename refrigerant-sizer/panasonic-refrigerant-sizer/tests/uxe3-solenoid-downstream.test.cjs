const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

test('UXE3 uses three-pipe upstream of solenoid kit and two-pipe throughout downstream branch subtree', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: 28,
    length: 0,
    children: [{
      id: 'kit',
      name: 'Solenoid kit',
      type: 'solenoid_kit',
      capacity: 0,
      length: 10,
      children: [{
        id: 'down-branch',
        name: 'Downstream branch',
        type: 'branch',
        length: 5,
        children: [
          { id: 'indoor-a', name: 'Indoor A', type: 'indoor', capacity: 5.6, length: 8, children: [] },
          { id: 'indoor-b', name: 'Indoor B', type: 'indoor', capacity: 5.6, length: 12, children: [] }
        ]
      }]
    }]
  };

  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const kit = tree.children[0];
  const branch = kit.children[0];

  assert.equal(kit.pipes.type, '3pipe');
  assert.equal(branch.pipes.type, '2pipe');
  assert.deepEqual(branch.children.map(node => node.pipes.type), ['2pipe', '2pipe']);
  assert.equal(result.totals.totalLength, 35);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((sum, length) => sum + length, 0), 35);
  assert.equal(Object.values(result.totals.gasPipes).reduce((sum, length) => sum + length, 0), 25);
  assert.equal(Object.values(result.totals.lowGasPipes).reduce((sum, length) => sum + length, 0), 10);
  assert.equal(Object.values(result.totals.highGasPipes).reduce((sum, length) => sum + length, 0), 10);
});
