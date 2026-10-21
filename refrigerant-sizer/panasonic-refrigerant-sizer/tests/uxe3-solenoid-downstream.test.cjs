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


test('UXE3 branch pipe-length totals preserve 3-pipe upstream and 2-pipe downstream separation', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = { type: 'outdoor', name: 'Outdoor', capacity: 45.0, children: [
    { type: 'branch', name: 'Upstream', length: 7, children: [
      { type: 'solenoid_kit', name: 'Kit', length: 11, children: [
        { type: 'indoor', name: 'Indoor', capacity: 5.6, length: 13, children: [] }
      ] }
    ] }
  ] };
  const result = engine.calculateSystem(tree, 'fsv_uxe3');
  assert.equal(result.totals.totalLength, 31);
  assert.equal(Object.values(result.totals.highGasPipes).reduce((a, b) => a + b, 0), 18);
  assert.equal(Object.values(result.totals.lowGasPipes).reduce((a, b) => a + b, 0), 18);
  assert.equal(Object.values(result.totals.gasPipes).reduce((a, b) => a + b, 0), 13);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((a, b) => a + b, 0), 31);
  assert.ok(result.warnings.some(w => w.message.includes('UXE3基準配管径未検証')));
  // Totals are a characterization of current behavior, not validated manufacturer pipe sizes.
});


test('UXE3 calculation exposes read-only segment audit and includes its warnings', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: 22.4,
    length: 0,
    children: [{
      id: 'kit',
      name: 'Solenoid kit',
      type: 'solenoid_kit',
      capacity: 0,
      length: 10,
      children: [{
        id: 'indoor',
        name: 'Indoor',
        type: 'indoor',
        capacity: 5.6,
        length: 8,
        children: []
      }]
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);

  assert.ok(result.segmentAudit);
  assert.equal(result.segmentAudit.summary.totalEdges, 2);
  assert.equal(result.segmentAudit.summary.unclassified, 2);
  assert.ok(result.warnings.some(w => w.message.includes('区間未確定')));
  assert.equal(JSON.stringify(tree).includes('"edgeSpec"'), false, 'audit integration must not inject edge metadata');
});

test('UXE3 segment audit is non-mutating and never infers official segment types from tree position', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 45.0, length: 0, children: [
      { id: 'branch', type: 'branch', length: 7, children: [
        { id: 'kit', type: 'solenoid_kit', length: 11, children: [
          { id: 'indoor', type: 'indoor', capacity: 5.6, length: 13, children: [] }
        ] }
      ] }
    ]
  };
  const before = JSON.stringify(tree);
  const audit = engine.auditUxE3PipeSegments(tree);

  assert.equal(JSON.stringify(tree), before, 'audit must not mutate the source tree');
  assert.deepEqual(audit.summary, { totalEdges: 3, unclassified: 3, declared: 0 });
  assert.deepEqual(audit.findings.map(edge => edge.segmentType), [
    'unclassified', 'unclassified', 'unclassified'
  ]);
  assert.ok(audit.findings.every(edge => edge.validationState === 'unverified'));
  assert.ok(audit.warnings.some(w => w.message.includes('ノード構造だけから公式区間や管径を推定していません')));
});

test('UXE3 segment audit reports explicit segment labels as unverified declarations', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 45.0, children: [
      {
        id: 'main', type: 'branch', length: 12,
        edgeSpec: {
          segmentType: 'main_LM',
          capacityBasis: 'outdoor_total',
          sourceKey: 'not-yet-verified',
          validationState: 'unverified'
        },
        children: []
      },
      { id: 'unknown', type: 'solenoid_kit', length: 4, children: [] }
    ]
  };
  const before = JSON.stringify(tree);
  const audit = engine.auditUxE3PipeSegments(tree);

  assert.equal(JSON.stringify(tree), before);
  assert.deepEqual(audit.summary, { totalEdges: 2, unclassified: 1, declared: 1 });
  assert.equal(audit.findings[0].segmentType, 'main_LM');
  assert.equal(audit.findings[0].declarationState, 'declared_unverified');
  assert.equal(audit.findings[0].validationState, 'unverified');
  assert.equal(audit.findings[1].segmentType, 'unclassified');
  assert.ok(audit.warnings.some(w => w.message.includes('監査結果はメーカー仕様への適合確認を意味しません')));
});

