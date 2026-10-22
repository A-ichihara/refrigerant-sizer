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
      className: ''
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
    assert.match(list.children[1].textContent, /宣言あり・未検証/);
  } finally {
    global.document = originalDocument;
  }
});
