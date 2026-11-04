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

// --- 長配管サマリの理由表示・＊3時の＊2未判定併記・集計0mガード（2026-11-03） ---
// ＊2 判定不可の理由は longPipe.star2.reason に応じて表示する（理由に
// よらず「長さ情報が不足」と決め打ちしない）。＊3 適用時で ＊2 が判定
// できていない場合は、結果エリアのサマリにもその旨を併記する（警告
// パネルには追加しない）。集計表示は長さ 0 の径エントリを表示しない
// （totals の中身は変更しない）。

function renderSummaryHtml(result) {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderLongPipeSummary(result);
  return ui.totalsPanel.innerHTML;
}

// 分岐が2つだけの系統（LM候補は分岐3つ必要なため特定できない）。
// 相当長は全辺入力し、L1相当長は 5＋40＋45＋5＝95m（＊2の条件自体は成立）。
function makeTwoBranchTree() {
  return {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 45, length: 0,
    children: [{
      id: 'tb-b1', name: 'Outdoor first branch', type: 'branch', length: 5, lengthEquivalent: 5,
      children: [{
        id: 'tb-b2', name: 'First branch', type: 'branch', length: 30, lengthEquivalent: 40,
        children: [{
          id: 'tb-kit', name: 'Kit', type: 'solenoid_kit', length: 8, lengthEquivalent: 45,
          children: [{
            id: 'tb-indoor', name: 'Indoor', type: 'indoor', capacity: 5.6, length: 3, lengthEquivalent: 5, children: []
          }]
        }]
      }]
    }]
  };
}

test('renderLongPipeSummary shows the missing-length reason when *2 is undeterminable for unentered lengths', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({ laLen: 25, lbLen: 25 }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'not_determinable');
  assert.match(result.longPipe.star2.reason, /未入力・非数値、または負数/);

  const html = renderSummaryHtml(result);
  assert.match(html, /＊2の判定ができませんでした/);
  assert.match(html, /L1の長さ情報が不足しているため、＊2の判定は行っていません/);
  assert.match(html, /＊3も適用されませんでした/);
  assert.doesNotMatch(html, /相当長/);
});

test('renderLongPipeSummary shows the LM-not-identifiable reason, not a length shortage, when branches are too few', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeTwoBranchTree(), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'not_determinable');
  assert.equal(result.longPipe.star2.conditionMet, true);
  assert.match(result.longPipe.star2.reason, /LM候補が特定できない/);

  const html = renderSummaryHtml(result);
  assert.match(html, /＊2の判定ができませんでした/);
  assert.match(html, /LM（主管）の経路が特定できないため、＊2の増径を集計へ反映できません/);
  // 長さ情報は不足していないので、その旨の文言は出ない。
  assert.doesNotMatch(html, /長さ情報が不足/);
  assert.doesNotMatch(html, /相当長/);
});

test('renderLongPipeSummary falls back to a neutral reason when star2.reason is missing or unexpected', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  const htmlMissing = ui.buildUxE3LongPipeSummaryHtml({
    longPipe: { appliedRule: 'not_determinable', star2: { status: 'not_determinable', reason: null } },
    lmSplit: null
  });
  assert.match(htmlMissing, /判定に必要な情報がそろっていないため、＊2の判定は行っていません/);
  assert.doesNotMatch(htmlMissing, /長さ情報が不足/);

  const htmlUnexpected = ui.buildUxE3LongPipeSummaryHtml({
    longPipe: { appliedRule: 'not_determinable', star2: { status: 'not_determinable', reason: '想定外の理由テキスト' } },
    lmSplit: null
  });
  assert.match(htmlUnexpected, /判定に必要な情報がそろっていないため/);
  assert.doesNotMatch(htmlUnexpected, /長さ情報が不足/);
});

