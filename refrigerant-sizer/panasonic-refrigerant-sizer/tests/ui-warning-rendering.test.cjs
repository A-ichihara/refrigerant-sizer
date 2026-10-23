const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerUI = require('../js/ui.js');

test('renderWarnings escapes HTML from imported warning messages', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.warningPanel = {
    innerHTML: '',
    querySelectorAll: () => []
  };

  const hostileMessage = '<img src=x onerror="alert(1)"> & \'quoted\'';
  ui.renderWarnings([{ type: 'danger', message: hostileMessage }]);

  assert.match(ui.warningPanel.innerHTML, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(ui.warningPanel.innerHTML, /&amp; &#39;quoted&#39;/);
  assert.doesNotMatch(ui.warningPanel.innerHTML, /<img src=x/);
});

test('renderWarnings handles circular warning objects without throwing', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.warningPanel = {
    innerHTML: '',
    querySelectorAll: () => []
  };
  const circularWarning = { type: 'danger' };
  circularWarning.self = circularWarning;

  assert.doesNotThrow(() => ui.renderWarnings([circularWarning]));
  assert.match(ui.warningPanel.innerHTML, /表示できない警告データ/);
});


test('renderSegmentAuditSummary prepends UXE3 classification counts without rewriting warnings', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  const existing = { marker: 'existing warning' };
  const inserted = [];
  const panel = {
    prepend: node => inserted.push(node)
  };
  ui.warningPanel = panel;
  const originalDocument = global.document;
  global.document = {
    createElement: tag => ({
      tagName: tag,
      children: [],
      appendChild(child) { this.children.push(child); },
      textContent: '',
      className: ''
    })
  };
  try {
    ui.renderSegmentAuditSummary({
      seriesId: 'fsv_uxe3',
      summary: { totalEdges: 5, unclassified: 3, declared: 2 }
    });
    assert.equal(inserted.length, 1);
    const [card] = inserted;
    assert.equal(card.className, 'alert-card warning');
    assert.match(card.children[0].children[0].textContent, /未検証/);
    assert.match(card.children[0].children[1].textContent, /接続区間 5件／未分類 3件／区間宣言あり 2件/);
    assert.match(card.children[0].children[1].textContent, /照合は未完了/);
    assert.equal(existing.marker, 'existing warning');
  } finally {
    global.document = originalDocument;
  }
});

test('renderSegmentAuditSummary ignores absent or invalid summary safely', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  let calls = 0;
  ui.warningPanel = { prepend: () => { calls++; } };
  assert.doesNotThrow(() => {
    ui.renderSegmentAuditSummary(null);
    ui.renderSegmentAuditSummary({ seriesId: 'fsv_ux3', summary: { totalEdges: 1, unclassified: 1, declared: 0 } });
    ui.renderSegmentAuditSummary({ seriesId: 'fsv_uxe3', summary: { totalEdges: '1', unclassified: 1, declared: 0 } });
    ui.renderSegmentAuditSummary({ seriesId: 'fsv_uxe3' });
  });
  assert.equal(calls, 0);
});


test('renderSegmentAuditSummary lists individual edges as text without HTML injection', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  const inserted = [];
  ui.warningPanel = {
    prepend: node => inserted.push(node),
    appendChild: node => inserted.push(node)
  };
  const originalDocument = global.document;
  global.document = {
    createElement: tag => ({
      tagName: tag,
      children: [],
      appendChild(child) { this.children.push(child); },
      textContent: '',
      className: '',
      style: {}
    })
  };
  try {
    ui.renderSegmentAuditSummary({
      seriesId: 'fsv_uxe3',
      summary: { totalEdges: 2, unclassified: 1, declared: 1 },
      findings: [
        { path: '<img src=x onerror=alert(1)>', segmentType: 'unclassified', declarationState: 'unclassified' },
        { path: 'root/main', segmentType: 'main_LM', declarationState: 'declared_unverified' }
      ]
    });
    assert.equal(inserted.length, 2);
    const details = inserted[1];
    assert.equal(details.tagName, 'details');
    const list = details.children[1];
    assert.equal(list.children.length, 2);
    assert.match(list.children[0].textContent, /<img src=x onerror=alert\(1\)>/);
    assert.match(list.children[0].textContent, /未分類/);
    assert.match(list.children[0].textContent, /配管長要確認/);
    assert.equal(list.children[0].style.fontWeight, '600');
    assert.match(list.children[1].textContent, /宣言あり・未検証/);
  } finally {
    global.document = originalDocument;
  }
});


