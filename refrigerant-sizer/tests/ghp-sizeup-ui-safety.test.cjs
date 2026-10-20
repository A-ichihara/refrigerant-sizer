const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const apps = [
  'aisin-ghp-refrigerant-sizer',
  'daikin-ghp-refrigerant-sizer',
  'yanmar-ghp-refrigerant-sizer',
  'panasonic-ghp-refrigerant-sizer',
];

test('GHP main-pipe size-up controls remain disabled until the sizing logic is verified', () => {
  for (const app of apps) {
    const htmlPath = path.join(root, app, 'index.html');
    const uiPath = path.join(root, app, 'js', 'ui.js');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const ui = fs.readFileSync(uiPath, 'utf8');

    const button = html.match(/<button\\b[^>]*id="btn-force-sizeup"[^>]*>/s);
    assert.ok(button, `${app}: size-up button must exist`);
    assert.match(button[0], /\\bdisabled\\b/, `${app}: size-up button must be disabled in HTML`);
    assert.match(button[0], /aria-disabled="true"/, `${app}: size-up button must expose disabled state`);
    assert.match(button[0], /停止中/, `${app}: button label must disclose the pause`);

    assert.match(ui, /forceSUpBtn\\.disabled\\s*=\\s*true/, `${app}: UI initialization must enforce disabled state`);
    assert.match(ui, /forceSUpBtn\\.setAttribute\\('aria-disabled',\\s*'true'\\)/, `${app}: UI initialization must enforce aria-disabled`);
  }
});
