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


test('UXE3 direct connection warning uses the correct series name, not MF3', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 28, length: 0,
    children: [{
      id: 'indoor', name: 'Indoor without kit', type: 'indoor', capacity: 5.6, length: 8, children: []
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  assert.ok(result.warnings.some(w => w.message.includes('UXE3（冷暖フリー）系統')));
  assert.ok(result.warnings.every(w => !w.message.includes('冷暖同時(MF3)')));
});

test('UXE3 18HP/20HP combination model identifiers', () => {
  const engine = new RefrigerantSizerEngine();
  const db = engine.SERIES_DATABASE.fsv_uxe3.outdoorCapacities;
  assert.deepEqual(db.filter(x => x.hp === '18' || x.hp === '20').map(x => [x.hp, x.kw, x.model]), [
    ['18', 50.4, 'PA-P504UXE3'],
    ['20', 56.0, 'PA-P560UXE3']
  ]);
  assert.equal(engine.generateModelNumber({ type: 'outdoor', capacity: 50.4 }, 'fsv_uxe3'), 'PA-P504UXE3');
  assert.equal(engine.generateModelNumber({ type: 'outdoor', capacity: 56.0 }, 'fsv_uxe3'), 'PA-P560UXE3');
  assert.deepEqual(db.filter(x => Number(x.hp) <= 16).map(x => x.model), [
    'CU-P224UXE3', 'CU-P280UXE3', 'CU-P335UXE3', 'CU-P400UXE3', 'CU-P450UXE3'
  ]);
});


test('UXE3 upstream branch stays three-pipe, counts BOM and does not trigger direct-connection warning', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    type: 'outdoor', name: 'Outdoor', capacity: 28, length: 0,
    children: [{ type: 'branch', name: 'Upstream branch', length: 7, children: [
      { type: 'solenoid_kit', name: 'Kit A', length: 11, children: [
        { type: 'indoor', name: 'Indoor A', capacity: 5.6, length: 3, children: [] }
      ] },
      { type: 'solenoid_kit', name: 'Kit B', length: 13, children: [
        { type: 'indoor', name: 'Indoor B', capacity: 5.6, length: 5, children: [] }
      ] }
    ] }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const branch = tree.children[0];
  assert.equal(branch.pipes.type, '3pipe');
  assert.deepEqual(branch.children.map(n => n.pipes.type), ['3pipe', '3pipe']);
  assert.deepEqual(branch.children.map(n => n.children[0].pipes.type), ['2pipe', '2pipe']);
  assert.equal(result.totals.totalLength, 39);
  assert.equal(Object.values(result.totals.highGasPipes).reduce((a,b) => a+b, 0), 31);
  assert.equal(Object.values(result.totals.lowGasPipes).reduce((a,b) => a+b, 0), 31);
  assert.equal(Object.values(result.totals.gasPipes).reduce((a,b) => a+b, 0), 8);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((a,b) => a+b, 0), 39);
  assert.ok(result.warnings.every(w => !w.message.includes('電磁弁キットが必要')));
  assert.equal(result.totals.joints['CZ-P56HRV3'], 2);
});


