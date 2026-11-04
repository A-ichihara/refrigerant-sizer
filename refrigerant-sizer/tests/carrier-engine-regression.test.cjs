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

test('Carrier calculateSystem always shows the unverified-model warning (GHP-style)', () => {
const result = makeEngine().calculateSystem(makeFsTree(), 'super_multi_u_r');
assert.equal(
result.warnings.some(w => w.message.includes('')),
true
);
assert.equal(
result.warnings.some(w => w.message.includes('確定設計値として使用せず')),
true
);
});

test('Carrier master-table modal no longer claims full compliance', () => {
const html = fs.readFileSync(
path.join(__dirname, '..', 'carrier-refrigerant-sizer', 'index.html'),
'utf8'
);
assert.equal(html.includes('完全準拠'), false);
assert.equal(html.includes(''), true);
});

// Stage 1a 表示是正: サイズアップ判定は実長ベースのため、ツールチップも実長と表示する。
test('Carrier size-up tooltip labels the judgment length as actual length', () => {
const html = fs.readFileSync(
path.join(__dirname, '..', 'carrier-refrigerant-sizer', 'index.html'),
'utf8'
);
assert.equal(html.includes('最遠配管実長に関わらず、主管サイズアップを強制適用します'), true);
assert.equal(html.includes('最遠配管相当長に関わらず'), false);
});

// ---------------------------------------------------------------------------
// Stage 2 展開: 手動サイズアップの帰属記録と増径強調表示。
// 帰属は表示専用の追加データであり、最終径・集計・警告は従来と同一でなければならない。
// ---------------------------------------------------------------------------

function makeUIClass() {
  const file = path.join(__dirname, '..', 'carrier-refrigerant-sizer', 'js', 'ui.js');
  const source = fs.readFileSync(file, 'utf8');
  // ui.js は vm 内で評価されるため、document スタブも同じコンテキストに渡す。
  const context = vm.createContext({
    module: { exports: {} },
    console,
    document: { createElement: (tag) => makeElementStub(tag) }
  });
  vm.runInContext(source, context, { filename: file });
  return context.module.exports;
}