test('renderLongPipeSummary notes the undeterminable *2 alongside an applied *3', () => {
  const engine = new RefrigerantSizerEngine();
  // 相当長未入力・LM実長 60m：＊3 が適用され、＊2 は判定不能。
  const result = engine.calculateSystem(makeLongPipeTree(), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star3');
  assert.equal(result.longPipe.star2.status, 'not_determinable');

  const html = renderSummaryHtml(result);
  assert.match(html, /＊3を適用しました/);
  assert.match(html, /＊2は判定ができていないため、適用していません/);
  // 警告パネルには従来どおり ＊3 の情報警告のみ（判定不能の注記は足さない）。
  assert.ok(result.warnings.every((w) => !w.message.includes('＊2の判定ができませんでした')));
});

test('renderLongPipeSummary does not note an undeterminable *2 when *2 was judged and *3 applied', () => {
  const engine = new RefrigerantSizerEngine();
  // L1相当長 = 5＋40＋37＋5＋3 = 90m ちょうど（＊2は判定のうえ不適用）。
  // LM実長は 60m で ＊3 が適用される。
  const result = engine.calculateSystem(makeLongPipeTree({
    lAEq: 5, laEq: 40, lbEq: 37, kitEq: 5, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star3');
  assert.equal(result.longPipe.star2.status, 'not_applied');

  const html = renderSummaryHtml(result);
  assert.match(html, /＊3を適用しました/);
  assert.doesNotMatch(html, /判定ができていない/);
});

test('renderLongPipeSummary for an applied *2 keeps the conventional wording', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 20, lbLen: 20, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star2');

  const html = renderSummaryHtml(result);
  assert.match(html, /＊2を適用しました。LM全体を1ランク増径しました/);
  assert.match(html, /＊3 は適用しません/);
  assert.doesNotMatch(html, /判定ができませんでした/);
  assert.doesNotMatch(html, /判定ができていない/);
});

test('renderTotals omits zero-length rows left in the base buckets when *2 is applied', () => {
  const engine = new RefrigerantSizerEngine();
  // ℓA 辺とキット辺の実長を 0 にすると、LM の全長が増径後の径へ移り、
  // 基準径の集計キーに値 0 が残る（totals の中身はそのまま）。
  const result = engine.calculateSystem(makeLongPipeTree({
    lALen: 0, laLen: 20, lbLen: 20, kitLen: 0,
    lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star2');
  assert.equal(result.totals.liquidPipes['12.7'], 0);
  assert.equal(result.totals.lowGasPipes['28.58'], 0);

  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderTotals(result.totals);
  const html = ui.totalsPanel.innerHTML;
  assert.doesNotMatch(html, />0 m</);
  assert.doesNotMatch(html, /液管: φ12\.7 mm/);
  assert.doesNotMatch(html, /吸入ガス管: φ28\.58 mm/);
  // 増径後の径の行は表示される。
  assert.match(html, /液管: φ15\.88 mm/);
  assert.match(html, /吸入ガス管: φ31\.8 mm/);
  assert.match(html, /吐出ガス管: φ22\.22 mm/);
});

test('renderTotals omits zero-length gas and balance rows but keeps positive rows', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.totalsPanel = { innerHTML: '' };
  ui.renderTotals({
    liquidPipes: { 12.7: 0, 15.88: 40 },
    gasPipes: { 22.22: 0, 19.05: 12 },
    highGasPipes: {},
    lowGasPipes: {},
    balancePipes: { 9.52: 0 },
    joints: {},
    totalLength: 52
  });
  const html = ui.totalsPanel.innerHTML;
  assert.doesNotMatch(html, />0 m</);
  assert.doesNotMatch(html, /液管: φ12\.7 mm/);
  assert.doesNotMatch(html, /ガス管: φ22\.22 mm/);
  assert.doesNotMatch(html, /バランス管/);
  assert.match(html, /液管: φ15\.88 mm/);
  assert.match(html, /ガス管: φ19\.05 mm/);
});

// Stage 1a 表示是正: 手動サイズアップ判定は実長ベースのため、ツールチップも実長と表示する。
test('size-up button tooltip labels the judgment length as actual length', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('最遠配管実長に関わらず、主管サイズアップを強制適用します'));
  assert.ok(!html.includes('最遠配管相当長に関わらず'));
});
// --- Stage 2: UXE3 増径強調表示（表示層のみ） ---
// 強調モード ON のときだけ、LM 辺の増径した管について基準径 → 増径後の径を
// 示す。OFF のときは従来表示と完全に同じ（上の既存テストが担保する）。
// エンジンの計算結果・合計・警告は変更しない。

function findResultNode(tree, id) {
  if (!tree) return null;
  if (tree.id === id) return tree;
  for (const child of tree.children || []) {
    const found = findResultNode(child, id);
    if (found) return found;
  }
  return null;
}

function renderCardsWithHighlight(result) {
  const ui = makeUi(result);
  ui.sizeUpHighlight = true;
  const originalDocument = global.document;
  global.document = makeDocumentStub();
  try {
    const tree = ui.createNodeElement(result.tree);
    return { ui, tree };
  } finally {
    global.document = originalDocument;
  }
}

function makeStar2Result() {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 20, lbLen: 20, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star2');
  return result;
}

function makeStar3Result() {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree(), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'star3');
  return result;
}

function makeNoneResult() {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 25, lbLen: 25, lAEq: 5, laEq: 25, lbEq: 25, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  assert.equal(result.longPipe.appliedRule, 'none');
  return result;
}

test('sizeup highlight data for *2 marks all three pipes upsized with base and final diameters', () => {
  const result = makeStar2Result();
  const ui = makeUi(result);
  ui.sizeUpHighlight = true;
  for (const nodeId of ['lm-b2', 'lm-b3']) {
    const hl = ui.getUxE3SizeUpHighlight(findResultNode(result.tree, nodeId));
    assert.ok(hl, `${nodeId} has highlight data`);
    assert.equal(hl.rule, 'star2');
    assert.deepEqual(hl.pipes.liquid, { upsized: true, base: 12.7, final: 15.88, coverage: 1 });
    assert.deepEqual(hl.pipes.dischargeGas, { upsized: true, base: 19.05, final: 22.22, coverage: 1 });
    assert.deepEqual(hl.pipes.suctionGas, { upsized: true, base: 28.58, final: 31.8, coverage: 1 });
    assert.equal(hl.anyUpsized, true);
  }
});

test('sizeup highlight data for *3 upsizes only suction/discharge and reports partial coverage on LB', () => {
  const result = makeStar3Result();
  const ui = makeUi(result);
  ui.sizeUpHighlight = true;

  const la = ui.getUxE3SizeUpHighlight(findResultNode(result.tree, 'lm-b2'));
  assert.equal(la.rule, 'star3');
  assert.equal(la.pipes.suctionGas.upsized, true);
  assert.equal(la.pipes.suctionGas.coverage, 1);
  assert.equal(la.pipes.dischargeGas.upsized, true);
  assert.equal(la.pipes.dischargeGas.coverage, 1);
  assert.equal(la.pipes.liquid.upsized, false);

  const lb = ui.getUxE3SizeUpHighlight(findResultNode(result.tree, 'lm-b3'));
  assert.equal(lb.rule, 'star3');
  // LB 30m のうち 20m（30〜50m）が増径区間。
  assert.ok(Math.abs(lb.pipes.suctionGas.coverage - 2 / 3) < 1e-9);
  assert.ok(Math.abs(lb.pipes.dischargeGas.coverage - 2 / 3) < 1e-9);
  assert.equal(lb.pipes.liquid.upsized, false);
  assert.equal(lb.pipes.suctionGas.base, 28.58);
  assert.equal(lb.pipes.suctionGas.final, 31.8);
  assert.equal(lb.pipes.dischargeGas.base, 19.05);
  assert.equal(lb.pipes.dischargeGas.final, 22.22);
});

test('sizeup highlight data is null when no long-pipe rule applies', () => {
  const result = makeNoneResult();
  const ui = makeUi(result);
  ui.sizeUpHighlight = true;
  assert.equal(ui.getUxE3SizeUpHighlight(findResultNode(result.tree, 'lm-b2')), null);
  assert.equal(ui.getUxE3SizeUpHighlight(findResultNode(result.tree, 'lm-b3')), null);
});

test('highlight off keeps the legacy *2 badge without base diameters', () => {
  const result = makeStar2Result();
  const ui = makeUi(result);
  const node = findResultNode(result.tree, 'lm-b2');
  const badge = ui.buildUxE3LmPipeBadgeHtml(ui.getUxE3LmEdgeDisplay(node), '');
  assert.match(badge, /液管: φ15\.88/);
  assert.doesNotMatch(badge, /↑増径/);
  assert.doesNotMatch(badge, /→/);
});

test('highlight on shows base → final with ↑増径 in the *2 badge', () => {
  const result = makeStar2Result();
  const { tree } = renderCardsWithHighlight(result);
  const html = findCardHtml(tree, 'lm-b2');
  assert.ok(html, 'lm-b2 card exists');
  assert.match(html, /液管: φ12\.7 → φ15\.88 ↑増径/);
  assert.match(html, /吐出ガス: φ19\.05 → φ22\.22 ↑増径/);
  assert.match(html, /吸入ガス: φ28\.58 → φ31\.8 ↑増径/);
});

test('highlight on shows per-pipe base → final in the *3 badge and leaves the standard segment row unchanged', () => {
  const result = makeStar3Result();
  const { tree } = renderCardsWithHighlight(result);
  const html = findCardHtml(tree, 'lm-b3');
  assert.ok(html, 'lm-b3 card exists');
  assert.match(html, /吐出 φ19\.05 → φ22\.22 ↑増径/);
  assert.match(html, /吸入 φ28\.58 → φ31\.8 ↑増径/);
  assert.match(html, /液 φ12\.7（増径なし）/);
  assert.match(html, /LM 50m〜60m（基準径）: 液φ12\.7・吐出φ19\.05・吸入φ28\.58/);
});

test('sizeup legend is gated by highlight mode and an applied rule and explains *2/*3', () => {
  const star3 = makeStar3Result();
  const ui = makeUi(star3);
  ui.sizeUpHighlight = true;
  assert.equal(ui.shouldShowSizeUpLegend(), true);
  ui.sizeUpHighlight = false;
  assert.equal(ui.shouldShowSizeUpLegend(), false);

  const noneUi = makeUi(makeNoneResult());
  noneUi.sizeUpHighlight = true;
  assert.equal(noneUi.shouldShowSizeUpLegend(), false);

  const html = ui.buildSizeUpLegendHtml();
  assert.match(html, /＊2/);
  assert.match(html, /＊3/);
  assert.match(html, /↑増径/);
  assert.match(html, /液管は増径なし/);
});

test('pipe size formatter shows base → final only for upsized pipes', () => {
  const ui = makeUi(makeNoneResult());
  assert.equal(
    ui.formatUxE3PipeSizeText('液管', { upsized: true, base: 9.52, final: 12.7, coverage: 1 }),
    '液管: φ9.52 → φ12.7 ↑増径'
  );
  assert.equal(
    ui.formatUxE3PipeSizeText('液管', { upsized: false, base: 9.52, final: 9.52, coverage: 0 }),
    '液管: φ9.52'
  );
});

test('highlight mode requires the flag and the UXE3 series', () => {
  const ui = makeUi(makeNoneResult());
  ui.sizeUpHighlight = true;
  assert.equal(ui.isSizeUpHighlightMode(), true);
  ui.sizeUpHighlight = false;
  assert.equal(ui.isSizeUpHighlightMode(), false);
  ui.sizeUpHighlight = true;
  ui.activeSeriesId = 'fsv_ux3';
  assert.equal(ui.isSizeUpHighlightMode(), false);
});

// ---------------------------------------------------------------------------
// 第2段階の展開：UXE3 以外のシリーズ（fsv_ux3・office_pack）の手動サイズ
// アップ帰属と増径表示。手動サイズアップは全体トグルで、2管式の全辺に
// 液・ガスとも1ランク増径がかかる（既にラダー上限の管は不変）。
// UXE3 ではエンジン側で手動が停止されるため、＊2・＊3 の帰属と競合しない。
// 帰属は表示用データであり、最終径・集計・警告は従来計算と同一であること
// をここでも固定する（変更前エンジンとの網羅比較は検証フォルダの
// stage2-expansion/compare-panasonic.cjs で実施）。
// ---------------------------------------------------------------------------

function makeUx3Tree() {
  return {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 45.0, length: 0,
    children: [{
      id: 'b1', name: 'Branch', type: 'branch', length: 10,
      children: [
        { id: 'i1', name: 'Indoor 1', type: 'indoor', capacity: 14.0, length: 8, children: [] },
        { id: 'i2', name: 'Indoor 2', type: 'indoor', capacity: 14.0, length: 6, children: [] }
      ]
    }]
  };
}

function makeUiForSeries(result, seriesId) {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.activeSeriesId = seriesId;
  ui.activeNodeId = 'root';
  ui.engine = new RefrigerantSizerEngine();
  ui.sizerResult = result;
  ui.sizeUpHighlight = true;
  return ui;
}

function renderCardsForSeries(result, seriesId) {
  const ui = makeUiForSeries(result, seriesId);
  const originalDocument = global.document;
  global.document = makeDocumentStub();
  try {
    return { ui, tree: ui.createNodeElement(result.tree) };
  } finally {
    global.document = originalDocument;
  }
}

test('manual size-up attribution is recorded only on edges whose diameters changed (fsv_ux3)', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeUx3Tree(), 'fsv_ux3', true);
  // 室外機→分岐（下流28.0kW）: 基準 液9.52／ガス25.4 → 液12.7／ガス28.58。
  const branch = findResultNode(result.tree, 'b1');
  assert.deepEqual(branch.sizeUpAttribution, {
    source: 'manual',
    pipes: {
      liquid: { base: 9.52, final: 12.7 },
      gas: { base: 25.4, final: 28.58 }
    }
  });
  // 分岐→室内機（下流14.0kW）: 基準 液9.52／ガス19.05 → 液12.7／ガス22.2。
  for (const id of ['i1', 'i2']) {
    assert.deepEqual(findResultNode(result.tree, id).sizeUpAttribution, {
      source: 'manual',
      pipes: {
        liquid: { base: 9.52, final: 12.7 },
        gas: { base: 19.05, final: 22.2 }
      }
    });
  }
  // 帰属の final は実際の最終径と一致する（帰属は表示用で径を変えない）。
  assert.equal(branch.pipes.liquid, 12.7);
  assert.equal(branch.pipes.gas, 28.58);
});

