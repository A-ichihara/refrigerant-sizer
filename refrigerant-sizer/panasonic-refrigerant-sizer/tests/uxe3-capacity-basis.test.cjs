const test = require('node:test');
const assert = require('node:assert/strict');
const RefrigerantSizerEngine = require('../js/engine.js');

// 優先度C・実装順序2：容量基準の配管。
// selectThreePipeSize / selectTwoPipeSize の現行挙動を特性テストで固定し、
// 選定の呼出側が容量基準を明示する selectPipeSizeForSegment へ配管する。
// ここで固定する値は現行実装の値であり、メーカー公式の区間別管径表の
// 正解値ではない（特に selectThreePipeSize の 12〜16HP 帯は表4と異なる）。
// 管径値の変更はゲート D を通過するまで行わない。

test('selectThreePipeSize keeps its current capacity branches (characterization)', () => {
  const engine = new RefrigerantSizerEngine();
  // 現行値の固定。12〜16HP 帯は同一分岐（液12.7／吐出19.05／吸込28.58）であり、
  // 公式表4（12HP：吸込25.4、14・16HP：吐出22.22）とは一致しない。
  assert.deepEqual(engine.selectThreePipeSize(22.4), { liquid: 9.52, dischargeGas: 15.88, suctionGas: 19.05 });
  assert.deepEqual(engine.selectThreePipeSize(28.0), { liquid: 9.52, dischargeGas: 19.05, suctionGas: 22.2 });
  assert.deepEqual(engine.selectThreePipeSize(33.5), { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 });
  assert.deepEqual(engine.selectThreePipeSize(40.0), { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 });
  assert.deepEqual(engine.selectThreePipeSize(45.0), { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 });
  assert.deepEqual(engine.selectThreePipeSize(50.4), { liquid: 15.88, dischargeGas: 22.2, suctionGas: 28.58 });
  assert.deepEqual(engine.selectThreePipeSize(56.0), { liquid: 15.88, dischargeGas: 22.2, suctionGas: 28.58 });
  assert.deepEqual(engine.selectThreePipeSize(56.1), { liquid: 19.05, dischargeGas: 28.58, suctionGas: 38.1 });
});

test('selectTwoPipeSize keeps its current capacity bands (characterization)', () => {
  const engine = new RefrigerantSizerEngine();
  assert.deepEqual(engine.selectTwoPipeSize(5.6), { liquid: 6.35, gas: 12.7 });
  // 7.1kW（71形）の液管 9.52 は、訂正後の表6（71形：φ9.52）と数値上は一致する。
  // ただしこちらは容量帯による選定であり、形式別の表6の証明にはならない。
  assert.deepEqual(engine.selectTwoPipeSize(7.1), { liquid: 9.52, gas: 15.88 });
  assert.deepEqual(engine.selectTwoPipeSize(9.0), { liquid: 9.52, gas: 15.88 });
  assert.deepEqual(engine.selectTwoPipeSize(16.0), { liquid: 9.52, gas: 19.05 });
  assert.deepEqual(engine.selectTwoPipeSize(22.4), { liquid: 9.52, gas: 22.2 });
  assert.deepEqual(engine.selectTwoPipeSize(33.5), { liquid: 9.52, gas: 25.4 });
  assert.deepEqual(engine.selectTwoPipeSize(50.0), { liquid: 12.7, gas: 28.58 });
  assert.deepEqual(engine.selectTwoPipeSize(68.0), { liquid: 15.88, gas: 28.58 });
  assert.deepEqual(engine.selectTwoPipeSize(68.1), { liquid: 19.05, gas: 38.1 });
});

test('selectPipeSizeForSegment routes each segment kind to the current selector', () => {
  const engine = new RefrigerantSizerEngine();
  // 上流3管は現行どおり室外機容量を基準とする。LA／LB／LC〜LH／分岐管〜キットを
  // 区別しない一括区分であり、区間別の表（表4／表5／表6）への切替えは
  // ゲート C・D を通過するまで行わない（D1 未決）。
  assert.deepEqual(
    engine.selectPipeSizeForSegment('upstream_three_pipe', { outdoorKw: 28.0 }, false),
    engine.selectThreePipeSize(28.0, false)
  );
  assert.deepEqual(
    engine.selectPipeSizeForSegment('upstream_three_pipe', { outdoorKw: 45.0 }, false),
    { liquid: 12.7, dischargeGas: 19.05, suctionGas: 28.58 }
  );
  // キット下流2管は現行どおり下流合計容量を基準とする。
  assert.deepEqual(
    engine.selectPipeSizeForSegment('downstream_two_pipe', { downstreamKw: 5.6 }, false),
    engine.selectTwoPipeSize(5.6, false)
  );
  assert.deepEqual(
    engine.selectPipeSizeForSegment('downstream_two_pipe', { downstreamKw: 7.1 }, false),
    { liquid: 9.52, gas: 15.88 }
  );
});

test('selectPipeSizeForSegment passes manual size-up through (UXE3 still blocks it in calculateSystem)', () => {
  const engine = new RefrigerantSizerEngine();
  assert.deepEqual(
    engine.selectPipeSizeForSegment('upstream_three_pipe', { outdoorKw: 22.4 }, true),
    { liquid: 12.7, dischargeGas: 19.05, suctionGas: 22.2 }
  );
  assert.deepEqual(
    engine.selectPipeSizeForSegment('downstream_two_pipe', { downstreamKw: 5.6 }, true),
    { liquid: 9.52, gas: 15.88 }
  );
});

