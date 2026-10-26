const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// 優先度C・実装順序6：長配管条件（表1 脚注＊2・＊3）。
// ＊2：L1相当長が 90m を超える場合、主管 LM の吸込・吐出・液管を表7の
// ラダーで1ランク増径する（LM 全体の一律増径、分割なし）。判定は相当長
// 基準のみで行い、L1の相当長が判定できない場合は判定不可とし、実長で
// 代用しない。＊3：＊2 が適用されない場合に LM 実長が 50m を超えるとき、
// 最初の 50m の吸込・吐出管を1ランク増径する（実装順序4の分割）。
// ＊2 と ＊3 は排他的であり、＊2 が適用される場合は ＊3 を適用しない。
// 適用された規則は longPipe に記録し、警告パネルへ明記する。
// GAS_SIZES / LIQUID_SIZES は変更しない。手動サイズアップの停止も維持する。

const REDUCER_KEY = 'レデューサー（異径継手・現地調達）';

// outdoorKw=45（16HP）：基準3管は液 12.7／吐出 19.05／吸込 28.58。
// ＊2 の増径後（表7）：液 15.88／吐出 22.22／吸込 31.8。
// ＊3 の増径後（表7、吸込・吐出のみ）：吐出 22.22／吸込 31.8。液は増径しない。
// 上流3管の辺：室外機→b1（ℓA）、b1→b2（LA）、b2→b3（LB）、b3→キット。
// 下流2管の辺：キット→室内機（5.6kW → 液 6.35／ガス 12.7）。
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

test('UXE3 L1 equivalent exactly 90m does not trigger *2 (strictly greater required)', () => {
  const engine = new RefrigerantSizerEngine();
  // L1相当長 = 5＋40＋35＋7＋3 = 90m ちょうど。LM 実長は 60m。
  const result = engine.calculateSystem(makeLongPipeTree({
    lAEq: 5, laEq: 40, lbEq: 35, kitEq: 7, indoorEq: 3
  }), 'fsv_uxe3', false);
  const longPipe = result.longPipe;

  assert.ok(longPipe);
  assert.equal(longPipe.l1EquivalentM, 90);
  assert.deepEqual(longPipe.thresholdM, { star2: 90, star3: 50 });
  assert.equal(longPipe.star2.status, 'not_applied');
  assert.equal(longPipe.star2.conditionMet, false);
  assert.equal(longPipe.star2.l1EquivalentM, 90);
  // ＊2 は適用されず、LM＞50m のため ＊3 が適用される。
  assert.equal(longPipe.appliedRule, 'star3');
  assert.equal(longPipe.star3.status, 'applied');
  assert.equal(result.lmSplit.status, 'applied');
  assert.equal(result.totals.lowGasPipes[31.8], 50);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 8 + 10);
  assert.equal(result.totals.highGasPipes[22.22], 50);
  assert.equal(result.totals.highGasPipes[19.05], 5 + 8 + 10);
  assert.equal(result.totals.liquidPipes[12.7], 5 + 30 + 30 + 8);
  assert.equal(result.totals.joints[REDUCER_KEY], 1);
  assert.ok(result.warnings.some((w) => w.type === 'info' && w.message.includes('＊3適用')));
  assert.ok(result.warnings.every((w) => !w.message.includes('＊2適用')));
});

test('UXE3 L1 equivalent over 90m applies *2 to all three LM pipes uniformly', () => {
  const engine = new RefrigerantSizerEngine();
  // L1相当長 = 5＋40＋40＋8＋3 = 96m。LM 実長は 40m（50m 以下）。
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 20, lbLen: 20, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  const longPipe = result.longPipe;

  assert.ok(longPipe);
  assert.equal(longPipe.l1EquivalentM, 96);
  assert.equal(longPipe.star2.status, 'applied');
  assert.equal(longPipe.star2.conditionMet, true);
  assert.equal(longPipe.star2.applied, true);
  assert.deepEqual(longPipe.star2.baseDiameters, { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 });
  assert.deepEqual(longPipe.star2.upsizedDiameters, { liquid: 15.88, dischargeGas: 22.22, suctionGas: 31.8 });
  assert.equal(longPipe.appliedRule, 'star2');
  assert.equal(longPipe.star3.status, 'not_applied');
  // ＊3 は分割しない（LM が 50m 以下でもある）。
  assert.equal(result.lmSplit.status, 'not_applied');
  assert.deepEqual(result.lmSplit.edges, []);

  // BOM：LM 全長 40m が3管とも増径後の径へ。LM 外の辺は基準径のまま。
  assert.equal(result.totals.lowGasPipes[31.8], 40);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 8);
  assert.equal(result.totals.highGasPipes[22.22], 40);
  assert.equal(result.totals.highGasPipes[19.05], 5 + 8);
  assert.equal(result.totals.liquidPipes[15.88], 40);
  assert.equal(result.totals.liquidPipes[12.7], 5 + 8);
  assert.equal(result.totals.liquidPipes[6.35], 3);
  assert.equal(result.totals.joints[REDUCER_KEY], undefined);
  assert.equal(result.totals.totalLength, 5 + 20 + 20 + 8 + 3);
  assert.ok(result.warnings.some((w) => w.type === 'info' && w.message.includes('＊2適用')));
  assert.ok(result.warnings.some((w) => w.message.includes('＊3 は適用しません')));
});