test('manual size-up OFF records no attribution on any edge', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeUx3Tree(), 'fsv_ux3', false);
  for (const id of ['b1', 'i1', 'i2']) {
    assert.equal(findResultNode(result.tree, id).sizeUpAttribution, null);
  }
});

test('manual size-up attribution is skipped on ladder-top edges and kept on changed edges', () => {
  const engine = new RefrigerantSizerEngine();
  // 室外機→分岐の下流84.0kWは基準径が既に上限（液19.05／ガス38.1）で不変。
  const tree = {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 85.0, length: 0,
    children: [{
      id: 'b1', name: 'Branch', type: 'branch', length: 12,
      children: [28.0, 28.0, 28.0].map((kw, i) => ({
        id: `i${i}`, name: `Indoor ${i}`, type: 'indoor', capacity: kw, length: 5, children: []
      }))
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_ux3', true);
  const branch = findResultNode(result.tree, 'b1');
  assert.equal(branch.sizeUpAttribution, null);
  assert.equal(branch.pipes.liquid, 19.05);
  assert.equal(branch.pipes.gas, 38.1);
  // 室内機辺（28.0kW）は変わるため帰属が付く。
  assert.deepEqual(findResultNode(result.tree, 'i0').sizeUpAttribution.pipes, {
    liquid: { base: 9.52, final: 12.7 },
    gas: { base: 25.4, final: 28.58 }
  });
});

test('manual size-up attribution also applies to office_pack', () => {
  const engine = new RefrigerantSizerEngine();
  const tree = {
    id: 'root', name: 'Outdoor', type: 'outdoor', capacity: 22.4, length: 0,
    children: [
      { id: 'i1', name: 'Indoor 1', type: 'indoor', capacity: 11.2, length: 7, children: [] },
      { id: 'i2', name: 'Indoor 2', type: 'indoor', capacity: 11.2, length: 9, children: [] }
    ]
  };
  const result = engine.calculateSystem(tree, 'office_pack', true);
  assert.deepEqual(findResultNode(result.tree, 'i1').sizeUpAttribution, {
    source: 'manual',
    pipes: {
      liquid: { base: 9.52, final: 12.7 },
      gas: { base: 19.05, final: 22.2 }
    }
  });
});

test('manual attribution never appears for UXE3 even when manual size-up is requested', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeKitTree({ outdoorKw: 45, indoorCaps: [14.0] }), 'fsv_uxe3', true);
  assert.ok(result.warnings.some((w) => w.message.includes('UXE3手動サイズアップ未適用')));
  const stack = [result.tree];
  while (stack.length > 0) {
    const node = stack.pop();
    assert.ok(!node.sizeUpAttribution, `no manual attribution on ${node.id}`);
    (node.children || []).forEach((c) => stack.push(c));
  }
});

test('attribution does not change final sizes, totals or warnings versus the plain manual calculation', () => {
  const engine = new RefrigerantSizerEngine();
  const withAttribution = engine.calculateSystem(makeUx3Tree(), 'fsv_ux3', true);
  // 従来計算の期待値：selectTwoPipeSize(kw, true) の径がそのまま最終径。
  const expectedMain = engine.selectTwoPipeSize(28.0, true);
  const branch = findResultNode(withAttribution.tree, 'b1');
  assert.equal(branch.pipes.liquid, expectedMain.liquid);
  assert.equal(branch.pipes.gas, expectedMain.gas);
  // 集計は増径後の径で従来どおり（帰属の追加で集計キーは変わらない）。
  assert.equal(withAttribution.totals.liquidPipes[12.7], 24);
  assert.equal(withAttribution.totals.gasPipes[28.58], 10);
  assert.equal(withAttribution.totals.gasPipes[22.2], 14);
  assert.equal(withAttribution.totals.totalLength, 24);
});

test('manual highlight data is built from attribution and gated by the toggle', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeUx3Tree(), 'fsv_ux3', true);
  const ui = makeUiForSeries(result, 'fsv_ux3');
  const hl = ui.getSizeUpHighlight(findResultNode(result.tree, 'b1'));
  assert.equal(hl.rule, 'manual');
  assert.deepEqual(hl.pipes.liquid, { upsized: true, base: 9.52, final: 12.7, coverage: 1 });
  assert.deepEqual(hl.pipes.gas, { upsized: true, base: 25.4, final: 28.58, coverage: 1 });
  assert.equal(hl.anyUpsized, true);
  // トグル OFF では統合ゲッターが null を返す。
  ui.sizeUpHighlight = false;
  assert.equal(ui.getSizeUpHighlight(findResultNode(result.tree, 'b1')), null);
  // 帰属のない計算（手動OFF）ではトグル ON でも null。
  const offResult = engine.calculateSystem(makeUx3Tree(), 'fsv_ux3', false);
  const offUi = makeUiForSeries(offResult, 'fsv_ux3');
  assert.equal(offUi.getSizeUpHighlight(findResultNode(offResult.tree, 'b1')), null);
});

