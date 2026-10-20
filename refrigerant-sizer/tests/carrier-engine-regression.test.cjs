/**
 * Carrier engine regression tests.
 * Run: node --test refrigerant-sizer/tests/carrier-engine-regression.test.cjs
 * These tests cover UI warning behavior and length aggregation, not full manufacturer model approval.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeEngine() {
  const file = path.join(__dirname, '..', 'carrier-refrigerant-sizer', 'js', 'engine.js');
  const source = fs.readFileSync(file, 'utf8');
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(source + '\n;globalThis.__Engine = RefrigerantSizerEngine;', context, { filename: file });
  return new context.__Engine();
}

function makeFsTree() {
  return {
    id: 'outdoor', type: 'outdoor', capacity: 56, length: 0, children: [{
      id: 'branch', type: 'branch', length: 10, children: [{
        id: 'fs', type: 'fs_unit', length: 5, children: [{
          id: 'indoor', type: 'indoor', capacity: 28, length: 7, children: []
        }]
      }]
    }]
  };
}

test('Carrier engine parses and exposes calculateSystem', () => {
  const engine = makeEngine();
  assert.equal(typeof engine.calculateSystem, 'function');
});

test('Carrier super_multi_u_r permits FS unit without the incompatible-series warning', () => {
  const result = makeEngine().calculateSystem(makeFsTree(), 'super_multi_u_r');
  assert.equal(result.totals.totalLength, 22);
  assert.equal(
    result.warnings.some(w => w.message.includes('FSユニットは追加できません')),
    false
  );
});

test('Carrier switch-over series still warns when an FS unit is present', () => {
  const result = makeEngine().calculateSystem(makeFsTree(), 'super_multi_u_y');
  assert.equal(
    result.warnings.some(w => w.message.includes('FSユニットは追加できません')),
    true
  );
});

test('Carrier mini series still warns when an FS unit is present', () => {
  const result = makeEngine().calculateSystem(makeFsTree(), 'super_multi_mini');
  assert.equal(
    result.warnings.some(w => w.message.includes('FSユニットは追加できません')),
    true
  );
});

test('Carrier UI source parses without syntax errors', () => {
  const file = path.join(__dirname, '..', 'carrier-refrigerant-sizer', 'js', 'ui.js');
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotThrow(() => new Function(source));
});

test('Carrier two-pipe branch tree counts each pipe edge once', () => {
  const tree = {
    id: 'outdoor', type: 'outdoor', capacity: 45, length: 0, children: [{
      id: 'branch', type: 'branch', length: 15, children: [
        { id: 'indoor-a', type: 'indoor', capacity: 5.6, length: 8, children: [] },
        { id: 'indoor-b', type: 'indoor', capacity: 2.8, length: 12, children: [] }
      ]
    }]
  };
  const result = makeEngine().calculateSystem(tree, 'super_multi_u_y');
  assert.equal(result.totals.totalLength, 35);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((sum, len) => sum + len, 0), 35);
  assert.equal(Object.values(result.totals.gasPipes).reduce((sum, len) => sum + len, 0), 35);
});

test('Carrier three-pipe tree counts upstream three-pipe and downstream two-pipe lengths once', () => {
  const tree = {
    id: 'outdoor', type: 'outdoor', capacity: 56, length: 0, children: [{
      id: 'branch-a', type: 'branch', length: 10, children: [{
        id: 'branch-b', type: 'branch', length: 20, children: [{
          id: 'fs', type: 'fs_unit', length: 5, children: [{
            id: 'indoor', type: 'indoor', capacity: 28, length: 7, children: []
          }]
        }]
      }]
    }]
  };
  const result = makeEngine().calculateSystem(tree, 'super_multi_u_r');
  assert.equal(result.totals.totalLength, 42);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((sum, len) => sum + len, 0), 42);
  assert.equal(Object.values(result.totals.highGasPipes).reduce((sum, len) => sum + len, 0), 35);
  assert.equal(Object.values(result.totals.lowGasPipes).reduce((sum, len) => sum + len, 0), 35);
  assert.equal(Object.values(result.totals.gasPipes).reduce((sum, len) => sum + len, 0), 7);
});
