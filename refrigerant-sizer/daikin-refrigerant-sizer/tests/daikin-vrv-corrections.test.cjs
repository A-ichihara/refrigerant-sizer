/**
 * Daikin VRV 訂正テスト
 *
 * 2026-10-27 の原本照合 (~/workspace/refrigerant-sizer-verification/daikin-refrigerant/REPORT.md)
 * に基づく訂正値 (D-1〜D-10) を固定する。出典は各テストのコメントおよび
 * ~/workspace/refrigerant-sizer-verification/daikin-refrigerant/CORRECTIONS.md を参照。
 *
 * 実行: node --test tests/daikin-vrv-corrections.test.cjs
 * (daikin-refrigerant-sizer ディレクトリから)
 */
'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const RefrigerantSizerEngine = require('../js/engine.js');

function makeEngine() {
    return new RefrigerantSizerEngine();
}

function indoor(id, kw, length = 5) {
    return { id, name: `室内機 ${id}`, type: 'indoor', indoorStyle: 'cassette_4way', capacity: kw, length, children: [] };
}

function branch(id, children, length = 10) {
    return { id, name: `分岐 ${id}`, type: 'branch', length, children };
}

function bsUnit(id, children, length = 15) {
    return { id, name: `BSユニット ${id}`, type: 'bs_unit', length, children };
}

function outdoor(kw, children) {
    return { id: 'root', name: '室外機', type: 'outdoor', capacity: kw, length: 0, children };
}

function kws(seriesId) {
    return makeEngine().SERIES_DATABASE[seriesId].outdoorCapacities.map(c => c.kw);
}

function hasRatioWarning(result) {
    return result.warnings.some(w => w.includes('接続率') || w.includes('接続容量比'));
}

// ==================== D-1: 40馬力は 112kW (113.0kW は存在しない) ====================
describe('D-1 40馬力 = 112kW', () => {
    test('X / X高COP / A / R の容量リストに 113.0 がない', () => {
        for (const seriesId of ['vrv7_x', 'vrv7_x_high_cop', 'vrv7_a', 'vrv_r']) {
            assert.ok(!kws(seriesId).includes(113.0), `${seriesId} に 113.0 が残っている`);
        }
    });

    test('40馬力は 112.0kW (X / A / R。X高COP は最大 36馬力のため 40馬力は存在しない)', () => {
        for (const seriesId of ['vrv7_x', 'vrv7_a', 'vrv_r']) {
            const entry = makeEngine().SERIES_DATABASE[seriesId].outdoorCapacities.find(c => c.hp === 40);
            assert.deepEqual(entry, { hp: 40, kw: 112.0 });
        }
        const highCop = makeEngine().SERIES_DATABASE.vrv7_x_high_cop.outdoorCapacities;
        assert.equal(Math.max(...highCop.map(c => c.hp)), 36);
        assert.ok(!highCop.some(c => c.hp === 40));
    });

    test('112.0kW の型番は RXGA1120A / RXYA1120A / REYA1120A', () => {
        const engine = makeEngine();
        assert.equal(engine.generateModelNumber({ type: 'outdoor', capacity: 112.0 }, 'vrv7_x'), 'RXGA1120A');
        assert.equal(engine.generateModelNumber({ type: 'outdoor', capacity: 112.0 }, 'vrv7_a'), 'RXYA1120A');
        assert.equal(engine.generateModelNumber({ type: 'outdoor', capacity: 112.0 }, 'vrv_r'), 'REYA1120A');
    });

    test('112.0kW の主管・分岐は 液15.9/ガス31.8 (113.0kW の 19.1/38.1 ではない)', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.getOutdoorMainPipeSize(112.0, 'vrv7_x'), { liquid: 15.9, gas: 31.8 });
        assert.deepEqual(engine.getBranchPipeSize(112.0, 'vrv7_x'), { liquid: 15.9, gas: 31.8 });
    });

    test('calculateSystem: 112.0kW 室外機の主管は 液15.9/ガス31.8', () => {
        const engine = makeEngine();
        const tree = outdoor(112.0, [branch('b1', [indoor('i1', 28.0), indoor('i2', 28.0)])]);
        const result = engine.calculateSystem(tree, 'vrv7_x');
        assert.equal(result.tree.pipeLiquid, 15.9);
        assert.equal(result.tree.pipeGas, 31.8);
    });
});

