const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');
const RefrigerantSizerUI = require('../js/ui.js');

// UXE3 の UI 表示（長配管条件・キットグループ・室外機グループの表示）。
// (1) LM 辺の管径表示：＊2 適用時は LM 全体が増径後の径、＊3 適用時は
// 最初の 50m が増径・残りが基準径（lmSplit の分割区間どおり）。
// 適用がない場合は従来どおり基準径を表示する。
// (2) BOM 表示：バランス管 φ9.52 を表示し、レデューサーは
// 「分岐ジョイント管」ではなく「レデューサー」と表示する。
// (3) 並列電磁弁キットは「×2 並列」と表示する。
// (4) 長配管条件の適用結果は集計パネル（結果表示）に示し、警告パネル
// には追加しない。＊2 が判定不可の場合の注記も集計パネルに出し、
// 文言に「相当長」の語は使わない（実装順序3の既定：相当長が未入力の
// 場合、警告パネルの文言に相当長を含まない）。
// engine.js の挙動・合計値・警告パネルの内容は変更しない。

// outdoorKw=45（16HP）：基準3管は液 12.7／吐出 19.05／吸込 28.58。
// ＊2 の増径後（表7）：液 15.88／吐出 22.22／吸込 31.8。
// ＊3 の増径後（表7、吸込・吐出のみ）：吐出 22.22／吸込 31.8。液は増径しない。
// 上流3管の辺：室外機→b1（ℓA）、b1→b2（LA）、b2→b3（LB）、b3→キット。
// （uxe3-long-pipe-conditions.test.cjs の makeLongPipeTree と同じ形状）
function makeLongPipeTree({
  outdoorKw = 45, lALen = 5, laLen = 30, lbLen = 30, kitLen = 8, indoorLen = 3,
  lAEq, laEq, lbEq, kitEq, indoorEq
} = {}) {
  const withEq = (node, eq) => (eq === undefined ? node : { ...node, lengthEquivalent: eq });
  return withEq({
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: outdoorKw,
    length: 0,
    children: [withEq({
      id: 'lm-b1',
      name: 'Outdoor first branch',
      type: 'branch',
      length: lALen,
      children: [withEq({
        id: 'lm-b2',
        name: 'First branch',
        type: 'branch',
        length: laLen,
        children: [withEq({
          id: 'lm-b3',
          name: 'Next branch',
          type: 'branch',
          length: lbLen,
          children: [withEq({
            id: 'lm-kit',
            name: 'Kit',
            type: 'solenoid_kit',
            length: kitLen,
            children: [withEq({
              id: 'lm-indoor', name: 'Indoor', type: 'indoor', capacity: 5.6, length: indoorLen, children: []
            }, indoorEq)]
          }, kitEq)]
        }, lbEq)]
      }, laEq)]
    }, lAEq)]
  }, undefined);
}

// （uxe3-group-nodes.test.cjs の makeKitTree と同じ形状）
function makeKitTree({ outdoorKw, indoorCaps, kitLength = 10, indoorLength = 8 }) {
  return {
    id: 'root',
    name: 'Outdoor',
    type: 'outdoor',
    capacity: outdoorKw,
    children: [{
      id: 'kit',
      name: 'Kit',
      type: 'solenoid_kit',
      length: kitLength,
      children: indoorCaps.map((capacity, index) => ({
        id: `indoor-${index}`,
        name: `Indoor ${index}`,
        type: 'indoor',
        capacity,
        length: indoorLength,
        children: []
      }))
    }]
  };
}

// createNodeElement 用の最小限の DOM スタブ。カードの innerHTML を読む。
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

function makeDocumentStub() {
  return { createElement: (tag) => makeElementStub(tag) };
}

function findCardHtml(container, nodeId) {
  const stack = [container];
  while (stack.length > 0) {
    const el = stack.pop();
    if (el.attributes && el.attributes['data-id'] === nodeId) {
      return el.children[0] ? el.children[0].innerHTML : '';
    }
    for (const child of el.children) stack.push(child);
  }
  return null;
}

function makeUi(result) {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.activeSeriesId = 'fsv_uxe3';
  ui.activeNodeId = 'root';
  ui.engine = new RefrigerantSizerEngine();
  ui.sizerResult = result;
  return ui;
}

function renderTreeCards(result) {
  const ui = makeUi(result);
  const originalDocument = global.document;
  global.document = makeDocumentStub();
  try {
    return { ui, tree: ui.createNodeElement(result.tree) };
  } finally {
    global.document = originalDocument;
  }
}