test('UXE3 segment audit rejects an invalid root without modifying it', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = { type: 'branch', children: [] };
  const before = JSON.stringify(tree);
  const audit = engine.auditUxE3PipeSegments(tree);

  assert.equal(JSON.stringify(tree), before);
  assert.deepEqual(audit.summary, { totalEdges: 0, unclassified: 0, declared: 0 });
  assert.ok(audit.warnings.some(w => w.type === 'danger'));
});


test('UXE3 segment audit flags invalid lengths and unknown metadata values without mutating input', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 45, children: [
      {
        id: 'negative-length', type: 'branch', length: -2,
        edgeSpec: {
          segmentType: 'main_LM',
          capacityBasis: 'invented_basis',
          validationState: 'manufacturer_verified_without_evidence'
        },
        children: []
      },
      { id: 'missing-length', type: 'solenoid_kit', children: [] }
    ]
  };
  const before = JSON.stringify(tree);
  const audit = engine.auditUxE3PipeSegments(tree);

  assert.equal(JSON.stringify(tree), before, 'audit must not mutate source tree');
  assert.equal(audit.findings[0].lengthState, 'invalid_negative');
  assert.equal(audit.findings[0].lengthM, -2);
  assert.equal(audit.findings[0].capacityBasis, null);
  assert.equal(audit.findings[0].validationState, 'unverified');
  assert.equal(audit.findings[1].lengthState, 'missing_or_nonfinite');
  assert.ok(audit.warnings.some(w => w.type === 'danger' && w.message.includes('配管長が未入力・非数値、または負数')));
  assert.ok(audit.warnings.some(w => w.type === 'danger' && w.message.includes('未定義の容量基準')));
  assert.ok(audit.warnings.some(w => w.type === 'danger' && w.message.includes('未定義の検証状態')));
});


test('UXE3 segment audit reports malformed child entries and distinguishes cycles from shared nodes', () => {
  const engine = new RefrigerantSizerEngine();
  const cyclic = { id: 'root', type: 'outdoor', length: 0, children: [] };
  const loop = { id: 'loop', type: 'branch', length: 2, children: [] };
  cyclic.children.push(loop);
  loop.children.push(cyclic);
  cyclic.children.push(null);

  const before = JSON.stringify(cyclic, (key, value) => key === 'children' && Array.isArray(value)
    ? value.map(item => item && item.id ? item.id : item)
    : value);
  const audit = engine.auditUxE3PipeSegments(cyclic);
  const after = JSON.stringify(cyclic, (key, value) => key === 'children' && Array.isArray(value)
    ? value.map(item => item && item.id ? item.id : item)
    : value);

  assert.equal(after, before);
  assert.ok(audit.warnings.some(w => w.message.includes('循環参照')));
  assert.ok(audit.warnings.some(w => w.message.includes('子ノードがオブジェクトではありません')));
  assert.equal(audit.findings.length, 3);
});

test('UXE3 segment audit warns when a node children property is not an array', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root',
    type: 'outdoor',
    children: { id: 'not-an-array' }
  };
  const before = JSON.stringify(tree);
  const audit = engine.auditUxE3PipeSegments(tree);

  assert.equal(JSON.stringify(tree), before, 'audit must not mutate source tree');
  assert.equal(audit.summary.totalEdges, 0);
  assert.ok(audit.warnings.some(w =>
    w.type === 'danger' && w.message.includes('children が配列ではありません')
  ));
});

test('UXE3 segment audit detects a shared child object separately from a cycle', () => {
  const engine = new RefrigerantSizerEngine();
  const shared = { id: 'shared', type: 'branch', length: 3, children: [] };
  const tree = {
    type: 'outdoor', length: 0, children: [
      { id: 'branch-a', type: 'branch', length: 1, children: [shared] },
      { id: 'branch-b', type: 'branch', length: 2, children: [shared] }
    ]
  };
  const audit = engine.auditUxE3PipeSegments(tree);
  assert.ok(audit.warnings.some(w => w.message.includes('共有ノード')));
});


