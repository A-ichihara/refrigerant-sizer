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