test('UXE3 multi-level upstream branches keep three-pipe BOM and downstream branches keep two-pipe BOM', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = { type: 'outdoor', name: 'Outdoor', capacity: 28, length: 0, children: [
    { type: 'branch', name: 'First upstream', length: 4, children: [
      { type: 'branch', name: 'Second upstream', length: 6, children: [
        { type: 'solenoid_kit', name: 'Kit A', length: 8, children: [
          { type: 'branch', name: 'Downstream branch', length: 2, children: [
            { type: 'indoor', name: 'Indoor A', capacity: 5.6, length: 3, children: [] },
            { type: 'indoor', name: 'Indoor B', capacity: 5.6, length: 4, children: [] }
          ] }
        ] }
      ] },
      { type: 'solenoid_kit', name: 'Kit B', length: 5, children: [
        { type: 'indoor', name: 'Indoor C', capacity: 5.6, length: 7, children: [] }
      ] }
    ] }
  ] };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  const first = tree.children[0];
  const second = first.children[0];
  const kitA = second.children[0];
  const kitB = first.children[1];
  assert.deepEqual([first.pipes.type, second.pipes.type, kitA.pipes.type, kitB.pipes.type], ['3pipe','3pipe','3pipe','3pipe']);
  assert.equal(kitA.children[0].pipes.type, '2pipe');
  assert.deepEqual(kitA.children[0].children.map(x => x.pipes.type), ['2pipe','2pipe']);
  assert.equal(kitB.children[0].pipes.type, '2pipe');
  assert.equal(result.totals.totalLength, 39);
  assert.equal(Object.values(result.totals.highGasPipes).reduce((a,b) => a+b, 0), 23);
  assert.equal(Object.values(result.totals.lowGasPipes).reduce((a,b) => a+b, 0), 23);
  assert.equal(Object.values(result.totals.gasPipes).reduce((a,b) => a+b, 0), 16);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((a,b) => a+b, 0), 39);
  assert.ok(result.warnings.every(w => !w.message.includes('電磁弁キットが必要')));
});


test('legacy UXE3 18HP capacity migrates without changing downstream data or other series', () => {
  const engine = new RefrigerantSizerEngine();
  const child = { type: 'indoor', name: 'Existing room', capacity: 5.6, length: 17, children: [] };
  const tree = { type: 'outdoor', capacity: 50.0, children: [child] };
  assert.equal(engine.migrateLegacyOutdoorCapacity(tree, 'fsv_uxe3'), true);
  assert.equal(tree.capacity, 50.4);
  assert.equal(tree.children[0], child);
  assert.equal(child.length, 17);
  assert.equal(engine.generateModelNumber(tree, 'fsv_uxe3'), 'PA-P504UXE3');
  assert.equal(engine.migrateLegacyOutdoorCapacity(tree, 'fsv_uxe3'), false);
  const otherSeries = { type: 'outdoor', capacity: 50.0 };
  assert.equal(engine.migrateLegacyOutdoorCapacity(otherSeries, 'fsv_ux3'), false);
  assert.equal(otherSeries.capacity, 50.0);
  const otherCapacity = { type: 'outdoor', capacity: 56.0 };
  assert.equal(engine.migrateLegacyOutdoorCapacity(otherCapacity, 'fsv_uxe3'), false);
  assert.equal(otherCapacity.capacity, 56.0);
});


test('UXE3 manual size-up is safely ignored by engine with explicit warning', () => {
  const engine = new RefrigerantSizerEngine();
  const makeTree = () => ({ type: 'outdoor', name: 'Outdoor', capacity: 28, children: [
    { type: 'solenoid_kit', name: 'Kit', length: 10, children: [
      { type: 'indoor', name: 'Room', capacity: 5.6, length: 8, children: [] }
    ] }
  ] });
  const standard = engine.calculateSystem(makeTree(), 'fsv_uxe3', false);
  const requested = engine.calculateSystem(makeTree(), 'fsv_uxe3', true);
  assert.ok(standard.warnings.some(w => w.message.includes('UXE3基準配管径未検証')));
  assert.ok(requested.warnings.some(w => w.message.includes('UXE3基準配管径未検証')));
  assert.deepEqual(requested.totals, standard.totals);
  assert.deepEqual(requested.tree.children[0].pipes, standard.tree.children[0].pipes);
  assert.deepEqual(requested.tree.children[0].children[0].pipes, standard.tree.children[0].children[0].pipes);
  assert.ok(requested.warnings.some(w => w.message.includes('UXE3手動サイズアップ未適用')));
});

test('UXE3 unsupported outdoor capacity produces a clear stop warning', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    type: 'outdoor',
    name: 'Unsupported 22HP system',
    capacity: 61.5,
    length: 0,
    children: [{
      type: 'solenoid_kit',
      name: 'Solenoid kit',
      length: 5,
      children: [{ type: 'indoor', name: 'Indoor', capacity: 5.6, length: 8, children: [] }]
    }]
  };

  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  assert.ok(result.warnings.some(w =>
    w.type === 'danger' &&
    w.message.includes('UXE3対応容量外') &&
    w.message.includes('61.5kW') &&
    w.message.includes('8～20HP')
  ));
  assert.ok(result.warnings.some(w => w.message.includes('UXE3基準配管径未検証')));
});