test('UXE3 *2 applied shows upsized diameters on LA and LB edge cards', () => {
  const engine = new RefrigerantSizerEngine();
  // L1相当長 = 5＋40＋40＋8＋3 = 96m。LM 実長は 40m（50m 以下）。
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 20, lbLen: 20, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star2');

  const { tree } = renderTreeCards(result);
  for (const nodeId of ['lm-b2', 'lm-b3']) {
    const html = findCardHtml(tree, nodeId);
    assert.ok(html, `${nodeId} card exists`);
    assert.match(html, /液管: φ15\.88/);
    assert.match(html, /吐出ガス: φ22\.22/);
    assert.match(html, /吸入ガス: φ31\.8/);
    assert.match(html, /＊2適用/);
    // 増径後の径だけを示し、基準径は主表示に出ない。
    assert.doesNotMatch(html, /φ28\.58/);
    assert.doesNotMatch(html, /φ19\.05/);
    assert.doesNotMatch(html, /φ12\.7/);
  }
});

test('UXE3 *3 split shows first-50m upsized and remainder base on the LM edge cards', () => {
  const engine = new RefrigerantSizerEngine();
  // 相当長を入力しない。LM 実長は 60m（LA 30m＋LB 30m）で ＊3 が適用される。
  const result = engine.calculateSystem(makeLongPipeTree(), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star3');
  assert.equal(result.lmSplit.status, 'applied');

  const { tree } = renderTreeCards(result);
  // LA 30m は 0〜30m の全区間が増径。
  const laHtml = findCardHtml(tree, 'lm-b2');
  assert.match(laHtml, /LM 0m〜30m（増径）: 液φ12\.7・吐出φ22\.22・吸入φ31\.8/);
  assert.match(laHtml, /＊3適用/);
  // LB 30m は 30〜50m が増径、50〜60m が基準径。
  const lbHtml = findCardHtml(tree, 'lm-b3');
  assert.match(lbHtml, /LM 30m〜50m（増径）: 液φ12\.7・吐出φ22\.22・吸入φ31\.8/);
  assert.match(lbHtml, /LM 50m〜60m（基準径）: 液φ12\.7・吐出φ19\.05・吸入φ28\.58/);
  assert.match(lbHtml, /＊3適用/);
});

test('UXE3 no long-pipe rule leaves the LM edge display unchanged', () => {
  const engine = new RefrigerantSizerEngine();
  // LM 実長 = 25＋25 = 50m ちょうど。L1相当長 = 66m。
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 25, lbLen: 25, lAEq: 5, laEq: 25, lbEq: 25, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'none');

  const { tree } = renderTreeCards(result);
  const laHtml = findCardHtml(tree, 'lm-b2');
  assert.match(laHtml, /液管: φ12\.7/);
  assert.match(laHtml, /吐出ガス: φ19\.05/);
  assert.match(laHtml, /吸入ガス: φ28\.58/);
  assert.doesNotMatch(laHtml, /＊2適用|＊3適用/);
});

test('renderTotals shows the balance pipe and labels the reducer as レデューサー', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderTotals({
    liquidPipes: { 12.7: 73 },
    gasPipes: {},
    highGasPipes: { 19.05: 23 },
    lowGasPipes: { 28.58: 23 },
    balancePipes: { 9.52: 5 },
    joints: { 'レデューサー（異径継手・現地調達）': 1, 'CZ-P160HRV3': 2 },
    totalLength: 76
  });
  const html = ui.totalsPanel.innerHTML;
  assert.match(html, /バランス管: φ9\.52 mm/);
  assert.match(html, /5 m/);
  assert.match(html, /レデューサー<br><strong[^>]*>レデューサー（異径継手・現地調達）<\/strong>/);
  assert.doesNotMatch(html, /分岐ジョイント管<br><strong[^>]*>レデューサー/);
  assert.match(html, /電磁弁キット<br><strong[^>]*>CZ-P160HRV3<\/strong>/);
});

test('renderTotals omits the balance pipe row when there is no balance pipe', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderTotals({
    liquidPipes: { 12.7: 73 },
    gasPipes: {},
    highGasPipes: { 19.05: 23 },
    lowGasPipes: { 28.58: 23 },
    joints: {},
    totalLength: 76
  });
  assert.doesNotMatch(ui.totalsPanel.innerHTML, /バランス管/);
});