// ==================== D-2: 現行容量ラダー ====================
describe('D-2 現行容量ラダー', () => {
    test('X: 22.4〜136kW (48馬力)・21機種・14.0/16.0 を含まない', () => {
        const list = kws('vrv7_x');
        assert.equal(list.length, 21);
        assert.equal(Math.min(...list), 22.4);
        assert.equal(Math.max(...list), 136.0);
        assert.ok(!list.includes(14.0) && !list.includes(16.0));
    });

    test('X: 現行ラダーの値を全て含む', () => {
        const list = kws('vrv7_x');
        for (const kw of [22.4, 28.0, 33.5, 40.0, 45.0, 50.0, 56.0, 61.5, 67.0, 73.0, 77.5, 85.0, 90.0, 95.0, 100.0, 106.0, 112.0, 118.0, 122.0, 128.0, 136.0]) {
            assert.ok(list.includes(kw), `X に ${kw} がない`);
        }
    });

    test('X: 旧世代ラダーの値を一切含まない', () => {
        const list = kws('vrv7_x');
        for (const kw of [68.0, 78.5, 96.0, 101.0, 107.0, 124.0, 130.0, 135.0, 141.0, 146.0, 152.0, 157.0, 163.0, 168.0]) {
            assert.ok(!list.includes(kw), `X に旧値 ${kw} が残っている`);
        }
    });

    test('X高COP: 最大 100kW (36馬力)・15機種', () => {
        const list = kws('vrv7_x_high_cop');
        assert.equal(list.length, 15);
        assert.equal(Math.max(...list), 100.0);
        assert.equal(Math.min(...list), 22.4);
    });

    test('A: 最大 150kW (54馬力)・140/145/150 を含む', () => {
        const list = kws('vrv7_a');
        assert.equal(list.length, 24);
        assert.equal(Math.max(...list), 150.0);
        assert.ok(list.includes(140.0) && list.includes(145.0) && list.includes(150.0));
    });

    test('R: 22.4〜150kW・24機種', () => {
        const list = kws('vrv_r');
        assert.equal(list.length, 24);
        assert.equal(Math.min(...list), 22.4);
        assert.equal(Math.max(...list), 150.0);
    });

    test('馬力対応: 22.4→8、112→40、136→48、150→54', () => {
        const engine = makeEngine();
        const x = engine.SERIES_DATABASE.vrv7_x.outdoorCapacities;
        const a = engine.SERIES_DATABASE.vrv7_a.outdoorCapacities;
        assert.equal(x.find(c => c.kw === 22.4).hp, 8);
        assert.equal(x.find(c => c.kw === 112.0).hp, 40);
        assert.equal(x.find(c => c.kw === 136.0).hp, 48);
        assert.equal(a.find(c => c.kw === 150.0).hp, 54);
    });
});

// ==================== D-3: vrv7_rx (高暖房VRV H) の除去 ====================
describe('D-3 vrv7_rx の除去', () => {
    test('SERIES_DATABASE に vrv7_rx が存在しない', () => {
        const engine = makeEngine();
        assert.ok(!('vrv7_rx' in engine.SERIES_DATABASE));
        assert.deepEqual(
            Object.keys(engine.SERIES_DATABASE),
            ['vrv7_x', 'vrv7_x_high_cop', 'vrv7_a', 'vrv_r', 'machi_multi', 'skyair', 'package_industrial']
        );
    });
});

// ==================== D-4: vrv_r は VRV 7 Rシリーズ ====================
describe('D-4 vrv_r の名称', () => {
    test('表示名は VRV 7 Rシリーズ (冷暖同時・3管式)', () => {
        assert.equal(makeEngine().SERIES_DATABASE.vrv_r.name, 'VRV 7 Rシリーズ (冷暖同時・3管式)');
    });

    test('冷媒は R32 (REYA は R32 カタログの型番)', () => {
        assert.equal(makeEngine().SERIES_DATABASE.vrv_r.refrigerant, 'R32');
    });
});