test('manual node card shows base → final with ↑増径 only when the highlight is on', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeUx3Tree(), 'fsv_ux3', true);
  const { tree } = renderCardsForSeries(result, 'fsv_ux3');
  const html = findCardHtml(tree, 'i1');
  assert.match(html, /液管: φ9\.52 → φ12\.7 ↑増径/);
  assert.match(html, /ガス管: φ19\.05 → φ22\.2 ↑増径/);
  assert.match(html, /手動サイズアップ適用/);

  const offUi = makeUiForSeries(result, 'fsv_ux3');
  offUi.sizeUpHighlight = false;
  const originalDocument = global.document;
  global.document = makeDocumentStub();
  try {
    const offTree = offUi.createNodeElement(result.tree);
    const offHtml = findCardHtml(offTree, 'i1');
    assert.match(offHtml, /液管: φ12\.7/);
    assert.doesNotMatch(offHtml, /↑増径/);
  } finally {
    global.document = originalDocument;
  }
});

test('manual legend is shown only with attribution and explains the manual rule, not *2/*3', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeUx3Tree(), 'fsv_ux3', true);
  const ui = makeUiForSeries(result, 'fsv_ux3');
  assert.equal(ui.shouldShowSizeUpLegend(), true);
  const html = ui.buildSizeUpLegendHtml();
  assert.match(html, /手動サイズアップ/);
  assert.doesNotMatch(html, /＊2/);
  assert.doesNotMatch(html, /＊3/);

  const offResult = engine.calculateSystem(makeUx3Tree(), 'fsv_ux3', false);
  const offUi = makeUiForSeries(offResult, 'fsv_ux3');
  assert.equal(offUi.shouldShowSizeUpLegend(), false);
});

test('UXE3 highlight behavior is unchanged by the manual expansion', () => {
  const result = makeStar2Result();
  const ui = makeUi(result);
  ui.sizeUpHighlight = true;
  const hl = ui.getSizeUpHighlight(findResultNode(result.tree, 'lm-b2'));
  assert.equal(hl.rule, 'star2');
  assert.deepEqual(hl.pipes.liquid, { upsized: true, base: 12.7, final: 15.88, coverage: 1 });
  assert.equal(ui.shouldShowSizeUpLegend(), true);
  assert.match(ui.buildSizeUpLegendHtml(), /＊2/);
});