test('UXE3 segment selector stores audit-only declaration and resets verified flag', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.activeSeriesId = 'fsv_uxe3';
  let updates = 0;
  ui.update = () => { updates++; };
  const node = { type: 'branch', edgeSpec: { segmentType: 'main_LM', capacityBasis: 'outdoor_total', sourceKey: 'original', validationState: 'verified' } };
  const handlers = {};
  const originalDocument = global.document;
  global.document = {
    getElementById: id => id === 'edit-uxe3-segment'
      ? { addEventListener: (event, handler) => { handlers[event] = handler; } }
      : null
  };
  try {
    ui.bindEditorEvents(node);
    assert.equal(typeof handlers.change, 'function');
    handlers.change({ target: { value: 'branch_main_LC_LH' } });
    assert.equal(node.edgeSpec.segmentType, 'branch_main_LC_LH');
    assert.equal(node.edgeSpec.validationState, 'unverified');
    assert.equal(node.edgeSpec.capacityBasis, 'not_resolved', 'changing segment must not retain a potentially stale capacity basis');
    assert.equal(node.edgeSpec.sourceKey, 'original');
    assert.equal(updates, 1);
    assert.equal(JSON.parse(JSON.stringify(node)).edgeSpec.segmentType, 'branch_main_LC_LH');
    handlers.change({ target: { value: 'unknown-manufacturer-segment' } });
    assert.equal(node.edgeSpec.segmentType, 'branch_main_LC_LH');
    assert.equal(updates, 1);
  } finally {
    global.document = originalDocument;
  }
});

test('UXE3 segment selector is inert for other series and outdoor nodes', () => {
  const originalDocument = global.document;
  for (const [series, type] of [['fsv_ux3', 'branch'], ['fsv_uxe3', 'outdoor']]) {
    const ui = Object.create(RefrigerantSizerUI.prototype);
    ui.activeSeriesId = series;
    let updates = 0;
    let registered = false;
    ui.update = () => { updates++; };
    const node = { type };
    global.document = {
      getElementById: id => id === 'edit-uxe3-segment'
        ? { addEventListener: () => { registered = true; } }
        : null
    };
    try {
      ui.bindEditorEvents(node);
      assert.equal(registered, false, `${series}/${type} must not bind selector`);
      assert.equal(updates, 0);
      assert.equal(Object.hasOwn(node, 'edgeSpec'), false);
    } finally {
      global.document = originalDocument;
    }
  }
});

test('UXE3 tree repair preserves edgeSpec declarations on existing nodes', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.activeSeriesId = 'fsv_uxe3';
  ui.engine = {
    SERIES_DATABASE: {
      fsv_uxe3: { outdoorCapacities: [{ kw: 50 }] }
    }
  };
  const edgeSpec = {
    version: 1,
    segmentType: 'branch_main_LC_LH',
    capacityBasis: 'not_resolved',
    sourceKey: 'panasonic-manual-pending-review',
    validationState: 'unverified'
  };
  const tree = {
    id: 'root',
    type: 'outdoor',
    capacity: 50,
    children: [{
      id: 'branch-1',
      type: 'branch',
      edgeSpec,
      children: []
    }]
  };

  ui.validateAndRepairTreeForSeries(tree);

  assert.deepEqual(tree.children[0].edgeSpec, edgeSpec);
  assert.equal(tree.children[0].edgeSpec.validationState, 'unverified');
});