// ==================== D-5: machiマルチ ====================
describe('D-5 machiマルチ', () => {
    test('容量リストは 8.0/11.2/14.0/16.0/22.4/28.0/33.5kW (10.0/12.5 を含まない)', () => {
        const list = makeEngine().SERIES_DATABASE.machi_multi.outdoorCapacities;
        assert.deepEqual(list.map(c => c.kw), [8.0, 11.2, 14.0, 16.0, 22.4, 28.0, 33.5]);
        assert.deepEqual(list.map(c => c.hp), [3, 4, 5, 6, 8, 10, 12]);
    });

    test('型番は RXTA: 11.2→RXTA112F、33.5→RXTA335F、8.0→RXTA80F', () => {
        const engine = makeEngine();
        assert.equal(engine.generateModelNumber({ type: 'outdoor', capacity: 11.2 }, 'machi_multi'), 'RXTA112F');
        assert.equal(engine.generateModelNumber({ type: 'outdoor', capacity: 33.5 }, 'machi_multi'), 'RXTA335F');
        assert.equal(engine.generateModelNumber({ type: 'outdoor', capacity: 8.0 }, 'machi_multi'), 'RXTA80F');
    });

    test('machi 主管: 16.0→9.5/15.9、22.4→9.5/19.1、28.0→9.5/22.2、33.5→12.7/25.4', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.getOutdoorMainPipeSize(8.0, 'machi_multi'), { liquid: 9.5, gas: 15.9 });
        assert.deepEqual(engine.getOutdoorMainPipeSize(16.0, 'machi_multi'), { liquid: 9.5, gas: 15.9 });
        assert.deepEqual(engine.getOutdoorMainPipeSize(22.4, 'machi_multi'), { liquid: 9.5, gas: 19.1 });
        assert.deepEqual(engine.getOutdoorMainPipeSize(28.0, 'machi_multi'), { liquid: 9.5, gas: 22.2 });
        assert.deepEqual(engine.getOutdoorMainPipeSize(33.5, 'machi_multi'), { liquid: 12.7, gas: 25.4 });
    });

    test('machi 分岐後: 16.0→9.5/15.9、28.0→9.5/22.2、33.5→12.7/25.4 (P096 主管に帯を合わせた暫定値)', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.getBranchPipeSize(16.0, 'machi_multi'), { liquid: 9.5, gas: 15.9 });
        assert.deepEqual(engine.getBranchPipeSize(22.4, 'machi_multi'), { liquid: 9.5, gas: 19.1 });
        assert.deepEqual(engine.getBranchPipeSize(28.0, 'machi_multi'), { liquid: 9.5, gas: 22.2 });
        assert.deepEqual(engine.getBranchPipeSize(33.5, 'machi_multi'), { liquid: 12.7, gas: 25.4 });
    });

    test('SkyAir は変更なし (主管 14.0→9.5/15.9、22.4→9.5/19.1、28.0→9.5/22.2)', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.getOutdoorMainPipeSize(14.0, 'skyair'), { liquid: 9.5, gas: 15.9 });
        assert.deepEqual(engine.getOutdoorMainPipeSize(22.4, 'skyair'), { liquid: 9.5, gas: 19.1 });
        assert.deepEqual(engine.getOutdoorMainPipeSize(28.0, 'skyair'), { liquid: 9.5, gas: 22.2 });
        assert.deepEqual(engine.getBranchPipeSize(16.0, 'skyair'), { liquid: 9.5, gas: 19.1 });
    });
});