test('UXE3 LM exactly 50m applies neither *2 nor *3', () => {
  const engine = new RefrigerantSizerEngine();
  // LM 実長 = 25＋25 = 50m ちょうど。L1相当長 = 5＋25＋25＋8＋3 = 66m。
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 25, lbLen: 25, lAEq: 5, laEq: 25, lbEq: 25, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  const longPipe = result.longPipe;

  assert.equal(longPipe.star2.status, 'not_applied');
  assert.equal(longPipe.star2.l1EquivalentM, 66);
  assert.equal(longPipe.appliedRule, 'none');
  assert.equal(result.lmSplit.status, 'not_applied');
  assert.equal(result.lmSplit.lmLengthActualM, 50);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 25 + 25 + 8);
  assert.equal(result.totals.highGasPipes[19.05], 5 + 25 + 25 + 8);
  assert.equal(result.totals.liquidPipes[12.7], 5 + 25 + 25 + 8);
  assert.equal(result.totals.joints[REDUCER_KEY], undefined);
  assert.ok(result.warnings.every((w) => !w.message.includes('＊2適用') && !w.message.includes('＊3適用')));
});

test('UXE3 LM 50m plus epsilon applies *3 split and leaves liquid unchanged', () => {
  const engine = new RefrigerantSizerEngine();
  // LM 実長 = 25.5＋25 = 50.5m。L1相当長 = 5＋25.5＋25＋8＋3 = 66.5m。
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 25.5, lbLen: 25, lAEq: 5, laEq: 25.5, lbEq: 25, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  const longPipe = result.longPipe;

  assert.equal(longPipe.star2.status, 'not_applied');
  assert.equal(longPipe.appliedRule, 'star3');
  assert.equal(result.lmSplit.status, 'applied');
  assert.equal(result.lmSplit.lmLengthActualM, 50.5);
  assert.equal(result.totals.lowGasPipes[31.8], 50);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 8 + 0.5);
  assert.equal(result.totals.highGasPipes[22.22], 50);
  assert.equal(result.totals.highGasPipes[19.05], 5 + 8 + 0.5);
  // 液管は増径しない。
  assert.equal(result.totals.liquidPipes[12.7], 5 + 25.5 + 25 + 8);
  assert.equal(result.totals.liquidPipes[15.88], undefined);
  assert.equal(result.totals.joints[REDUCER_KEY], 1);
  assert.ok(result.warnings.some((w) => w.type === 'info' && w.message.includes('＊3適用')));
});

