/**
 * Panasonic HVAC Piping Sizing Calculation Engine (パナソニック版)
 * 
 * 対応シリーズ:
 * 1. FSV ME2シリーズ (冷暖切換)
 * 2. FSV MF3シリーズ (冷暖同時 3管式)
 * 3. オフィス用マルチ (店舗・オフィス用)
 * 
 * 主な特徴:
 * - 配管サイズはパナソニック指定の JISミリ外径 (9.52, 12.7, 15.88, 38.1 等)
 * - 3管式冷暖同時における電磁弁キット(ソレノイドバルブキット)まわりの3管/2管配管選定
 * - 下流総容量と接続数に基づく電磁弁キットの型番自動選定と制限警告
 */

class RefrigerantSizerEngine {
    constructor() {
        // 液管サイズ一覧 (mm φ)
        this.LIQUID_SIZES = [6.35, 9.52, 12.7, 15.88, 19.05];
        // ガス管サイズ一覧 (mm φ)
        this.GAS_SIZES = [9.52, 12.7, 15.88, 19.05, 22.2, 25.4, 28.58, 31.8, 38.1];

        // 室内機形状スタイルと対応可能容量 (kW) のマッピング
        this.INDOOR_STYLES = {
            cassette_4way: {
                name: "天井カセット形 4方向吹出",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 9.0, 11.2, 14.0, 16.0]
            },
            wall_mounted: {
                name: "壁掛形",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0]
            },
            ceiling_suspended: {
                name: "天井吊形",
                allowedKws: [3.6, 4.5, 5.6, 7.1, 8.0, 11.2, 14.0, 16.0]
            },
            floor_standing: {
                name: "床置形",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0]
            },
            ducted: {
                name: "天井埋込高静圧ダクト形",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 9.0, 11.2, 14.0, 16.0, 22.4, 28.0]
            }
        };

        // シリーズデータベース
        this.SERIES_DATABASE = {
            fsv_ux3: {
                name: "ビル用マルチ UX3シリーズ (冷暖切換)",
                maxIndoorUnits: 64,
                outdoorCapacities: [
                    { hp: "8", kw: 22.4, model: "U-P224UX3" },
                    { hp: "10", kw: 28.0, model: "U-P280UX3" },
                    { hp: "12", kw: 33.5, model: "U-P335UX3" },
                    { hp: "14", kw: 40.0, model: "U-P400UX3" },
                    { hp: "16", kw: 45.0, model: "U-P450UX3" },
                    { hp: "18", kw: 50.0, model: "U-P500UX3" },
                    { hp: "20", kw: 56.0, model: "U-P560UX3" },
                    { hp: "22", kw: 61.5, model: "U-P615UX3" },
                    { hp: "24", kw: 68.0, model: "U-P680UX3" },
                    { hp: "26", kw: 73.0, model: "U-P730UX3" },
                    { hp: "28", kw: 78.5, model: "U-P785UX3" },
                    { hp: "30", kw: 85.0, model: "U-P850UX3" }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 },
                    { type: "28形 (1.0馬力)", kw: 2.8 },
                    { type: "36形 (1.3馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 },
                    { type: "56形 (2.0馬力)", kw: 5.6 },
                    { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 },
                    { type: "90形 (3.2馬力)", kw: 9.0 },
                    { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 },
                    { type: "160形 (6.0馬力)", kw: 16.0 },
                    { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            fsv_uxe3: {
                name: "ビル用マルチ UXE3シリーズ (冷暖同時 3管式)",
                maxIndoorUnits: 52,
                outdoorCapacities: [
                    { hp: "8", kw: 22.4, model: "U-P224UXE3" },
                    { hp: "10", kw: 28.0, model: "U-P280UXE3" },
                    { hp: "12", kw: 33.5, model: "U-P335UXE3" },
                    { hp: "14", kw: 40.0, model: "U-P400UXE3" },
                    { hp: "16", kw: 45.0, model: "U-P450UXE3" },
                    { hp: "18", kw: 50.0, model: "U-P500UXE3" },
                    { hp: "20", kw: 56.0, model: "U-P560UXE3" }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 },
                    { type: "28形 (1.0馬力)", kw: 2.8 },
                    { type: "36形 (1.3馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 },
                    { type: "56形 (2.0馬力)", kw: 5.6 },
                    { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 },
                    { type: "90形 (3.2馬力)", kw: 9.0 },
                    { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 },
                    { type: "160形 (6.0馬力)", kw: 16.0 },
                    { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            office_pack: {
                name: "店舗・オフィス用カスタムマルチ",
                maxIndoorUnits: 4, // 最大ダブルツインまで
                outdoorCapacities: [
                    { hp: "3", kw: 8.0, model: "U-P80H7" },
                    { hp: "4", kw: 10.0, model: "U-P100H7" },
                    { hp: "5", kw: 12.5, model: "U-P125H7" },
                    { hp: "6", kw: 14.0, model: "U-P140H7" },
                    { hp: "8", kw: 22.4, model: "U-P224H7" },
                    { hp: "10", kw: 28.0, model: "U-P280H7" }
                ],
                indoorTypes: [
                    { type: "36形 (1.3馬力)", kw: 3.6 },
                    { type: "40形 (1.5馬力)", kw: 4.0 },
                    { type: "45形 (1.6馬力)", kw: 4.5 },
                    { type: "50形 (1.8馬力)", kw: 5.0 },
                    { type: "56形 (2.0馬力)", kw: 5.6 },
                    { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 },
                    { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }
                ]
            }
        };
    }

    getValidIndoorOptions(seriesId, styleId) {
        const series = this.SERIES_DATABASE[seriesId];
        const style = this.INDOOR_STYLES[styleId];
        if (!series || !style) return [];
        return series.indoorTypes.filter(opt => style.allowedKws.includes(opt.kw));
    }

    generateModelNumber(node, seriesId) {
        const db = this.SERIES_DATABASE[seriesId];
        if (!db) return '-';

        if (node.type === 'outdoor') {
            const match = db.outdoorCapacities.find(c => Math.abs(c.kw - node.capacity) < 0.1);
            return match ? match.model : '-';
        }

        if (node.type === 'indoor') {
            const match = db.indoorTypes.find(i => Math.abs(i.kw - node.capacity) < 0.1);
            if (!match) return '-';
            const capCode = match.type.split('形')[0].replace('P', '');
            
            switch (node.indoorStyle) {
                case 'cassette_4way': return `S-P${capCode}MU3`;
                case 'wall_mounted': return `S-P${capCode}MK3`;
                case 'ceiling_suspended': return `S-P${capCode}MT3`;
                case 'floor_standing': return `S-P${capCode}MR3`;
                case 'ducted': return `S-P${capCode}MD3`;
                default: return `S-${capCode}`;
            }
        }

        if (node.type === 'solenoid_kit') {
            return this.generateSolenoidKitModel(node);
        }

        return '';
    }

    /** 電磁弁キット(ソレノイドバルブキット)の品番選定 */
    generateSolenoidKitModel(node) {
        const kw = this.getDownstreamCapacity(node);
        const count = this.countIndoorUnitsDownstream(node);

        if (count === 1) {
            // 個別用
            if (kw <= 5.6) return "CZ-P56HRV3";
            return "CZ-P160HRV3";
        } else {
            // グループ用 (系統用マルチ)
            if (kw <= 5.6) return "CZ-P56HRG3";
            return "CZ-P160HRG3";
        }
    }

    countIndoorUnitsDownstream(node) {
        let count = 0;
        if (node.type === 'indoor') count += 1;
        if (node.children) {
            node.children.forEach(c => {
                count += this.countIndoorUnitsDownstream(c);
            });
        }
        return count;
    }

    getDownstreamCapacity(node) {
        let sum = 0;
        if (node.type === 'indoor') {
            sum += node.capacity;
        }
        if (node.children) {
            node.children.forEach(child => {
                sum += this.getDownstreamCapacity(child);
            });
        }
        return sum;
    }

    /** 2管式配管サイズ選定 */
    selectTwoPipeSize(kw, isManualSizeUp = false) {
        let liquid = 9.52;
        let gas = 15.88;

        if (kw <= 5.6) {
            liquid = 6.35; gas = 12.7;
        } else if (kw <= 9.0) {
            liquid = 9.52; gas = 15.88;
        } else if (kw <= 16.0) {
            liquid = 9.52; gas = 19.05;
        } else if (kw <= 22.4) {
            liquid = 9.52; gas = 22.2;
        } else if (kw <= 33.5) {
            liquid = 9.52; gas = 25.4;
        } else if (kw <= 50.0) {
            liquid = 12.7; gas = 28.58;
        } else if (kw <= 68.0) {
            liquid = 15.88; gas = 28.58;
        } else {
            liquid = 19.05; gas = 38.1;
        }

        if (isManualSizeUp) {
            liquid = this.sizeUpPipe(liquid, this.LIQUID_SIZES);
            gas = this.sizeUpPipe(gas, this.GAS_SIZES);
        }

        return { liquid, gas };
    }

    /** 3管式 (室外機〜電磁弁キット間) 配管サイズ選定 */
    selectThreePipeSize(outdoorKw, isManualSizeUp = false) {
        let liquid = 9.52;
        let dischargeGas = 15.88; // 吐出ガス (高圧)
        let suctionGas = 19.05;   // 吸入ガス (低圧)

        if (outdoorKw <= 22.4) { // 8HP
            liquid = 9.52; dischargeGas = 15.88; suctionGas = 19.05;
        } else if (outdoorKw <= 28.0) { // 10HP
            liquid = 9.52; dischargeGas = 19.05; suctionGas = 22.2;
        } else if (outdoorKw <= 45.0) { // 12-16HP
            liquid = 12.7; dischargeGas = 19.05; suctionGas = 28.58;
        } else if (outdoorKw <= 56.0) { // 18-20HP
            liquid = 15.88; dischargeGas = 22.2; suctionGas = 28.58;
        } else { // 24HP-
            liquid = 19.05; dischargeGas = 28.58; suctionGas = 38.1;
        }

        if (isManualSizeUp) {
            liquid = this.sizeUpPipe(liquid, this.LIQUID_SIZES);
            dischargeGas = this.sizeUpPipe(dischargeGas, this.GAS_SIZES);
            suctionGas = this.sizeUpPipe(suctionGas, this.GAS_SIZES);
        }

        return { liquid, dischargeGas, suctionGas };
    }

    sizeUpPipe(current, list) {
        const idx = list.indexOf(current);
        if (idx !== -1 && idx < list.length - 1) {
            return list[idx + 1];
        }
        return current;
    }

    /** 分岐ジョイント選定 (パナソニック) */
    selectJointModel(kw) {
        if (kw <= 22.4) return "CZ-P160KB2";
        if (kw <= 68.0) return "CZ-P224KB2";
        return "CZ-P680KB2";
    }

    calculateSystem(rootNode, seriesId, isManualSizeUp = false) {
        if (!rootNode || rootNode.type !== 'outdoor') {
            return { error: 'Invalid root node' };
        }

        const warnings = [];
        const totals = {
            liquidPipes: {},
            gasPipes: {},
            highGasPipes: {}, // 吐出ガス用
            lowGasPipes: {},  // 吸入ガス用
            joints: {},
            totalLength: 0
        };

        const totalIndoorKw = this.getDownstreamCapacity(rootNode);
        const totalIndoorCount = this.countIndoorUnitsDownstream(rootNode);
        const series = this.SERIES_DATABASE[seriesId];

        if (series) {
            const outdoorCap = rootNode.capacity;
            const ratio = (totalIndoorKw / outdoorCap) * 100;
            
            if (totalIndoorCount > series.maxIndoorUnits) {
                warnings.push({
                    type: 'danger',
                    message: `室内機の接続台数制限(${series.maxIndoorUnits}台)を超えています。現在: ${totalIndoorCount}台`
                });
            }

            if (ratio < 50 || ratio > 130) {
                warnings.push({
                    type: 'info',
                    message: `室外機容量に対する接続室内機合計比率が適正範囲(50%〜130%)を外れています。現在: ${ratio.toFixed(1)}% (${totalIndoorKw.toFixed(1)} kW / 室外機: ${outdoorCap.toFixed(1)} kW)`
                });
            }
        }

        this.processNodeSizing(rootNode, seriesId, isManualSizeUp, false, rootNode.capacity, totals, warnings);

        return {
            tree: rootNode,
            warnings: warnings,
            totals: totals
        };
    }

    processNodeSizing(node, seriesId, isManualSizeUp, inSolenoidDownstream, outdoorCap, totals, warnings) {
        node.modelNumber = this.generateModelNumber(node, seriesId);

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                const childKw = this.getDownstreamCapacity(child);
                child.capacitySum = childKw;

                const len = child.length || 0;
                totals.totalLength += len;

                if (seriesId === 'fsv_uxe3') {
                    // UXE3(冷暖同時) 3管・2管ハイブリッド判定
                    if (node.type === 'outdoor' || node.type === 'branch') {
                        if (child.type === 'solenoid_kit') {
                            // 室外機〜電磁弁キット間は3管式
                            const sizes = this.selectThreePipeSize(outdoorCap, isManualSizeUp);
                            child.pipeSizeText = `液管: φ${sizes.liquid} / 吐出ガス: φ${sizes.dischargeGas} / 吸入ガス: φ${sizes.suctionGas}`;
                            child.pipes = { type: '3pipe', liquid: sizes.liquid, highGas: sizes.dischargeGas, lowGas: sizes.suctionGas };

                            totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                            totals.highGasPipes[sizes.dischargeGas] = (totals.highGasPipes[sizes.dischargeGas] || 0) + len;
                            totals.lowGasPipes[sizes.suctionGas] = (totals.lowGasPipes[sizes.suctionGas] || 0) + len;

                            this.processNodeSizing(child, seriesId, isManualSizeUp, true, outdoorCap, totals, warnings);
                        } else {
                            // 直接接続
                            const sizes = this.selectThreePipeSize(outdoorCap, isManualSizeUp);
                            child.pipeSizeText = `液管: φ${sizes.liquid} / 吐出ガス: φ${sizes.dischargeGas} / 吸入ガス: φ${sizes.suctionGas}`;
                            child.pipes = { type: '3pipe', liquid: sizes.liquid, highGas: sizes.dischargeGas, lowGas: sizes.suctionGas };
                            
                            warnings.push({
                                type: 'danger',
                                message: `冷暖同時(MF3)系統では、室外機と室内機の間に電磁弁キットが必要です。(${child.name})`
                            });

                            this.processNodeSizing(child, seriesId, isManualSizeUp, false, outdoorCap, totals, warnings);
                        }
                    } else if (inSolenoidDownstream) {
                        // 電磁弁キットから下流は2管式
                        const sizes = this.selectTwoPipeSize(childKw, isManualSizeUp);
                        child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                        child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                        totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                        totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;

                        this.processNodeSizing(child, seriesId, isManualSizeUp, true, outdoorCap, totals, warnings);
                    }
                } else {
                    // 通常の2管式 (UX3, オフィスパック)
                    const sizes = this.selectTwoPipeSize(childKw, isManualSizeUp);
                    child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                    child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                    totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                    totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;

                    if (node.type === 'branch') {
                        node.jointModel = this.selectJointModel(childKw);
                        totals.joints[node.jointModel] = (totals.joints[node.jointModel] || 0) + 1;
                    }

                    if (child.type === 'solenoid_kit') {
                        warnings.push({
                            type: 'danger',
                            message: `冷暖切換(UX3)またはオフィスパックに電磁弁キットは追加できません。接続を削除してください。`
                        });
                    }

                    this.processNodeSizing(child, seriesId, isManualSizeUp, false, outdoorCap, totals, warnings);
                }
            });
        }

        if ((node.type === 'solenoid_kit') && node.modelNumber) {
            totals.joints[node.modelNumber] = (totals.joints[node.modelNumber] || 0) + 1;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RefrigerantSizerEngine;
} else {
    window.RefrigerantSizerEngine = RefrigerantSizerEngine;
}

/* ==========================================================================
   SpecChecker – 仕様・品番 定期チェックユーティリティ (パナソニック用)
   ========================================================================== */
class SpecChecker {
    constructor(engineInstance) {
        this.engine = engineInstance;
        this.SNAPSHOT_KEY   = 'panasonic_sizer_spec_snapshot';
        this.HISTORY_KEY    = 'panasonic_sizer_spec_history';
        this.LAST_CHECK_KEY = 'panasonic_sizer_last_check_date';
        this.CHECK_INTERVAL_DAYS = 30;
    }

    _currentSnapshot() {
        const db = this.engine && this.engine.SERIES_DATABASE ? this.engine.SERIES_DATABASE : {};
        return JSON.stringify(db, null, 2);
    }

    getLastCheckDate() {
        const raw = localStorage.getItem(this.LAST_CHECK_KEY);
        return raw ? new Date(raw) : null;
    }

    isCheckDue() {
        const last = this.getLastCheckDate();
        if (!last) return true;
        const diff = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= this.CHECK_INTERVAL_DAYS;
    }

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    }

    _addHistory(entry) {
        const history = this.getHistory();
        history.unshift(entry);
        if (history.length > 50) history.splice(50);
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    }

    runCheck(force = false) {
        if (!force && !this.isCheckDue()) {
            return { executed: false, entry: null };
        }

        const now      = new Date();
        const nowIso   = now.toISOString();
        const current  = this._currentSnapshot();
        const previous = localStorage.getItem(this.SNAPSHOT_KEY);

        localStorage.setItem(this.LAST_CHECK_KEY, nowIso);

        if (!previous) {
            localStorage.setItem(this.SNAPSHOT_KEY, current);
            const entry = {
                date:    nowIso,
                type:    'initial',
                label:   '初回スナップショット登録',
                changes: []
            };
            this._addHistory(entry);
            return { executed: true, entry };
        }

        const changes = this._diffSnapshots(previous, current);
        localStorage.setItem(this.SNAPSHOT_KEY, current);

        const entry = {
            date:    nowIso,
            type:    changes.length > 0 ? 'changed' : 'ok',
            label:   changes.length > 0 ? `${changes.length} 件の変更を検出` : '変更なし',
            changes: changes
        };
        this._addHistory(entry);
        return { executed: true, entry };
    }

    _diffSnapshots(oldJson, newJson) {
        let oldObj, newObj;
        try { oldObj = JSON.parse(oldJson); } catch { oldObj = {}; }
        try { newObj = JSON.parse(newJson); } catch { newObj = {}; }

        const changes = [];
        this._deepDiff(oldObj, newObj, '', changes);
        return changes;
    }

    _deepDiff(oldObj, newObj, path, changes) {
        const allKeys = new Set([
            ...Object.keys(oldObj || {}),
            ...Object.keys(newObj || {})
        ]);

        for (const key of allKeys) {
            const fullPath = path ? `${path}.${key}` : key;
            const oldVal = oldObj ? oldObj[key] : undefined;
            const newVal = newObj ? newObj[key] : undefined;

            if (oldVal === undefined && newVal !== undefined) {
                changes.push({ path: fullPath, type: 'added', oldVal: null, newVal: this._summary(newVal) });
            } else if (oldVal !== undefined && newVal === undefined) {
                changes.push({ path: fullPath, type: 'removed', oldVal: this._summary(oldVal), newVal: null });
            } else if (typeof oldVal === 'object' && oldVal !== null && typeof newVal === 'object' && newVal !== null) {
                if (Array.isArray(oldVal) || Array.isArray(newVal)) {
                    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                        changes.push({ path: fullPath, type: 'modified', oldVal: this._summary(oldVal), newVal: this._summary(newVal) });
                    }
                } else {
                    this._deepDiff(oldVal, newVal, fullPath, changes);
                }
            } else if (oldVal !== newVal) {
                changes.push({ path: fullPath, type: 'modified', oldVal: String(oldVal), newVal: String(newVal) });
            }
        }
    }

    _summary(val) {
        if (Array.isArray(val)) return `[配列: ${val.length}件]`;
        if (typeof val === 'object' && val !== null) return `{オブジェクト}`;
        return String(val);
    }
}

if (typeof window !== 'undefined') {
    window.SpecChecker = SpecChecker;
}
