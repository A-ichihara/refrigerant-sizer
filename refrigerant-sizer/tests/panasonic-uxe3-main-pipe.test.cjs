const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../panasonic-refrigerant-sizer/js/engine.js');

// Panasonic official UXE-series 2014 main-pipe table.
// These assertions cover individual 8–16 HP classes only; 18–20 HP combination
// equipment is intentionally not inferred from this test.
test('UXE3 8–16 HP three-pipe main sizes match the official table', () => {
    const engine = new RefrigerantSizerEngine();
    const cases = [
        { kw: 22.4, expected: { liquid: 9.52, dischargeGas: 15.88, suctionGas: 19.05 } },
        { kw: 28.0, expected: { liquid: 9.52, dischargeGas: 19.05, suctionGas: 22.2 } },
        { kw: 33.5, expected: { liquid: 12.7, dischargeGas: 19.05, suctionGas: 25.4 } },
        { kw: 40.0, expected: { liquid: 12.7, dischargeGas: 22.2, suctionGas: 25.4 } },
        { kw: 45.0, expected: { liquid: 12.7, dischargeGas: 22.2, suctionGas: 28.58 } },
    ];

    for (const { kw, expected } of cases) {
        assert.deepEqual(engine.selectThreePipeSize(kw), expected, `UXE3 ${kw} kW`);
    }
});