// vm コンテキストで生成されたオブジェクトは prototype が異なるため、
// deepEqual の前に JSON 経由で同一レルムへ正規化する。
function plain(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function makeYDefaultTree() {
  return {
    id: 'root', type: 'outdoor', capacity: 28.0, length: 0, children: [{
      id: 'branch_1', type: 'branch', length: 15, children: [
        { id: 'indoor_1', type: 'indoor', capacity: 5.6, length: 8, children: [] },
        { id: 'indoor_2', type: 'indoor', capacity: 2.8, length: 12, children: [] }
      ]
    }]
  };
}

function findById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

function walkNodes(node, fn) {
  fn(node);
  (node.children || []).forEach(c => walkNodes(c, fn));
}

test('Carrier manual size-up records attribution only where the diameter actually changed (2-pipe)', () => {
  const result = makeEngine().calculateSystem(makeYDefaultTree(), 'super_multi_u_y', true);

  const branch = findById(result.tree, 'branch_1');
  assert.deepEqual(plain(branch.pipes), { type: '2pipe', liquid: 12.7, gas: 19.1 });
  assert.deepEqual(plain(branch.sizeUp), {
    reason: 'manual',
    pipes: {
      liquid: { base: 9.5, final: 12.7 },
      gas: { base: 15.9, final: 19.1 }
    }
  });

  const indoor = findById(result.tree, 'indoor_1');
  assert.deepEqual(plain(indoor.pipes), { type: '2pipe', liquid: 9.5, gas: 15.9 });
  assert.deepEqual(plain(indoor.sizeUp), {
    reason: 'manual',
    pipes: {
      liquid: { base: 6.4, final: 9.5 },
      gas: { base: 12.7, final: 15.9 }
    }
  });
});

test('Carrier manual size-up OFF leaves no attribution on any edge', () => {
  const result = makeEngine().calculateSystem(makeYDefaultTree(), 'super_multi_u_y', false);
  walkNodes(result.tree, (node) => {
    if (node.type !== 'outdoor') assert.equal(node.sizeUp, null);
  });
});

test('Carrier 3-pipe upstream edges attribute only the liquid pipe (discharge/suction never size up)', () => {
  const result = makeEngine().calculateSystem(makeFsTree(), 'super_multi_u_r', true);

  const branch = findById(result.tree, 'branch');
  assert.deepEqual(plain(branch.pipes), { type: '3pipe', liquid: 19.1, highGas: 22.2, lowGas: 28.6 });
  assert.deepEqual(plain(branch.sizeUp), {
    reason: 'manual',
    pipes: { liquid: { base: 15.9, final: 19.1 } }
  });

  const fs = findById(result.tree, 'fs');
  assert.deepEqual(plain(fs.sizeUp), {
    reason: 'manual',
    pipes: { liquid: { base: 15.9, final: 19.1 } }
  });

  const indoor = findById(result.tree, 'indoor');
  assert.deepEqual(plain(indoor.pipes), { type: '2pipe', liquid: 12.7, gas: 25.4 });
  assert.deepEqual(plain(indoor.sizeUp), {
    reason: 'manual',
    pipes: {
      liquid: { base: 9.5, final: 12.7 },
      gas: { base: 22.2, final: 25.4 }
    }
  });
});

test('Carrier attribution helper leaves pipes at the top of the size list unattributed', () => {
  const engine = makeEngine();

  const toppedOut = { pipes: { type: '2pipe', liquid: 25.4, gas: 41.3 } };
  engine.applySizeUpAttribution(toppedOut, true, () => ({ liquid: 25.4, gas: 41.3 }));
  assert.equal(toppedOut.sizeUp, null);

  const mixed = { pipes: { type: '2pipe', liquid: 25.4, gas: 41.3 } };
  engine.applySizeUpAttribution(mixed, true, () => ({ liquid: 25.4, gas: 38.1 }));
  assert.deepEqual(plain(mixed.sizeUp), {
    reason: 'manual',
    pipes: { gas: { base: 38.1, final: 41.3 } }
  });

  const manualOff = { pipes: { type: '2pipe', liquid: 9.5, gas: 15.9 } };
  engine.applySizeUpAttribution(manualOff, false, () => ({ liquid: 6.4, gas: 12.7 }));
  assert.equal(manualOff.sizeUp, null);
});

test('Carrier re-calculation with manual size-up turned off clears stale attribution', () => {
  const engine = makeEngine();
  const first = engine.calculateSystem(makeYDefaultTree(), 'super_multi_u_y', true);
  assert.ok(findById(first.tree, 'branch_1').sizeUp);
  const second = engine.calculateSystem(first.tree, 'super_multi_u_y', false);
  walkNodes(second.tree, (node) => {
    if (node.type !== 'outdoor') assert.equal(node.sizeUp, null);
  });
});

test('Carrier attribution does not change final sizes, totals, or warnings', () => {
  const engine = makeEngine();
  const on = engine.calculateSystem(makeYDefaultTree(), 'super_multi_u_y', true);
  const off = engine.calculateSystem(makeYDefaultTree(), 'super_multi_u_y', false);

  // 最終径・集計は手動サイズアップ適用後の従来値そのもの（帰属追加で変わらない）。
  assert.deepEqual(plain(on.totals.liquidPipes), { '12.7': 15, '9.5': 20 });
  assert.deepEqual(plain(on.totals.gasPipes), { '19.1': 15, '15.9': 20 });
  assert.equal(on.totals.totalLength, 35);
  assert.equal(findById(on.tree, 'branch_1').pipeSizeText, '液管: φ12.7 / ガス管: φ19.1');
  // 警告は ON/OFF で同一（帰属の有無でも変わらない）。
  assert.deepEqual(plain(on.warnings), plain(off.warnings));
});

// --- UI（増径強調表示） -----------------------------------------------------

function makeCarrierUi(result, highlight) {
  const UIClass = makeUIClass();
  const ui = Object.create(UIClass.prototype);
  ui.engine = makeEngine();
  ui.activeSeriesId = 'super_multi_u_y';
  ui.activeNodeId = 'root';
  ui.sizeUpHighlight = highlight;
  ui.sizerResult = result;
  return ui;
}

function makeElementStub(tag) {
  return {
    tagName: tag,
    children: [],
    attributes: {},
    className: '',
    innerHTML: '',
    textContent: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    querySelector() { return null; }
  };
}

function renderCardHtml(ui, node) {
  const container = ui.createNodeElement(node);
  return container.children[0] ? container.children[0].innerHTML : '';
}

test('Carrier size-up highlight data is built only from engine attribution', () => {
  const engine = makeEngine();
  const on = engine.calculateSystem(makeYDefaultTree(), 'super_multi_u_y', true);
  const ui = makeCarrierUi(on, true);

  const hl = ui.getCarrierSizeUpHighlight(findById(on.tree, 'branch_1'));
  assert.equal(hl.reason, 'manual');
  assert.deepEqual(plain(hl.pipes.liquid), { upsized: true, base: 9.5, final: 12.7 });
  assert.deepEqual(plain(hl.pipes.gas), { upsized: true, base: 15.9, final: 19.1 });
  assert.equal(hl.anyUpsized, true);

  const off = engine.calculateSystem(makeYDefaultTree(), 'super_multi_u_y', false);
  assert.equal(ui.getCarrierSizeUpHighlight(findById(off.tree, 'branch_1')), null);
});

test('Carrier 3-pipe highlight data marks discharge/suction as not upsized', () => {
  const engine = makeEngine();
  const on = engine.calculateSystem(makeFsTree(), 'super_multi_u_r', true);
  const ui = makeCarrierUi(on, true);
  ui.activeSeriesId = 'super_multi_u_r';

  const hl = ui.getCarrierSizeUpHighlight(findById(on.tree, 'branch'));
  assert.deepEqual(plain(hl.pipes.liquid), { upsized: true, base: 15.9, final: 19.1 });
  assert.deepEqual(plain(hl.pipes.highGas), { upsized: false, base: 22.2, final: 22.2 });
  assert.deepEqual(plain(hl.pipes.lowGas), { upsized: false, base: 28.6, final: 28.6 });
});

test('Carrier node card shows base -> final only when highlight mode is on', () => {
  const engine = makeEngine();
  const on = engine.calculateSystem(makeYDefaultTree(), 'super_multi_u_y', true);
  const indoor = findById(on.tree, 'indoor_1');

  const htmlOn = renderCardHtml(makeCarrierUi(on, true), indoor);
  assert.ok(htmlOn.includes('sizeup-badge-row'));
  assert.ok(htmlOn.includes('液管: φ6.4 → φ9.5 ↑増径'));
  assert.ok(htmlOn.includes('ガス管: φ12.7 → φ15.9 ↑増径'));
  assert.ok(htmlOn.includes('手動サイズアップによる増径'));

  const htmlOff = renderCardHtml(makeCarrierUi(on, false), indoor);
  assert.ok(!htmlOff.includes('sizeup-badge-row'));
  assert.ok(!htmlOff.includes('↑増径'));
  assert.ok(htmlOff.includes('液管: φ9.5'));
  assert.ok(htmlOff.includes('ガス管: φ15.9'));
});

test('Carrier pipe size formatter shows base -> final only for upsized pipes', () => {
  const ui = makeCarrierUi(null, true);
  assert.equal(
    ui.formatCarrierPipeSizeText('液管', { upsized: true, base: 9.5, final: 12.7 }),
    '液管: φ9.5 → φ12.7 ↑増径'
  );
  assert.equal(
    ui.formatCarrierPipeSizeText('液管', { upsized: false, base: 12.7, final: 12.7 }),
    '液管: φ12.7'
  );
});

test('Carrier size-up legend is gated by highlight mode and attribution presence', () => {
  const engine = makeEngine();
  const on = engine.calculateSystem(makeYDefaultTree(), 'super_multi_u_y', true);
  const off = engine.calculateSystem(makeYDefaultTree(), 'super_multi_u_y', false);

  assert.equal(makeCarrierUi(on, true).shouldShowSizeUpLegend(), true);
  assert.equal(makeCarrierUi(on, false).shouldShowSizeUpLegend(), false);
  assert.equal(makeCarrierUi(off, true).shouldShowSizeUpLegend(), false);

  const html = makeCarrierUi(on, true).buildSizeUpLegendHtml();
  assert.ok(html.includes('手動サイズアップ'));
  assert.ok(html.includes('メーカー公式資料で確認済みの増径条件を示すものではありません'));
  assert.ok(!html.includes('完全準拠'));
});

test('Carrier index.html exposes the size-up highlight toggle button', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'carrier-refrigerant-sizer', 'index.html'),
    'utf8'
  );
  assert.ok(html.includes('id="btn-sizeup-highlight"'));
  assert.ok(html.includes('増径強調'));
});