// ==================== D-6: REFNETジョイント ====================
describe('D-6 REFNETジョイント', () => {
    test('2管式 第1分岐 (室外機容量による): 22.4→33T、40.0→72T、73.0→73T、136→73T、16.0→22T', () => {
        const engine = makeEngine();
        const first = (outdoorKw) => engine.getJointModel(0, 'vrv7_x', { isFirstBranch: true, outdoorKw });
        assert.equal(first(16.0), 'KHR26C22T');
        assert.equal(first(22.4), 'KHR26C33T');
        assert.equal(first(28.0), 'KHR26C33T');
        assert.equal(first(40.0), 'KHR26C72T');
        assert.equal(first(67.0), 'KHR26C72T');
        assert.equal(first(73.0), 'KHR26C73T');
        assert.equal(first(136.0), 'KHR26C73T');
    });

    test('2管式 第2分岐以下 (下流合計容量による): 22.4未満→22T、22.4〜33.0未満→33T、33.0〜71.0未満→72T、71.0以上→73T', () => {
        const engine = makeEngine();
        const later = (kw) => engine.getJointModel(kw, 'vrv7_x');
        assert.equal(later(20.0), 'KHR26C22T');
        assert.equal(later(22.4), 'KHR26C33T');
        assert.equal(later(32.9), 'KHR26C33T');
        assert.equal(later(33.0), 'KHR26C72T');
        assert.equal(later(70.9), 'KHR26C72T');
        assert.equal(later(71.0), 'KHR26C73T');
        assert.equal(later(100.0), 'KHR26C73T');
    });

    test('3管式 第1分岐: 22.4→KHR25C33T、50.0→KHR25C72T、100→KHR25C73T', () => {
        const engine = makeEngine();
        const first = (outdoorKw) => engine.getJointModel(0, 'vrv_r', { isFirstBranch: true, outdoorKw });
        assert.equal(first(22.4), 'KHR25C33T');
        assert.equal(first(28.0), 'KHR25C33T');
        assert.equal(first(50.0), 'KHR25C72T');
        assert.equal(first(100.0), 'KHR25C73T');
    });

    test('3管式 第2分岐以下: 20.0→22T、30.0→33T、50.0→72T、71.0→73T', () => {
        const engine = makeEngine();
        const later = (kw) => engine.getJointModel(kw, 'vrv_r');
        assert.equal(later(20.0), 'KHR25C22T');
        assert.equal(later(30.0), 'KHR25C33T');
        assert.equal(later(50.0), 'KHR25C72T');
        assert.equal(later(71.0), 'KHR25C73T');
    });

    test('3管式の BSユニット下流 (2本配管部) は KHR26C**T (第2分岐以下の帯)', () => {
        const engine = makeEngine();
        const twoPipe = (kw) => engine.getJointModel(kw, 'vrv_r', { isTwoPipeSection: true });
        assert.equal(twoPipe(20.0), 'KHR26C22T');
        assert.equal(twoPipe(30.0), 'KHR26C33T');
        assert.equal(twoPipe(50.0), 'KHR26C72T');
        assert.equal(twoPipe(71.0), 'KHR26C73T');
    });

    test('machi / 設備用は変更なし (公式の選定表が報告にないため)', () => {
        const engine = makeEngine();
        assert.equal(engine.getJointModel(10.0, 'machi_multi'), 'KHRP26M22T');
        assert.equal(engine.getJointModel(30.0, 'machi_multi'), 'KHRP26M33T');
        assert.equal(engine.getJointModel(20.0, 'package_industrial'), 'BHFP22P90');
    });

    test('calculateSystem (2管式): 第1分岐は室外機容量、第2分岐は下流容量で選定される', () => {
        const engine = makeEngine();
        const tree = outdoor(56.0, [
            branch('b1', [
                indoor('i1', 11.2),
                branch('b2', [indoor('i2', 11.2), indoor('i3', 8.0)])
            ])
        ]);
        const result = engine.calculateSystem(tree, 'vrv7_x');
        const b1 = result.tree.children[0];
        const b2 = b1.children[1];
        assert.equal(b1.jointModel, 'KHR26C72T'); // 室外機 56.0kW → 72T
        assert.equal(b2.jointModel, 'KHR26C22T'); // 下流 19.2kW → 22T
    });

    test('calculateSystem (3管式): 第1分岐は KHR25C**T、BS下流の分岐は KHR26C**T', () => {
        const engine = makeEngine();
        const tree = outdoor(28.0, [
            branch('b1', [
                bsUnit('bs1', [
                    indoor('i1', 5.6),
                    branch('b2', [indoor('i2', 7.1)])
                ])
            ])
        ]);
        const result = engine.calculateSystem(tree, 'vrv_r');
        const b1 = result.tree.children[0];
        const bs1 = b1.children[0];
        const b2 = bs1.children[1];
        assert.equal(b1.jointModel, 'KHR25C33T'); // 室外機 28.0kW → 33T
        assert.equal(b2.jointModel, 'KHR26C22T'); // BS下流・下流 7.1kW → 22T
    });
});