test('selectPipeSizeForSegment rejects unknown kinds and missing capacity bases', () => {
  const engine = new RefrigerantSizerEngine();
  assert.throws(
    () => engine.selectPipeSizeForSegment('main_LM', { outdoorKw: 28.0 }),
    /Unknown pipe segment kind/
  );
  assert.throws(
    () => engine.selectPipeSizeForSegment('upstream_three_pipe', {}),
    /outdoorKw/
  );
  assert.throws(
    () => engine.selectPipeSizeForSegment('downstream_two_pipe', {}),
    /downstreamKw/
  );
  // 範囲外・非有限の容量は旧関数へ委譲する（else 分岐の最大径）。対応容量外
  // の警告は calculateSystem 側が出すため、ここでは例外としない。
  assert.deepEqual(
    engine.selectPipeSizeForSegment('upstream_three_pipe', { outdoorKw: 'x' }),
    engine.selectThreePipeSize('x')
  );
});

test('calculateSystem sanitizes invalid pipe lengths instead of corrupting totals', () => {
  const engine = new RefrigerantSizerEngine();
  // 従来は文字列の長さが集計に混ざり totalLength が "10x" のような文字列になった。
  const tree = {
    id: 'root', type: 'outdoor', capacity: 28, length: 0,
    children: [{
      id: 'kit', type: 'solenoid_kit', length: 10,
      children: [{ id: 'indoor', type: 'indoor', capacity: 5.6, length: 'x', children: [] }]
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  assert.equal(typeof result.totals.totalLength, 'number');
  assert.equal(result.totals.totalLength, 10);
  assert.equal(result.totals.liquidPipes['6.35'], 0);
  assert.ok(result.warnings.some((w) => w.message.includes('0mとして集計')));

  // 負の長さも 0m として扱う。
  const negativeTree = {
    id: 'root', type: 'outdoor', capacity: 28, length: 0,
    children: [{
      id: 'kit', type: 'solenoid_kit', length: 10,
      children: [{ id: 'indoor', type: 'indoor', capacity: 5.6, length: -3, children: [] }]
    }]
  };
  const negativeResult = engine.calculateSystem(negativeTree, 'fsv_uxe3', false);
  assert.equal(negativeResult.totals.totalLength, 10);
  assert.ok(negativeResult.warnings.some((w) => w.message.includes('0mとして集計')));
});

test('calculateSystem terminates on cyclic trees and warns instead of looping', () => {
  const engine = new RefrigerantSizerEngine();
  // JSON 由来のツリーでは循環は生じないが、計算側にもガードがなかったため
  // 従来は終了しなかった。監査側のガードとは別に、計算側でも停止する。
  const branch = { id: 'loop', type: 'branch', length: 5, children: [] };
  branch.children.push(branch);
  const tree = { id: 'root', type: 'outdoor', capacity: 28, length: 0, children: [branch] };
  let result;
  assert.doesNotThrow(() => { result = engine.calculateSystem(tree, 'fsv_uxe3', false); });
  assert.equal(typeof result.totals.totalLength, 'number');
  assert.equal(result.totals.totalLength, 5);
  assert.ok(result.warnings.some((w) => w.message.includes('循環参照')));
});

test('calculateSystem counts a shared node once and warns about it', () => {
  const engine = new RefrigerantSizerEngine();
  const sharedIndoor = { id: 'shared', type: 'indoor', capacity: 5.6, length: 3, children: [] };
  const tree = {
    id: 'root', type: 'outdoor', capacity: 28, length: 0,
    children: [{
      id: 'branch', type: 'branch', length: 7,
      children: [
        {
          id: 'kit-a', type: 'solenoid_kit', length: 11,
          children: [sharedIndoor]
        },
        {
          id: 'kit-b', type: 'solenoid_kit', length: 13,
          children: [sharedIndoor]
        }
      ]
    }]
  };
  const result = engine.calculateSystem(tree, 'fsv_uxe3', false);
  // 共有室内機への辺（3m）は2回ではなく1回だけ集計される。
  assert.equal(result.totals.totalLength, 34);
  assert.equal(Object.values(result.totals.gasPipes).reduce((sum, len) => sum + len, 0), 3);
  assert.equal(Object.values(result.totals.liquidPipes).reduce((sum, len) => sum + len, 0), 34);
  assert.ok(result.warnings.some((w) => w.message.includes('共有ノード')));
});

test('calculateSystem warns (not errors) for a non-finite outdoor capacity', () => {
  const engine = new RefrigerantSizerEngine();
  // 室外機容量が非有限でも、既存の扱いは「UXE3対応容量外」の警告であり、
  // エラー返却ではない（既存テストが固定）。選定は旧関数の else 分岐に委譲する。
  const result = engine.calculateSystem(
    { id: 'root', type: 'outdoor', capacity: 'x', length: 0, children: [] },
    'fsv_uxe3', false
  );
  assert.equal(result.error, undefined);
  assert.ok(result.warnings.some((w) => w.message.includes('UXE3対応容量外')));
});

test('getDownstreamCapacity ignores non-numeric indoor capacities', () => {
  const engine = new RefrigerantSizerEngine();
  assert.equal(engine.getDownstreamCapacity({ type: 'indoor', capacity: 'x', children: [] }), 0);
  assert.equal(engine.getDownstreamCapacity({
    type: 'branch', children: [
      { type: 'indoor', capacity: 5.6, children: [] },
      { type: 'indoor', capacity: 'x', children: [] }
    ]
  }), 5.6);
});