test('UXE3 non-finite outdoor capacities are explicitly rejected by the capacity warning', () => {
  const engine = new RefrigerantSizerEngine();

  for (const capacity of [NaN, Infinity, -Infinity]) {
    const tree = {
      type: 'outdoor',
      name: 'Invalid capacity system',
      capacity,
      children: [{
        type: 'solenoid_kit',
        name: 'Solenoid kit',
        length: 5,
        children: [{ type: 'indoor', name: 'Indoor', capacity: 5.6, length: 8, children: [] }]
      }]
    };

    const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
    assert.ok(
      result.warnings.some(w => w.type === 'danger' && w.message.includes('UXE3対応容量外')),
      `capacity warning missing for invalid value: ${String(capacity)}`
    );
    assert.equal(tree.modelNumber, '-', 'invalid outdoor capacity must not map to a supported model');
  }
});

test('UXE3 unverified-base-diameter warning remains active for every registered outdoor capacity', () => {
  const engine = new RefrigerantSizerEngine();
  const capacities = engine.SERIES_DATABASE.fsv_uxe3.outdoorCapacities;

  for (const outdoor of capacities) {
    const makeTree = () => ({
      type: 'outdoor',
      name: outdoor.model,
      capacity: outdoor.kw,
      length: 0,
      children: [{
        type: 'solenoid_kit',
        name: 'Solenoid kit',
        length: 5,
        children: [{
          type: 'indoor',
          name: 'Indoor',
          capacity: 5.6,
          length: 8,
          children: []
        }]
      }]
    });

    const standardTree = makeTree();
    const requestedTree = makeTree();
    const standard = engine.calculateSystem(standardTree, 'fsv_uxe3', false);
    const requested = engine.calculateSystem(requestedTree, 'fsv_uxe3', true);

    assert.ok(
      standard.warnings.some(w => w.message.includes('UXE3基準配管径未検証')),
      `base-diameter warning missing for ${outdoor.model} (${outdoor.kw} kW)`
    );
    assert.ok(
      requested.warnings.some(w => w.message.includes('UXE3基準配管径未検証')),
      `base-diameter warning missing with manual size-up requested for ${outdoor.model}`
    );
    assert.ok(
      requested.warnings.some(w => w.message.includes('UXE3手動サイズアップ未適用')),
      `manual size-up stop warning missing for ${outdoor.model}`
    );
    assert.deepEqual(requested.totals, standard.totals, `manual size-up changed totals for ${outdoor.model}`);
    assert.deepEqual(
      requestedTree.children[0].pipes,
      standardTree.children[0].pipes,
      `manual size-up changed solenoid-kit upstream pipes for ${outdoor.model}`
    );
    assert.deepEqual(
      requestedTree.children[0].children[0].pipes,
      standardTree.children[0].children[0].pipes,
      `manual size-up changed indoor branch pipes for ${outdoor.model}`
    );
  }
});

test('UXE3 manual size-up button visibly communicates its stopped state', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const uiSource = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  assert.match(uiSource, /forceSUpBtn\.disabled = this\.activeSeriesId === 'fsv_uxe3'/);
  assert.match(uiSource, /label\.textContent = this\.activeSeriesId === 'fsv_uxe3' \? '⚡ 主管サイズUP（停止中）' : '⚡ 主管サイズUP'/);
  assert.match(uiSource, /label\.textContent = sizeUpButton\.disabled \? '⚡ 主管サイズUP（停止中）' : '⚡ 主管サイズUP'/);
});


test('UXE3 page labels consistently use Panasonic cold/heat-free terminology', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /冷暖フリービル用マルチ UXE3シリーズ/);
  assert.match(html, /冷暖フリー UXE3 \(3管式・電磁弁キット\)/);
  assert.doesNotMatch(html, /冷暖同時 UXE3/);
  assert.doesNotMatch(html, /電磁弁キット（冷暖同時）/);
});