test('UXE3 *2 wins over *3 when L1 equivalent exceeds 90m and LM exceeds 50m', () => {
  const engine = new RefrigerantSizerEngine();
  // L1相当長 = 5＋40＋40＋8＋3 = 96m。LM 実長は 60m。
  const result = engine.calculateSystem(makeLongPipeTree({
    lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  const longPipe = result.longPipe;

  assert.equal(longPipe.star2.status, 'applied');
  assert.equal(longPipe.star2.conditionMet, true);
  assert.equal(longPipe.appliedRule, 'star2');
  // ＊3 は抑制され、分割レコードは作られない。
  assert.equal(longPipe.star3.status, 'not_applied');
  assert.ok(longPipe.star3.reason.includes('＊2'));
  assert.equal(result.lmSplit.status, 'not_applied');
  assert.equal(result.lmSplit.lmLengthActualM, 60);
  assert.deepEqual(result.lmSplit.edges, []);
  assert.deepEqual(result.lmSplit.boundaries, []);
  assert.equal(result.lmSplit.reducerCount, 0);

  // BOM：LM 全長 60m が3管とも増径後の径へ。分割による50m区切りはない。
  assert.equal(result.totals.lowGasPipes[31.8], 60);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 8);
  assert.equal(result.totals.highGasPipes[22.22], 60);
  assert.equal(result.totals.highGasPipes[19.05], 5 + 8);
  assert.equal(result.totals.liquidPipes[15.88], 60);
  assert.equal(result.totals.liquidPipes[12.7], 5 + 8);
  assert.equal(result.totals.joints[REDUCER_KEY], undefined);
  assert.equal(result.totals.totalLength, 5 + 30 + 30 + 8 + 3);
  assert.ok(result.warnings.some((w) => w.type === 'info' && w.message.includes('＊2適用')));
  assert.ok(result.warnings.every((w) => !w.message.includes('＊3適用')));
});

test('UXE3 *3 applies when L1 equivalent is not determinable and LM exceeds 50m', () => {
  const engine = new RefrigerantSizerEngine();
  // 相当長を一切入力しない。L1相当長は判定不可、LM 実長は 60m。
  const result = engine.calculateSystem(makeLongPipeTree(), 'fsv_uxe3', false);
  const longPipe = result.longPipe;

  assert.equal(longPipe.star2.status, 'not_determinable');
  assert.equal(longPipe.star2.conditionMet, false);
  assert.ok(longPipe.star2.reason.includes('相当長'));
  // ＊2 の判定はできないが、＊3 は LM 実長で判定して適用する。
  assert.equal(longPipe.appliedRule, 'star3');
  assert.equal(result.lmSplit.status, 'applied');
  assert.equal(result.totals.lowGasPipes[31.8], 50);
  assert.equal(result.totals.lowGasPipes[28.58], 5 + 8 + 10);
  assert.equal(result.totals.joints[REDUCER_KEY], 1);
  assert.ok(result.warnings.some((w) => w.type === 'info' && w.message.includes('＊3適用')));
  // ＊2 判定不可の注記は警告パネルへ出さない（実装順序3の既定：
  // 未入力の相当長に警告なし）。判定内容は longPipe に記録する。
  assert.ok(result.warnings.every((w) => !w.message.includes('＊2判定不可')));
});

test('UXE3 base suction 38.1 sizes up to 41.28 under *2', () => {
  const engine = new RefrigerantSizerEngine();
  // 室外機容量 61.5kW は現行マスター外のため対応容量外の警告が出るが、
  // 選定は else 分岐の最大径（液 19.05／吐出 28.58／吸込 38.1）になる。
  // L1相当長 = 5＋40＋40＋8＋3 = 96m。LM 実長は 60m。
  const result = engine.calculateSystem(makeLongPipeTree({
    outdoorKw: 61.5, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  const longPipe = result.longPipe;

  assert.equal(longPipe.appliedRule, 'star2');
  assert.deepEqual(longPipe.star2.baseDiameters, { liquid: 19.05, dischargeGas: 28.58, suctionGas: 38.1 });
  assert.deepEqual(longPipe.star2.upsizedDiameters, { liquid: 22.22, dischargeGas: 31.8, suctionGas: 41.28 });
  assert.equal(result.totals.lowGasPipes[41.28], 60);
  assert.equal(result.totals.lowGasPipes[38.1], 5 + 8);
  assert.equal(result.totals.highGasPipes[31.8], 60);
  assert.equal(result.totals.highGasPipes[28.58], 5 + 8);
  assert.equal(result.totals.liquidPipes[22.22], 60);
  assert.equal(result.totals.liquidPipes[19.05], 5 + 8);
  assert.equal(result.totals.joints[REDUCER_KEY], undefined);
  assert.ok(result.warnings.some((w) => w.type === 'info' && w.message.includes('＊2適用')));
});

test('UXE3 *2 application refuses when the base BOM buckets lack the LM length', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 20, lbLen: 20, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_uxe3', false);
  const star2 = result.longPipe.star2;
  assert.equal(star2.status, 'applied');

  // 基準径の集計に LM 全長 40m が含まれていない totals では適用しない。
  const thinTotals = {
    liquidPipes: { 12.7: 10 },
    gasPipes: {},
    highGasPipes: { 19.05: 10 },
    lowGasPipes: { 28.58: 10 },
    joints: {},
    totalLength: 0
  };
  const before = JSON.parse(JSON.stringify(thinTotals));
  assert.equal(engine.applyUxE3Star2ToTotals(thinTotals, star2), false);
  assert.deepEqual(thinTotals, before);
  assert.equal(star2.status, 'not_applied');
  assert.equal(star2.applied, false);
});

test('UXE3 longPipe is null for non-UXE3 series', () => {
  const engine = new RefrigerantSizerEngine();
  const result = engine.calculateSystem(makeLongPipeTree({
    laLen: 20, lbLen: 20, lAEq: 5, laEq: 40, lbEq: 40, kitEq: 8, indoorEq: 3
  }), 'fsv_ux3', false);
  assert.equal(result.longPipe, null);
  assert.equal(result.lmSplit, null);
});