test('UXE3 parallel solenoid kit card shows ×2 並列', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeKitTree({ outdoorKw: 28.0, indoorCaps: [22.4] }), 'fsv_uxe3', false);
  assert.equal(result.tree.children[0].parallelCount, 2);

  const { tree } = renderTreeCards(result);
  const kitHtml = findCardHtml(tree, 'kit');
  assert.match(kitHtml, /電磁弁キット ×2 並列/);
  assert.match(kitHtml, /並列台数:<\/span><span class="spec-val">2台（×2 並列）<\/span>/);
});

test('UXE3 single solenoid kit card does not show a parallel count', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeKitTree({ outdoorKw: 28.0, indoorCaps: [5.6] }), 'fsv_uxe3', false);
  assert.equal(result.tree.children[0].parallelCount, 1);

  const { tree } = renderTreeCards(result);
  const kitHtml = findCardHtml(tree, 'kit');
  assert.match(kitHtml, /電磁弁キット<\/span>/);
  assert.doesNotMatch(kitHtml, /並列/);
});

test('renderLongPipeSummary shows the applied *2 rule with before/after diameters', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 20, lbLen: 20, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star2');

  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderLongPipeSummary(result);
  const html = ui.totalsPanel.innerHTML;
  assert.match(html, /長配管条件（＊2・＊3）/);
  assert.match(html, /＊2を適用しました/);
  assert.match(html, /吸込 φ28\.58→φ31\.8/);
  assert.match(html, /吐出 φ19\.05→φ22\.22/);
  assert.match(html, /液 φ12\.7→φ15\.88/);
  assert.match(html, /＊3 は適用しません/);
});

test('renderLongPipeSummary shows the applied *3 rule with the first-50m split', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree(), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star3');

  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderLongPipeSummary(result);
  const html = ui.totalsPanel.innerHTML;
  assert.match(html, /＊3を適用しました/);
  assert.match(html, /LM実長 60m が50mを超えるため/);
  assert.match(html, /最初の50mの吸込管・吐出管を1ランク増径しました/);
  assert.match(html, /吸込 φ28\.58→φ31\.8/);
  assert.match(html, /吐出 φ19\.05→φ22\.22/);
  assert.match(html, /液管は増径しません/);
  assert.doesNotMatch(html, /液 φ12\.7→φ15\.88/);
});

test('renderLongPipeSummary shows none when no long-pipe rule applies', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 25, lbLen: 25, lAEq: 5, laEq: 25, lbEq: 25, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'none');

  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderLongPipeSummary(result);
  assert.match(ui.totalsPanel.innerHTML, /＊2・＊3とも適用されませんでした/);
});

test('renderLongPipeSummary notes an undeterminable *2 without the word 相当長 and without touching warnings', () => {
  const engine = new RefrigerantSizerEngine();
  // 相当長を一切入力しない。LM 実長は 50m ちょうどで ＊3 も適用されない。
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 25, lbLen: 25
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'not_determinable');
  assert.equal(result.longPipe.star2.status, 'not_determinable');

  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderLongPipeSummary(result);
  const html = ui.totalsPanel.innerHTML;
  assert.match(html, /＊2の判定ができませんでした/);
  assert.doesNotMatch(html, /相当長/);
  // ＊2 判定不可の注記は警告パネルへ出さない。相当長が未入力の場合、
  // 警告文言に相当長の語は含まれない（実装順序3の既定）。
  assert.ok(result.warnings.every((w) => !w.message.includes('相当長')));
});

test('renderLongPipeSummary does nothing when longPipe is null', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '<div>existing</div>' };
  ui.renderLongPipeSummary({ longPipe: null });
  assert.equal(ui.totalsPanel.innerHTML, '<div>existing</div>');
});

test('renderPipeSizeTable marks LM edges with the applied long-pipe rule', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 20, lbLen: 20, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star2');

  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.activeSeriesId = 'fsv_uxe3';
  ui.engine = engine;
  ui.sizerResult = result;
  const container = { innerHTML: '' };
  const originalDocument = global.document;
  global.document = {
    getElementById: (id) => (id === 'pipesize-table-container' ? container : null)
  };
  try {
    ui.renderPipeSizeTable();
    assert.match(container.innerHTML, /\(＊2適用\)/);
  } finally {
    global.document = originalDocument;
  }
});