// ==================== D-7: BSユニット ====================
describe('D-7 BSユニット', () => {
    test('個別: Q≦5.6・3台以下→BSVA56A、Q≦16.0・8台以下→BSVA160A、Q≦28.0・8台以下→BSVA280A', () => {
        const engine = makeEngine();
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', [indoor('i1', 5.0)])), 'BSVA56A');
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', [indoor('i1', 1.0), indoor('i2', 1.0), indoor('i3', 1.0)])), 'BSVA56A');
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', [indoor('i1', 1.0), indoor('i2', 1.0), indoor('i3', 1.0), indoor('i4', 1.0)])), 'BSVA160A');
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', [indoor('i1', 8.0)])), 'BSVA160A');
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', [indoor('i1', 10.0), indoor('i2', 10.0)])), 'BSVA280A');
    });

    test('個別: Q>28.0 または 9台以上は選定範囲外 (null)', () => {
        const engine = makeEngine();
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', [indoor('i1', 15.0), indoor('i2', 15.0)])), null);
        const nine = Array.from({ length: 9 }, (_, i) => indoor(`i${i}`, 1.0));
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', nine)), null);
    });

    test('集合: 分岐数で BS4A/BS6A/BS8A/BS10A/BS12A160A', () => {
        const engine = makeEngine();
        const collective = (n) => bsUnit('bs', Array.from({ length: n }, (_, i) => branch(`b${i}`, [indoor(`i${i}`, 5.0)])));
        assert.equal(engine.generateBSUnitModel(collective(4)), 'BS4A160A');
        assert.equal(engine.generateBSUnitModel(collective(6)), 'BS6A160A');
        assert.equal(engine.generateBSUnitModel(collective(8)), 'BS8A160A');
        assert.equal(engine.generateBSUnitModel(collective(10)), 'BS10A160A');
        assert.equal(engine.generateBSUnitModel(collective(12)), 'BS12A160A');
        assert.equal(engine.generateBSUnitModel(collective(13)), null);
    });

    test('集合: 全分岐合計Qの上限を超えると1つ大きい機種へカスケードする (BS4A≦44.8、BS6A≦67.2、BS8A≦85.0)', () => {
        const engine = makeEngine();
        const collective = (n, kw) => bsUnit('bs', Array.from({ length: n }, (_, i) => branch(`b${i}`, [indoor(`i${i}`, kw)])));
        assert.equal(engine.generateBSUnitModel(collective(4, 11.0)), 'BS4A160A'); // Q=44.0
        assert.equal(engine.generateBSUnitModel(collective(4, 12.0)), 'BS6A160A'); // Q=48.0 > 44.8 → BS6A
        assert.equal(engine.generateBSUnitModel(collective(6, 12.0)), 'BS8A160A'); // Q=72.0 > 67.2 → BS8A
        assert.equal(engine.generateBSUnitModel(collective(8, 11.0)), 'BS10A160A'); // Q=88.0 > 85.0 → BS10A
    });

    test('集合: 1分岐あたり Q>16.0 または 6台以上は選定範囲外', () => {
        const engine = makeEngine();
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', [branch('b1', [indoor('i1', 10.0), indoor('i2', 10.0)])])), null);
        const six = Array.from({ length: 6 }, (_, i) => indoor(`i${i}`, 1.0));
        assert.equal(engine.generateBSUnitModel(bsUnit('bs', [branch('b1', six)])), null);
    });

    test('validateBSUnit: 範囲外の理由を返す (範囲内は [])', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.validateBSUnit(bsUnit('bs', [indoor('i1', 5.0)])), []);
        const issues = engine.validateBSUnit(bsUnit('bs', [indoor('i1', 15.0), indoor('i2', 15.0)]));
        assert.ok(issues.some(s => s.includes('28.0kW')));
        const branchIssues = engine.validateBSUnit(bsUnit('bs', [branch('b1', [indoor('i1', 10.0), indoor('i2', 10.0)])]));
        assert.ok(branchIssues.some(s => s.includes('16.0kW')));
    });

    test('calculateSystem (3管式): 個別BS 2台 (5.6+7.1) は BSVA160A で警告なし', () => {
        const engine = makeEngine();
        const tree = outdoor(28.0, [
            branch('b1', [bsUnit('bs1', [indoor('i1', 5.6), indoor('i2', 7.1)])])
        ]);
        const result = engine.calculateSystem(tree, 'vrv_r');
        assert.equal(result.tree.children[0].children[0].modelNumber, 'BSVA160A');
        assert.ok(!result.warnings.some(w => w.includes('BSユニット')));
    });

    test('calculateSystem (3管式): 個別BS 9台は警告される (旧 16台チェックの置き換え)', () => {
        const engine = makeEngine();
        const nine = Array.from({ length: 9 }, (_, i) => indoor(`i${i}`, 2.2));
        const tree = outdoor(28.0, [branch('b1', [bsUnit('bs1', nine)])]);
        const result = engine.calculateSystem(tree, 'vrv_r');
        assert.equal(result.tree.children[0].children[0].modelNumber, null);
        assert.ok(result.warnings.some(w => w.includes('BSユニット') && w.includes('8台')));
    });
});