test('UXE3 segment selector preserves validation metadata when selection is unchanged', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  ui.activeSeriesId = 'fsv_uxe3';
  let updates = 0;
  ui.update = () => { updates++; };
  const node = {
    type: 'branch',
    edgeSpec: {
      segmentType: 'main_LM',
      capacityBasis: 'outdoor_total',
      sourceKey: 'reviewed-source',
      validationState: 'verified'
    }
  };
  let handler;
  const originalDocument = global.document;
  global.document = {
    getElementById: id => id === 'edit-uxe3-segment'
      ? { addEventListener: (event, callback) => { if (event === 'change') handler = callback; } }
      : null
  };
  try {
    ui.bindEditorEvents(node);
    handler({ target: { value: 'main_LM' } });
    assert.equal(node.edgeSpec.segmentType, 'main_LM');
    assert.equal(node.edgeSpec.capacityBasis, 'outdoor_total');
    assert.equal(node.edgeSpec.validationState, 'verified');
    assert.equal(node.edgeSpec.sourceKey, 'reviewed-source');
    assert.equal(updates, 1);
  } finally {
    global.document = originalDocument;
  }
});

test('UXE3 segment selector renders unknown and malformed saved labels as unclassified', () => {
  const originalDocument = global.document;
  const makeUi = edgeSpec => {
    const ui = Object.create(RefrigerantSizerUI.prototype);
    ui.activeSeriesId = 'fsv_uxe3';
    ui.activeNodeId = 'branch-1';
    ui.systemTree = {
      id: 'root', type: 'outdoor', capacity: 50, children: [{
        id: 'branch-1', type: 'branch', name: 'Branch', length: 5,
        modelNumber: 'TEST', edgeSpec, children: []
      }]
    };
    ui.engine = { SERIES_DATABASE: { fsv_uxe3: { outdoorCapacities: [] } } };
    ui.propPanel = { innerHTML: '' };
    ui.bindEditorEvents = () => {};
    return ui;
  };
  try {
    for (const edgeSpec of [
      { segmentType: 'unknown-manufacturer-segment' },
      { segmentType: 123 },
      null,
      []
    ]) {
      const ui = makeUi(edgeSpec);
      ui.renderPropertyEditor();
      assert.match(ui.propPanel.innerHTML, /<option value="unclassified" selected>未分類（指定なし）<\/option>/);
      assert.doesNotMatch(ui.propPanel.innerHTML, /<option value="unknown-manufacturer-segment" selected>/);
    }
  } finally {
    global.document = originalDocument;
  }
});

test('UXE3 audit list prioritizes pipe-length review without mutating findings', () => {
  const ui = Object.create(RefrigerantSizerUI.prototype);
  const nodes = [];
  ui.warningPanel = {
    prepend: node => nodes.push(node),
    appendChild: node => nodes.push(node)
  };
  const originalDocument = global.document;
  global.document = {
    createElement: tag => ({
      tagName: tag, children: [], textContent: '', className: '', style: {},
      appendChild(child) { this.children.push(child); }
    })
  };
  const findings = [
    { path: 'root/valid', segmentType: 'main_LM', declarationState: 'declared_unverified', lengthM: 5, lengthState: 'valid_nonnegative' },
    { path: 'root/missing', segmentType: 'unclassified', declarationState: 'unclassified', lengthM: null, lengthState: 'missing_or_nonfinite' },
    { path: 'root/negative', segmentType: 'unclassified', declarationState: 'unclassified', lengthM: -2, lengthState: 'invalid_negative' }
  ];
  const original = structuredClone(findings);
  try {
    ui.renderSegmentAuditSummary({
      seriesId: 'fsv_uxe3',
      summary: { totalEdges: 3, unclassified: 2, declared: 1 },
      findings
    });
    const rows = nodes[1].children[1].children;
    assert.match(rows[0].textContent, /root\/missing/);
    assert.match(rows[1].textContent, /root\/negative/);
    assert.match(rows[2].textContent, /root\/valid/);
    assert.match(rows[0].textContent, /配管長要確認/);
    assert.match(rows[1].textContent, /配管長要確認/);
    assert.doesNotMatch(rows[2].textContent, /配管長要確認/);
    assert.deepEqual(findings, original);
  } finally {
    global.document = originalDocument;
  }
});