test('UXE3 pipe-size reference table uses cold/heat-free terminology', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const uiSource = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  assert.match(uiSource, /UXE3（冷暖フリー・3管式）/);
  assert.doesNotMatch(uiSource, /UXE3（冷暖同時・3管式）/);
});

test('UXE3 pipe reference table keeps its non-official-data disclaimer', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const uiSource = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  assert.match(uiSource, /メーカーの正式設計表そのものではありません/);
  assert.match(uiSource, /実設計では該当機種の最新技術資料との照合が必要です/);
});

test('UXE3 marks displayed pipe diameters as unverified on indoor and outdoor nodes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const uiSource = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  assert.match(uiSource, /const unverifiedPipeLabel = this\.activeSeriesId === 'fsv_uxe3'/);
  assert.match(uiSource, /管径参考値・未検証（公式区間照合未完了）/);
  assert.equal((uiSource.match(/\$\{unverifiedPipeLabel\}/g) || []).length, 3);
});

test('UXE3 unverified pipe label remains visually distinct on screen and in print', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const css = fs.readFileSync(path.join(__dirname, '../css/styles.css'), 'utf8');
  assert.match(css, /\.pipe-size-unverified\s*\{/);
  assert.match(css, /border: 1px solid rgba\(245, 158, 11, 0\.55\)/);
  assert.match(css, /@media print\s*\{[\s\S]*?\.pipe-size-unverified\s*\{/);
  assert.match(css, /color: #78350f !important/);
});


test('UXE3 rejects finite outdoor capacities not present in its official-model master', () => {
  const engine = new RefrigerantSizerEngine();
  const registered = engine.SERIES_DATABASE.fsv_uxe3.outdoorCapacities.map(x => x.kw);
  for (const capacity of [0, -1, 20, 25, 30, 50.0, 61.5, 100]) {
    assert.ok(!registered.includes(capacity), `fixture accidentally registered: ${capacity}`);
    const tree = { type: 'outdoor', name: 'Unregistered outdoor', capacity, children: [
      { type: 'solenoid_kit', name: 'Kit', length: 2, children: [
        { type: 'indoor', name: 'Room', capacity: 5.6, length: 3, children: [] }
      ] }
    ] };
    const result = engine.calculateSystem(tree, 'fsv_uxe3');
    assert.ok(result.warnings.some(w => w.type === 'danger' && w.message.includes('UXE3対応容量外')), `no warning for ${capacity}`);
    assert.equal(tree.modelNumber, '-', `unexpected model for ${capacity}`);
    assert.ok(result.warnings.some(w => w.message.includes('UXE3基準配管径未検証')));
  }
});


test('UXE3 3-pipe upstream branches currently use outdoor capacity, not branch downstream capacity (characterization)', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = { type: 'outdoor', name: 'Outdoor 16HP', capacity: 45.0, children: [
    { type: 'branch', name: 'First branch', length: 4, children: [
      { type: 'solenoid_kit', name: 'Kit A', length: 6, children: [
        { type: 'indoor', name: 'Room A', capacity: 5.6, length: 2, children: [] }
      ] },
      { type: 'solenoid_kit', name: 'Kit B', length: 8, children: [
        { type: 'indoor', name: 'Room B', capacity: 5.6, length: 3, children: [] }
      ] }
    ] }
  ] };
  const result = engine.calculateSystem(tree, 'fsv_uxe3');
  const branch = tree.children[0];
  assert.equal(branch.capacitySum, 11.2);
  assert.deepEqual(branch.children.map(n => n.capacitySum), [5.6, 5.6]);
  const currentReference = engine.selectThreePipeSize(45.0);
  for (const segment of [branch, ...branch.children]) {
    assert.deepEqual(segment.pipes, {
      type: '3pipe', liquid: currentReference.liquid,
      highGas: currentReference.dischargeGas, lowGas: currentReference.suctionGas
    });
  }
  assert.ok(result.warnings.some(w => w.message.includes('UXE3基準配管径未検証')));
  // This test documents the current implementation; it does NOT validate official segment diameters.
});