// ==================== D-8: 接続容量比 ====================
describe('D-8 接続容量比', () => {
    test('X: 50〜200%。118kW以上は 50〜130%', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x', 56.0, outdoor(56.0, [])), { min: 50, max: 200 });
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x', 118.0, outdoor(118.0, [])), { min: 50, max: 130 });
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x', 136.0, outdoor(136.0, [])), { min: 50, max: 130 });
    });

    test('X: 16形・22形・28形 (16.0/2.2/2.8kW) の室内機を含む場合は最大130%', () => {
        const engine = makeEngine();
        const with22 = outdoor(56.0, [branch('b1', [indoor('i1', 2.2), indoor('i2', 28.0)])]);
        const with28 = outdoor(56.0, [branch('b1', [indoor('i1', 2.8), indoor('i2', 28.0)])]);
        const with160 = outdoor(56.0, [branch('b1', [indoor('i1', 16.0), indoor('i2', 28.0)])]);
        const without = outdoor(56.0, [branch('b1', [indoor('i1', 5.6), indoor('i2', 28.0)])]);
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x', 56.0, with22), { min: 50, max: 130 });
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x', 56.0, with28), { min: 50, max: 130 });
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x', 56.0, with160), { min: 50, max: 130 });
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x', 56.0, without), { min: 50, max: 200 });
    });

    test('X高COP: 75〜200%。16形・22形・28形を含む場合は最大130%', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x_high_cop', 50.0, outdoor(50.0, [])), { min: 75, max: 200 });
        const with28 = outdoor(50.0, [branch('b1', [indoor('i1', 2.8)])]);
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_x_high_cop', 50.0, with28), { min: 75, max: 130 });
    });

    test('A / R / machi: 50〜130%', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.getConnectionRatioRange('vrv7_a', 56.0, outdoor(56.0, [])), { min: 50, max: 130 });
        assert.deepEqual(engine.getConnectionRatioRange('vrv_r', 56.0, outdoor(56.0, [])), { min: 50, max: 130 });
        assert.deepEqual(engine.getConnectionRatioRange('machi_multi', 14.0, outdoor(14.0, [])), { min: 50, max: 130 });
    });

    test('calculateSystem: X で接続率 150% は警告されない (旧 50〜130% では警告された)', () => {
        const engine = makeEngine();
        const tree = outdoor(56.0, [branch('b1', [indoor('i1', 28.0), indoor('i2', 28.0), indoor('i3', 28.0)])]);
        const result = engine.calculateSystem(tree, 'vrv7_x');
        assert.equal(result.totals.connectionRatio, 150.0);
        assert.deepEqual(result.totals.connectionRatioRange, { min: 50, max: 200 });
        assert.ok(!hasRatioWarning(result));
    });

    test('calculateSystem: X で 150% でも 22形室内機を含む場合は警告される', () => {
        const engine = makeEngine();
        const tree = outdoor(56.0, [branch('b1', [indoor('i1', 2.2), indoor('i2', 28.0), indoor('i3', 28.0), indoor('i4', 25.8)])]);
        const result = engine.calculateSystem(tree, 'vrv7_x');
        assert.equal(result.totals.connectionRatio, 150.0);
        assert.deepEqual(result.totals.connectionRatioRange, { min: 50, max: 130 });
        assert.ok(hasRatioWarning(result));
    });

    test('calculateSystem: machi で接続率 72% は警告されない (旧 80〜120% では警告された)', () => {
        const engine = makeEngine();
        const tree = outdoor(14.0, [branch('b1', [indoor('i1', 5.6), indoor('i2', 4.5)])]);
        const result = engine.calculateSystem(tree, 'machi_multi');
        assert.ok(Math.abs(result.totals.connectionRatio - 72.1) < 0.2);
        assert.ok(!hasRatioWarning(result));
    });
});