test('UXE3 segment declarations remain audit-only and cannot alter pipe sizing or BOM', () => {
  const engine = new RefrigerantSizerEngine();
  const makeTree = (edgeSpec) => ({
    id: 'root', type: 'outdoor', capacity: 28, length: 0, children: [{
      id: 'kit', type: 'solenoid_kit', length: 10, children: [{
        id: 'indoor', type: 'indoor', capacity: 5.6, length: 8, children: []
      }]
    }]
  });
  const plain = makeTree();
  const declared = makeTree();
  declared.children[0].edgeSpec = {
    segmentType: 'main_LM',
    capacityBasis: 'downstream_sum',
    sourceKey: 'unverified-source',
    validationState: 'verified'
  };
  const declaredSpecBefore = structuredClone(declared.children[0].edgeSpec);
  const plainResult = engine.calculateSystem(plain, 'fsv_uxe3', false);
  const declaredResult = engine.calculateSystem(declared, 'fsv_uxe3', false);

  assert.deepEqual(declaredResult.totals, plainResult.totals, 'edge metadata must not change BOM or pipe length totals');
  assert.deepEqual(declared.children[0].pipes, plain.children[0].pipes, 'edge metadata must not change selected pipe sizes');
  assert.deepEqual(declared.children[0].edgeSpec, declaredSpecBefore, 'calculation must not rewrite or promote supplied edge metadata');
  assert.equal(declaredResult.segmentAudit.findings[0].segmentType, 'main_LM');
  assert.equal(declaredResult.segmentAudit.findings[0].validationState, 'unverified',
    'a caller-provided verified flag is not manufacturer evidence');
  assert.ok(declaredResult.warnings.some(w => w.message.includes('メーカー仕様への適合確認を意味しません')));
});


test('UXE3 segment audit rejects unknown segment labels and malformed edge metadata safely', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', type: 'outdoor', capacity: 22.4, children: [
      {
        id: 'unknown-segment', type: 'branch', length: 5,
        edgeSpec: {
          segmentType: 'guess_from_topology',
          capacityBasis: 'downstream_sum',
          sourceKey: 'unverified-source',
          validationState: 'unverified'
        },
        children: []
      },
      {
        id: 'malformed-spec', type: 'solenoid_kit', length: 3,
        edgeSpec: null,
        children: []
      },
      {
        id: 'malformed-field-types', type: 'branch', length: 2,
        edgeSpec: {
          segmentType: 123,
          capacityBasis: 42,
          sourceKey: { unexpected: true },
          validationState: []
        },
        children: []
      }
    ]
  };
  const before = JSON.stringify(tree);
  const audit = engine.auditUxE3PipeSegments(tree);

  assert.equal(JSON.stringify(tree), before, 'audit must not normalize or mutate source metadata');
  assert.equal(audit.findings[0].segmentType, 'unclassified');
  assert.equal(audit.findings[0].declarationState, 'unclassified');
  assert.equal(audit.findings[0].capacityBasis, 'downstream_sum');
  assert.equal(audit.findings[1].segmentType, 'unclassified');
  assert.equal(audit.findings[1].capacityBasis, null);
  assert.equal(audit.findings[2].segmentType, 'unclassified');
  assert.equal(audit.findings[2].declarationState, 'unclassified');
  assert.equal(audit.findings[2].capacityBasis, null);
  assert.equal(audit.findings[2].sourceKey, null);
  assert.equal(audit.findings[2].validationState, 'unverified');
  assert.ok(audit.warnings.some(w => w.message.includes('未定義または不正な区間種別')));
  assert.ok(audit.warnings.some(w => w.message.includes('未定義または不正な容量基準')));
  assert.ok(audit.warnings.some(w => w.message.includes('未定義または不正な検証状態')));
  assert.ok(audit.warnings.some(w => w.message.includes('資料キーの型が不正')));
  assert.ok(audit.warnings.some(w => w.message.includes('区間未確定')));
});