// ==================== D-9: machi制限値 ====================
describe('D-9 machi制限値', () => {
    test('maxPipingTotal 300、maxLongestPath 90', () => {
        const config = makeEngine().SERIES_DATABASE.machi_multi;
        assert.equal(config.maxPipingTotal, 300);
        assert.equal(config.maxLongestPath, 90);
    });

    test('容量別・接続可能台数: 8.0→6、11.2→8、14.0→10、16.0→11、22.4→16、28.0→19、33.5→23', () => {
        const engine = makeEngine();
        assert.equal(engine.getMachiMaxIndoorUnits(8.0), 6);
        assert.equal(engine.getMachiMaxIndoorUnits(11.2), 8);
        assert.equal(engine.getMachiMaxIndoorUnits(14.0), 10);
        assert.equal(engine.getMachiMaxIndoorUnits(16.0), 11);
        assert.equal(engine.getMachiMaxIndoorUnits(22.4), 16);
        assert.equal(engine.getMachiMaxIndoorUnits(28.0), 19);
        assert.equal(engine.getMachiMaxIndoorUnits(33.5), 23);
    });

    test('calculateSystem: machi 8.0kW で 7台は台数警告、6台は台数警告なし', () => {
        const engine = makeEngine();
        const seven = Array.from({ length: 7 }, (_, i) => indoor(`i${i}`, 2.2));
        const six = Array.from({ length: 6 }, (_, i) => indoor(`i${i}`, 2.2));
        const over = engine.calculateSystem(outdoor(8.0, [branch('b1', seven)]), 'machi_multi');
        const ok = engine.calculateSystem(outdoor(8.0, [branch('b1', six)]), 'machi_multi');
        assert.ok(over.warnings.some(w => w.includes('接続最大台数') && w.includes('6台')));
        assert.ok(!ok.warnings.some(w => w.includes('接続最大台数')));
    });
});

// ==================== D-10: マスター表の備考 ====================
describe('D-10 マスター表の備考', () => {
    test('記号12 (19.1/31.8) の備考②は「"10"の1サイズUP」', () => {
        const engine = makeEngine();
        const row12 = engine.MASTER_PIPE_TABLES.cooling_heating_switch.rows.find(r => r.code === '12');
        assert.ok(row12.notes.includes('"10"の1サイズUP'));
        assert.ok(!row12.notes.includes('"9"の1サイズUP'));
    });

    test('記号14 (22.2/38.1) の備考②は「"13"の1サイズUP」', () => {
        const engine = makeEngine();
        const row14 = engine.MASTER_PIPE_TABLES.cooling_heating_switch.rows.find(r => r.code === '14');
        assert.ok(row14.notes.includes('"13"の1サイズUP'));
        assert.ok(!row14.notes.includes('"12"の1サイズUP'));
    });
});

// ==================== 変更しないもの (未決として記録) ====================
describe('変更しないもの (未決)', () => {
    test('設備用マルチの 113.0 は変更しない (設備用カタログ CP25146A-1 未取得のため)', () => {
        assert.ok(kws('package_industrial').includes(113.0));
    });

    test('SkyAir の接続容量比は従来の 50〜130% を維持 (スカイエアカタログ未取得のため)', () => {
        assert.deepEqual(makeEngine().getConnectionRatioRange('skyair', 14.0, outdoor(14.0, [])), { min: 50, max: 130 });
    });

    test('標準VRVの管径関数・帯は変更なし (113.0kW〜の帯はカタログと一致)', () => {
        const engine = makeEngine();
        assert.deepEqual(engine.getBranchPipeSize(113.0, 'vrv7_x'), { liquid: 19.1, gas: 38.1 });
        assert.deepEqual(engine.getOutdoorMainPipeSize(118.0, 'vrv7_x'), { liquid: 19.1, gas: 38.1 });
        assert.deepEqual(engine.getBranchPipeSize3(113.0), { liquid: 19.1, highLowGas: 28.6, suctionGas: 38.1 });
        assert.deepEqual(engine.getOutdoorMainPipeSize3(118.0), { liquid: 19.1, highLowGas: 28.6, suctionGas: 38.1 });
    });
});
