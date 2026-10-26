/**
 * Panasonic HVAC Piping Sizing Calculation Engine (パナソニック版)
 * 
 * 対応シリーズ:
 * 1. FSV ME2シリーズ (冷暖切換)
 * 2. FSV MF3 / UXE3シリーズ（冷暖フリー・3管式）
 * 3. オフィス用マルチ (店舗・オフィス用)
 * 
 * 主な特徴:
 * - 配管サイズはパナソニック指定の JISミリ外径 (9.52, 12.7, 15.88, 38.1 等)
 * - 3管式冷暖フリー系統における電磁弁キット(ソレノイドバルブキット)まわりの3管/2管配管選定
 * - 下流総容量と接続数に基づく電磁弁キットの型番自動選定と制限警告
 */

class RefrigerantSizerEngine {
    constructor() {
        // 液管サイズ一覧 (mm φ)
        this.LIQUID_SIZES = [6.35, 9.52, 12.7, 15.88, 19.05];
        // ガス管サイズ一覧 (mm φ)
        this.GAS_SIZES = [9.52, 12.7, 15.88, 19.05, 22.2, 25.4, 28.58, 31.8, 38.1];
        // 表7の径ラダー (mm φ)。表1 脚注＊2・＊3 の1ランクアップ用。決定事項D4（2026-10-27）。
        // GAS_SIZES / LIQUID_SIZES は変更しない（既存の選定・表示で使う）。
        this.TABLE7_LADDER = [6.35, 9.52, 12.7, 15.88, 19.05, 22.22, 25.4, 28.58, 31.8, 38.1, 41.28];
        // 組合せ室外機の構成（優先度C・実装順序5、C6）。仕様書で確認済み。
        // PA-P504UXE3＝CU-P280UXE3＋CU-P224UXE3、PA-P560UXE3＝CU-P280UXE3×2。
        // 接続管は吸込 φ28.58／吐出 φ22.22／液 φ15.88／バランス管 φ9.52。
        this.OUTDOOR_GROUP_COMPOSITION = [
            {
                totalKw: 50.4, model: 'PA-P504UXE3',
                members: [
                    { model: 'CU-P280UXE3', capacity: 28.0, position: 'near' },
                    { model: 'CU-P224UXE3', capacity: 22.4, position: 'tip' }
                ]
            },
            {
                totalKw: 56.0, model: 'PA-P560UXE3',
                members: [
                    { model: 'CU-P280UXE3', capacity: 28.0, position: 'near' },
                    { model: 'CU-P280UXE3', capacity: 28.0, position: 'tip' }
                ]
            }
        ];

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
                name: "冷暖フリービル用マルチ UXE3シリーズ（3管式）",
                maxIndoorUnits: 52,
                outdoorCapacities: [
                    { hp: "8", kw: 22.4, model: "CU-P224UXE3" },
                    { hp: "10", kw: 28.0, model: "CU-P280UXE3" },
                    { hp: "12", kw: 33.5, model: "CU-P335UXE3" },
                    { hp: "14", kw: 40.0, model: "CU-P400UXE3" },
                    { hp: "16", kw: 45.0, model: "CU-P450UXE3" },
                    // 18/20HP are combination outdoor units; use the official combined model numbers.
                    { hp: "18", kw: 50.4, model: "PA-P504UXE3" },
                    { hp: "20", kw: 56.0, model: "PA-P560UXE3" }
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

    /**
     * 並列電磁弁キットの台数（優先度C・実装順序5、C5）。
     * 160形キットの容量範囲は 5.6kW（超え）〜16.0kW（含む）。下流合計が
     * 16.0kW を超える場合は160形キット2個の並列とし、1個のキットグループ
     * ノードとして扱う（設計メモの推奨案（a））。16.0kW ちょうどは1個。
     * 品番は generateSolenoidKitModel の選定を変えず、台数だけが変わる。
     * 下流合計が 32.0kW（160形×2の上限）を超える場合も台数は2のままとし、
     * 3個以上の規則は作らない（監査で別途注記する）。
     */
    getSolenoidKitParallelCount(node) {
        const kw = this.getDownstreamCapacity(node);
        return kw > 16.0 ? 2 : 1;
    }

    countIndoorUnitsDownstream(node, seen = null) {
        if (!node || typeof node !== 'object') return 0;
        if (!seen) seen = new Set();
        if (seen.has(node)) return 0;
        seen.add(node);
        let count = 0;
        if (node.type === 'indoor') count += 1;
        if (Array.isArray(node.children)) {
            node.children.forEach(c => {
                count += this.countIndoorUnitsDownstream(c, seen);
            });
        }
        return count;
    }

    getDownstreamCapacity(node, seen = null) {
        if (!node || typeof node !== 'object') return 0;
        if (!seen) seen = new Set();
        if (seen.has(node)) return 0;
        seen.add(node);
        let sum = 0;
        if (node.type === 'indoor') {
            // 容量が非数値・非有限の室内機は 0kW として扱う。文字列の容量が
            // 合計に混ざると文字列連結になり、後段の選定・比率判定が壊れる。
            sum += (typeof node.capacity === 'number' && Number.isFinite(node.capacity)) ? node.capacity : 0;
        }
        if (Array.isArray(node.children)) {
            node.children.forEach(child => {
                sum += this.getDownstreamCapacity(child, seen);
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

    /**
     * 表7のラダーで1ランク上げる（優先度C・実装順序4、決定事項D4）。
     * 31.75 と 31.8 は同一管径の表記ゆれ、22.2 は 22.22 の誤記として読み替える。
     * ラダーにない径、非数値、または既に上限（41.28）の場合はそのまま返す。
     */
    sizeUpOneRankTable7(current) {
        if (typeof current !== 'number' || !Number.isFinite(current)) return current;
        let normalized = current;
        if (current === 31.75) normalized = 31.8;
        if (current === 22.2) normalized = 22.22;
        const idx = this.TABLE7_LADDER.indexOf(normalized);
        if (idx === -1 || idx >= this.TABLE7_LADDER.length - 1) return current;
        return this.TABLE7_LADDER[idx + 1];
    }

    /**
     * 区間種別と容量基準を明示して管径を選定する（優先度C・実装順序2）。
     * 現行の selectThreePipeSize / selectTwoPipeSize へ振り分けるだけで、
     * 管径値は変更しない。旧関数は ui.js の表示と既存テストでも使うため残す。
     * - 'upstream_three_pipe': 室外機〜電磁弁キット間の3管。現行は LA／LB／
     *   LC〜LH／分岐管〜キットを区別しない一括区分であり、室外機容量を基準と
     *   する。区間別の表（表4／表5／表6）への切替えはゲート C・D を通過する
     *   まで行わない（D1 未決）。
     * - 'downstream_two_pipe': 電磁弁キット下流の2管。下流合計容量を基準と
     *   する。表6の形式別選定への切替えもゲート D を通過するまで行わない。
     * 不明な区間種別や、容量基準そのものが渡されていない場合は例外とする。
     * 黙って別基準で選定しないためである。ただし容量の値が範囲外・非有限
     * の場合は旧関数へ委譲する（旧関数の else 分岐が最大径を返す既存の
     * 挙動であり、calculateSystem が「UXE3対応容量外」の警告を出す）。
     */
    selectPipeSizeForSegment(segmentKind, basis, isManualSizeUp = false) {
        if (segmentKind === 'upstream_three_pipe') {
            if (!basis || basis.outdoorKw === undefined) {
                throw new Error('upstream_three_pipe requires an outdoorKw capacity basis');
            }
            return this.selectThreePipeSize(basis.outdoorKw, isManualSizeUp);
        }
        if (segmentKind === 'downstream_two_pipe') {
            if (!basis || basis.downstreamKw === undefined) {
                throw new Error('downstream_two_pipe requires a downstreamKw capacity basis');
            }
            return this.selectTwoPipeSize(basis.downstreamKw, isManualSizeUp);
        }
        throw new Error(`Unknown pipe segment kind: ${String(segmentKind)}`);
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
        if (seriesId === 'fsv_uxe3') {
            warnings.push({
                type: 'danger',
                message: '【UXE3基準配管径未検証】現行の3管式基準径は、メーカー公式の区間別主管表とアプリ内配管区間の対応確認が未完了です。設計確定値として使用せず、対象機種の公式配管設計資料またはP-SPECで照合してください。'
            });
        }

        // UXE3は現行マスターで8～20HPのみを扱う。範囲外を近似サイズで黙って計算しない。
        if (seriesId === 'fsv_uxe3') {
            const supportedCapacities = this.SERIES_DATABASE.fsv_uxe3.outdoorCapacities.map(item => item.kw);
            const capacitySupported = supportedCapacities.some(kw => Math.abs(kw - rootNode.capacity) < 0.001);
            if (!capacitySupported) {
                warnings.push({
                    type: 'danger',
                    message: `【UXE3対応容量外】室外機容量 ${rootNode.capacity}kW は現行アプリの対応マスター（8～20HP）に登録されていません。表示される管径・型式・BOMを設計値として使用せず、対象機種の公式資料またはP-SPECで選定してください。`
                });
            }
        }
        const totals = {
            liquidPipes: {},
            gasPipes: {},
            highGasPipes: {}, // 吐出ガス用
            lowGasPipes: {},  // 吸入ガス用
            balancePipes: {}, // 室外機グループのバランス管用（優先度C・実装順序5、C6）
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

        // UXE3の一律手動増径は対象区間・管種の公式照合が未完了のため安全停止する。
        // UIを経由しない直接呼び出しでも適用されないようエンジン側で制御する。
        const effectiveManualSizeUp = seriesId === 'fsv_uxe3' ? false : isManualSizeUp;
        if (seriesId === 'fsv_uxe3' && isManualSizeUp) {
            warnings.push({
                type: 'danger',
                message: '【UXE3手動サイズアップ未適用】メーカー指定の増径対象区間・管種が未検証のため、一律増径は適用していません。メーカー公式配管設計資料で確認してください。'
            });
        }
        this.processNodeSizing(rootNode, seriesId, effectiveManualSizeUp, false, rootNode.capacity, totals, warnings);

        // UXE3区間監査を計算結果へ接続し、未分類・不正な辺をUIにも明示する。
        // 監査は読み取り専用で、管径計算やBOMの値は変更しない。
        let segmentAudit = null;
        if (seriesId === 'fsv_uxe3') {
            segmentAudit = this.auditUxE3PipeSegments(rootNode);
            warnings.push(...segmentAudit.warnings);
        }

        // UXE3経路診断を計算結果へ接続する。読み取り専用であり、管径計算・
        // BOM・length は変更しない。pathAudit.notes は診断出力内の注記であり、
        // UIの警告パネルへは追加しない（UIへの表示は別途の対応とする）。
        let pathAudit = null;
        if (seriesId === 'fsv_uxe3') {
            pathAudit = this.auditUxE3PipePaths(rootNode);
        }

        // UXE3 長配管条件（表1 脚注＊2・＊3、優先度C・実装順序6）。
        // ＊2：L1相当長が 90m を超える場合、主管 LM の3管を1ランク増径する
        // （LM 全体の一律増径、分割なし）。＊3：＊2 が適用されない場合に
        // LM 実長が 50m を超えるとき、最初の 50m の吸込・吐出管を1ランク
        // 増径する（実装順序4の分割レコード）。＊2 と ＊3 は排他的である。
        // ＊2 の判定は相当長基準のみで行い、相当長が判定できない場合は
        // 判定不可として記録し、実長で代用しない。
        let longPipe = null;
        let lmSplit = null;
        if (seriesId === 'fsv_uxe3') {
            longPipe = this.evaluateUxE3LongPipeConditions(pathAudit, rootNode.capacity);
            lmSplit = this.computeUxE3LmSplit(pathAudit, rootNode.capacity, {
                suppressStar3: longPipe.star2.conditionMet,
                suppressionReason: '＊2（L1相当長＞90m）が適用されるため、＊3 は適用しません（表1 脚注＊3「＊2以外の場合でも」による排他）。'
            });
            if (longPipe.star2.status === 'applied') {
                this.applyUxE3Star2ToTotals(totals, longPipe.star2);
            } else {
                this.applyUxE3LmSplitToTotals(totals, lmSplit);
            }
            longPipe.star3 = { status: lmSplit.status, reason: lmSplit.reason };
            if (longPipe.star2.status === 'applied') {
                longPipe.appliedRule = 'star2';
                longPipe.reason = '＊2 を適用しました。';
            } else if (lmSplit.status === 'applied') {
                longPipe.appliedRule = 'star3';
                longPipe.reason = '＊3 を適用しました。';
            } else if (longPipe.star2.status === 'not_determinable') {
                longPipe.appliedRule = 'not_determinable';
                longPipe.reason = longPipe.star2.reason;
            } else {
                longPipe.appliedRule = 'none';
                longPipe.reason = '長配管条件（＊2・＊3）は適用されませんでした。';
            }
            // 適用された規則を警告パネルへ明記する（情報）。
            // ＊2 が判定不可の場合の注記は警告パネルへ出さない。相当長が
            // 未入力・不正の場合は、実装順序3の既定（未入力の相当長に警告
            // なし）と整合させるためである。判定内容は longPipe に記録する。
            if (longPipe.appliedRule === 'star2') {
                warnings.push({ type: 'info', message: this.buildUxE3Star2WarningMessage(longPipe.star2) });
            } else if (longPipe.appliedRule === 'star3') {
                warnings.push({ type: 'info', message: this.buildUxE3Star3WarningMessage(longPipe, lmSplit) });
            }
        }

        // UXE3キットグループと室外機グループの監査（優先度C・実装順序5）。
        // 監査は読み取り専用であり、管径選定・既存の BOM 集計は変更しない。
        // ただし室外機グループの LO・バランス管の長さは、監査で確定した場合
        // のみ BOM へ加算する（applyUxE3OutdoorGroupToTotals）。並列キットの
        // 台数（BOM の継手数）は processNodeSizing が計上する。
        let kitGroups = null;
        let outdoorGroups = null;
        if (seriesId === 'fsv_uxe3') {
            kitGroups = this.auditUxE3KitGroups(rootNode);
            warnings.push(...kitGroups.warnings);
            outdoorGroups = this.auditUxE3OutdoorGroups(rootNode);
            warnings.push(...outdoorGroups.warnings);
            if (outdoorGroups.status === 'applied') {
                this.applyUxE3OutdoorGroupToTotals(totals, outdoorGroups);
            }
        }

        return {
            tree: rootNode,
            segmentAudit,
            pathAudit,
            lmSplit,
            longPipe,
            kitGroups,
            outdoorGroups,
            warnings: warnings,
            totals: totals
        };
    }

    /**
     * UXE3配管ツリーの接続辺を、データ変更なしで監査する。
     * 親子関係やノード種別だけからメーカー区間を推測しない。
     * edgeSpec.segmentType が明示されていても、公式資料の検証済みとは扱わない。
     */
    auditUxE3PipeSegments(rootNode) {
        const findings = [];
        const warnings = [];
        if (!rootNode || typeof rootNode !== 'object' || rootNode.type !== 'outdoor') {
            return {
                seriesId: 'fsv_uxe3',
                findings,
                summary: { totalEdges: 0, unclassified: 0, declared: 0 },
                warnings: [{ type: 'danger', message: 'UXE3区間監査には outdoor をルートとする有効なツリーが必要です。' }]
            };
        }

        const allowedSegmentTypes = new Set([
            'main_LM',
            'branch_main_LC_LH',
            'outdoor_interconnect_LO',
            'branch_to_solenoid',
            'solenoid_to_indoor',
            'unclassified'
        ]);
        const visited = new WeakSet();
        const activePath = new WeakSet();
        const capacityBasisValues = new Set(['outdoor_total', 'downstream_sum', 'indoor_model', 'not_resolved']);
        const validationStateValues = new Set(['verified', 'unverified', 'unsupported']);
        const walk = (parent, path) => {
            if (!parent || typeof parent !== 'object') return;
            if (activePath.has(parent)) {
                warnings.push({
                    type: 'danger',
                    message: `循環参照を検出したため、その接続先の監査を停止しました（${path}）。`
                });
                return;
            }
            if (visited.has(parent)) {
                warnings.push({
                    type: 'danger',
                    message: `共有ノードを検出しました。複数の親から参照されているため、配管ツリーの一意性を確認してください（${path}）。`
                });
                return;
            }
            visited.add(parent);
            activePath.add(parent);
            if (parent.children !== undefined && !Array.isArray(parent.children)) {
                warnings.push({
                    type: 'danger',
                    message: `UXE3区間監査：children が配列ではありません（${path}）。`
                });
            }
            const children = Array.isArray(parent.children) ? parent.children : [];
            children.forEach((child, index) => {
                if (!child || typeof child !== 'object') {
                    const childPath = `${path}/invalid-child[${index}]`;
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：子ノードがオブジェクトではありません（${childPath}）。`
                    });
                    findings.push({
                        path: childPath,
                        parentId: parent.id || null,
                        parentType: parent.type || null,
                        childId: null,
                        childType: null,
                        lengthM: null,
                        lengthState: 'missing_or_nonfinite',
                        lengthEquivalentM: null,
                        equivalentLengthState: 'missing_or_nonfinite',
                        segmentType: 'unclassified',
                        declarationState: 'unclassified',
                        capacityBasis: null,
                        sourceKey: null,
                        validationState: 'unverified'
                    });
                    return;
                }
                const childPath = `${path}/${child.id ? child.id : `${child.type ? child.type : 'node'}[${index}]`}`;
                const hasEdgeSpec = Object.prototype.hasOwnProperty.call(child, 'edgeSpec');
                const isValidEdgeSpec = hasEdgeSpec && child.edgeSpec !== null
                    && typeof child.edgeSpec === 'object' && !Array.isArray(child.edgeSpec);
                const spec = isValidEdgeSpec ? child.edgeSpec : null;
                if (hasEdgeSpec && !isValidEdgeSpec) {
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：edgeSpec がオブジェクト形式ではありません。区間情報を未分類として扱います（${childPath}）。`
                    });
                }
                const declaredType = spec && typeof spec.segmentType === 'string'
                    ? spec.segmentType
                    : null;
                const validDeclaredType = Boolean(declaredType && allowedSegmentTypes.has(declaredType));
                if (spec && Object.prototype.hasOwnProperty.call(spec, 'segmentType')
                    && (!validDeclaredType || typeof spec.segmentType !== 'string')) {
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：未定義または不正な区間種別を検出しました。未分類として扱います（${childPath}）。`
                    });
                }
                const lengthIsFinite = Boolean(child && Number.isFinite(child.length));
                const lengthIsValid = lengthIsFinite && child.length >= 0;
                // 相当長は辺ごとの任意入力（child.lengthEquivalent）でのみ与える。
                // PA-P900UXE3 に相当長換算表はないため算出しない。未入力の場合は
                // 判定不可とし、実長で代用しない。入力されたが不正な値（非数値・
                // 非有限・負数）は未入力として扱い、危険警告を出す（実長の扱いと同じ）。
                const rawEquivalentLength = child.lengthEquivalent;
                const equivalentIsFinite = typeof rawEquivalentLength === 'number'
                    && Number.isFinite(rawEquivalentLength);
                const equivalentIsValid = equivalentIsFinite && rawEquivalentLength >= 0;
                const equivalentLengthState = rawEquivalentLength === undefined || rawEquivalentLength === null
                    ? 'missing_or_nonfinite'
                    : (equivalentIsValid ? 'valid_nonnegative'
                        : (equivalentIsFinite ? 'invalid_negative' : 'missing_or_nonfinite'));
                const capacityBasis = spec && typeof spec.capacityBasis === 'string' && capacityBasisValues.has(spec.capacityBasis)
                    ? spec.capacityBasis
                    : null;
                const suppliedValidationState = spec && typeof spec.validationState === 'string' && validationStateValues.has(spec.validationState)
                    ? spec.validationState
                    : 'unverified';
                // A metadata flag is not evidence of manufacturer verification. Audit never promotes an edge to verified.
                const declaredValidationState = suppliedValidationState === 'verified' ? 'unverified' : suppliedValidationState;
                if (suppliedValidationState === 'verified') {
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：検証状態に「verified」が指定されていますが、入力メタデータだけではメーカー仕様への適合確認を意味しません。未検証として扱います（${childPath}）。`
                    });
                }
                findings.push({
                    path: childPath,
                    parentId: parent.id || null,
                    parentType: parent.type || null,
                    childId: child && child.id || null,
                    childType: child && child.type || null,
                    lengthM: lengthIsFinite ? child.length : null,
                    lengthState: !lengthIsFinite ? 'missing_or_nonfinite' : (lengthIsValid ? 'valid_nonnegative' : 'invalid_negative'),
                    lengthEquivalentM: equivalentIsValid ? rawEquivalentLength : null,
                    equivalentLengthState,
                    segmentType: validDeclaredType ? declaredType : 'unclassified',
                    declarationState: validDeclaredType && declaredType !== 'unclassified'
                        ? 'declared_unverified'
                        : 'unclassified',
                    capacityBasis,
                    sourceKey: spec && typeof spec.sourceKey === 'string' ? spec.sourceKey : null,
                    validationState: declaredValidationState
                });
                if (!lengthIsValid) {
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：配管長が未入力・非数値、または負数です（${childPath}）。`
                    });
                }
                if (rawEquivalentLength !== undefined && rawEquivalentLength !== null && !equivalentIsValid) {
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：相当長が未入力・非数値、または負数です。相当長は未入力として扱います（${childPath}）。`
                    });
                }
                if (spec && Object.prototype.hasOwnProperty.call(spec, 'capacityBasis')
                    && (typeof spec.capacityBasis !== 'string'
                        || (spec.capacityBasis !== '' && !capacityBasisValues.has(spec.capacityBasis)))) {
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：未定義または不正な容量基準を検出しました（${childPath}）。`
                    });
                }
                if (spec && Object.prototype.hasOwnProperty.call(spec, 'validationState')
                    && (typeof spec.validationState !== 'string'
                        || (spec.validationState !== '' && !validationStateValues.has(spec.validationState)))) {
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：未定義または不正な検証状態を検出しました（${childPath}）。`
                    });
                }
                if (spec && Object.prototype.hasOwnProperty.call(spec, 'sourceKey')
                    && typeof spec.sourceKey !== 'string') {
                    warnings.push({
                        type: 'danger',
                        message: `UXE3区間監査：資料キーの型が不正です（${childPath}）。`
                    });
                }
                if (child && typeof child === 'object') walk(child, childPath);
            });
            activePath.delete(parent);
        };
        walk(rootNode, rootNode.id || 'root');

        const declared = findings.filter(item => item.declarationState === 'declared_unverified').length;
        const unclassified = findings.length - declared;
        if (unclassified > 0) {
            warnings.push({
                type: 'danger',
                message: `UXE3区間監査：${unclassified}本の接続辺は区間未確定です。ノード構造だけから公式区間や管径を推定していません。`
            });
        }
        if (declared > 0) {
            warnings.push({
                type: 'danger',
                message: `UXE3区間監査：${declared}本の接続辺に区間ラベルがありますが、監査結果はメーカー仕様への適合確認を意味しません。`
            });
        }
        return {
            seriesId: 'fsv_uxe3',
            findings,
            summary: { totalEdges: findings.length, unclassified, declared },
            warnings
        };
    }

    /**
     * UXE3配管ツリーの経路を、データ変更なしで診断する（優先度C・実装順序1・3）。
     * 室外機〜各室内機の経路を列挙し、L1候補（実長による最遠経路）と、
     * 決定事項D1の規則に基づくLM候補（LA＋LB）・ΔL候補を監査出力として返す。
     * LM候補・ΔL候補は決定事項D1の規則による区間であり、メーカーの文言に
     * よる明示的な定義ではない。相当長は辺ごとの任意入力（子ノードの
     * `lengthEquivalent`）でのみ与える。PA-P900UXE3 に相当長換算表は
     * ないため算出せず、未入力の辺を含む経路の相当長は判定不可とし、
     * 実長で代用しない。管径選定・BOM・length・警告パネルには接続しない。
     * 入力ツリーを変更しない。循環参照・共有ノード・深すぎるツリーでも
     * 終了するよう、経路数と深さに上限を設ける。
     */
    auditUxE3PipePaths(rootNode) {
        const RULE_D1 = '決定事項D1（2026-10-26）：L1候補経路上で最初に現れる分岐ノードを室外第一分岐、その次の分岐ノードを第一分岐、さらに次の分岐ノードを次の分岐とする。図1の室外第一分岐・第一分岐の配置に基づく規則。';
        const MAX_PATHS = 200;
        const MAX_DEPTH = 100;
        const notes = [];
        const notDeterminable = (reason) => ({
            status: 'not_determinable',
            reason,
            leafId: null,
            nodeLabels: [],
            edgeChildIds: [],
            lengthActualM: null,
            lengthEquivalentM: null,
            equivalentStatus: 'not_determinable',
            lengthState: 'missing_or_nonfinite'
        });
        const emptyResult = (reason) => ({
            seriesId: 'fsv_uxe3',
            leafPaths: [],
            l1Candidate: notDeterminable(reason),
            l1EquivalentCandidate: notDeterminable(reason),
            lmCandidate: {
                status: 'not_determinable',
                reason,
                rule: RULE_D1,
                l1LeafId: null,
                outdoorFirstBranchId: null,
                outdoorFirstBranchLabel: null,
                firstBranchId: null,
                firstBranchLabel: null,
                laEdgeChildId: null,
                lbEdgeChildId: null,
                lengthActualM: null,
                lengthEquivalentM: null,
                equivalentStatus: 'not_determinable',
                lengthState: 'missing_or_nonfinite',
                nodeLabels: []
            },
            deltaLCandidate: {
                status: 'not_determinable',
                reason,
                rule: RULE_D1,
                fromNodeId: null,
                fromNodeLabel: null,
                terminalCount: 0,
                maxLengthM: null,
                minLengthM: null,
                deltaM: null,
                maxLengthEquivalentM: null,
                minLengthEquivalentM: null,
                deltaEquivalentM: null,
                equivalentStatus: 'not_determinable',
                equivalentTerminalCount: 0,
                lengthState: 'missing_or_nonfinite'
            },
            summary: {
                totalEdges: 0,
                totalLengthM: 0,
                longestEdgeM: null,
                invalidLengthEdges: 0,
                leafPaths: 0,
                indoorLeafPaths: 0,
                truncated: false
            },
            notes
        });

        if (!rootNode || typeof rootNode !== 'object' || rootNode.type !== 'outdoor') {
            notes.push({
                type: 'danger',
                message: 'UXE3経路診断には outdoor をルートとする有効なツリーが必要です。'
            });
            return emptyResult('有効なツリーではありません。');
        }

        const labelOf = (node, index) => {
            if (node && typeof node.id === 'string' && node.id) return node.id;
            return `${node && node.type ? node.type : 'node'}[${index}]`;
        };
        const idOf = (node) => (node && typeof node.id === 'string' && node.id ? node.id : null);
        const lengthOf = (node) => {
            if (!node || !Number.isFinite(node.length)) return { value: null, state: 'missing_or_nonfinite' };
            if (node.length < 0) return { value: null, state: 'invalid_negative' };
            return { value: node.length, state: 'valid_nonnegative' };
        };
        // 相当長は辺ごとの任意入力（child.lengthEquivalent）でのみ与える。
        // 未入力（undefined／null）は判定不可であり、警告は出さない（任意入力のため）。
        // 入力されたが不正な値（非数値・非有限・負数）は未入力として扱う。
        const equivalentLengthOf = (node) => {
            if (!node || node.lengthEquivalent === undefined || node.lengthEquivalent === null
                || !Number.isFinite(node.lengthEquivalent)) return { value: null, state: 'missing_or_nonfinite' };
            if (node.lengthEquivalent < 0) return { value: null, state: 'invalid_negative' };
            return { value: node.lengthEquivalent, state: 'valid_nonnegative' };
        };

        // 概要：各接続辺を一度だけ数える（共有ノードの配下は重複計上しない）。
        let totalEdges = 0;
        let totalLengthM = 0;
        let longestEdgeM = null;
        let invalidLengthEdges = 0;
        let hasValidEquivalentLength = false;
        const seen = new Set();
        const stack = [rootNode];
        while (stack.length > 0) {
            const node = stack.pop();
            if (!node || typeof node !== 'object' || seen.has(node)) continue;
            seen.add(node);
            const children = Array.isArray(node.children) ? node.children : [];
            children.forEach((child) => {
                totalEdges += 1;
                const len = lengthOf(child);
                if (len.state === 'valid_nonnegative') {
                    totalLengthM += len.value;
                    if (longestEdgeM === null || len.value > longestEdgeM) longestEdgeM = len.value;
                } else {
                    invalidLengthEdges += 1;
                }
                const eqLen = equivalentLengthOf(child);
                if (eqLen.state === 'valid_nonnegative') hasValidEquivalentLength = true;
                if (child && child.lengthEquivalent !== undefined && child.lengthEquivalent !== null
                    && eqLen.state !== 'valid_nonnegative') {
                    notes.push({
                        type: 'danger',
                        message: `UXE3経路診断：相当長が未入力・非数値、または負数です。相当長は未入力として扱います（${child.id || child.type || '名称不明'}）。`
                    });
                }
                if (child && typeof child === 'object') stack.push(child);
            });
        }

        // 経路列挙：室外機〜末端ノードの全経路（深さ優先）。末端＝子を持たないノード。
        const leafPaths = [];
        let truncated = false;
        const activePath = new Set();
        const rootLabel = rootNode.id || 'root';
        const walk = (node, nodeLabels, nodeTypes, nodeIds, edgeChildIds, edges, depth) => {
            if (leafPaths.length >= MAX_PATHS || depth > MAX_DEPTH) {
                truncated = true;
                return;
            }
            if (!node || typeof node !== 'object') return;
            if (activePath.has(node)) {
                notes.push({
                    type: 'danger',
                    message: `循環参照を検出したため、その接続先の経路列挙を停止しました（${nodeLabels.join('/')}）。`
                });
                truncated = true;
                return;
            }
            const children = Array.isArray(node.children) ? node.children : [];
            if (node.children !== undefined && !Array.isArray(node.children)) {
                notes.push({
                    type: 'danger',
                    message: `UXE3経路診断：children が配列ではありません（${nodeLabels.join('/')}）。`
                });
            }
            activePath.add(node);
            if (children.length === 0) {
                const invalid = edges.find((edge) => edge.lengthState !== 'valid_nonnegative');
                const invalidEq = edges.find((edge) => edge.equivalentState !== 'valid_nonnegative');
                leafPaths.push({
                    leafId: idOf(node),
                    leafType: node.type || null,
                    leafName: typeof node.name === 'string' ? node.name : null,
                    nodeLabels: [...nodeLabels],
                    nodeTypes: [...nodeTypes],
                    nodeIds: [...nodeIds],
                    edgeChildIds: [...edgeChildIds],
                    edges: edges.map((edge) => ({ ...edge })),
                    lengthActualM: invalid
                        ? null
                        : edges.reduce((sum, edge) => sum + edge.lengthM, 0),
                    lengthState: invalid ? invalid.lengthState : 'valid_nonnegative',
                    lengthEquivalentM: invalidEq
                        ? null
                        : edges.reduce((sum, edge) => sum + edge.lengthEquivalentM, 0),
                    equivalentState: invalidEq ? invalidEq.equivalentState : 'valid_nonnegative'
                });
            } else {
                children.forEach((child, index) => {
                    if (leafPaths.length >= MAX_PATHS) {
                        truncated = true;
                        return;
                    }
                    const childLabel = labelOf(child, index);
                    const len = lengthOf(child);
                    const eqLen = equivalentLengthOf(child);
                    walk(
                        child,
                        [...nodeLabels, childLabel],
                        [...nodeTypes, child && child.type ? child.type : null],
                        [...nodeIds, idOf(child)],
                        [...edgeChildIds, idOf(child) || childLabel],
                        [...edges, { childId: idOf(child) || childLabel, lengthM: len.value, lengthState: len.state, lengthEquivalentM: eqLen.value, equivalentState: eqLen.state }],
                        depth + 1
                    );
                });
            }
            activePath.delete(node);
        };
        walk(rootNode, [rootLabel], ['outdoor'], [idOf(rootNode)], [], [], 0);
        if (truncated) {
            notes.push({
                type: 'danger',
                message: 'UXE3経路診断：経路数または深さの上限に達したため、列挙を打ち切りました。結果は全経路を網羅していません。'
            });
        }

        const indoorPaths = leafPaths.filter((path) => path.leafType === 'indoor');
        const indoorValidPaths = indoorPaths.filter((path) => path.lengthActualM !== null);

        // L1候補：実長による最遠の室内機経路。lengthEquivalentM は同経路の
        // 相当長（全辺の相当長が有効な場合のみ）。相当長が未入力・不正の辺を
        // 含む場合は判定不可とし、実長で代用しない。
        let l1Candidate;
        if (indoorValidPaths.length === 0) {
            const reason = indoorPaths.length === 0
                ? '室内機までの経路がありません。'
                : '室内機までの経路の配管長が未入力・非数値、または負数です。';
            l1Candidate = notDeterminable(reason);
            notes.push({ type: 'info', message: `UXE3経路診断：L1候補を特定できませんでした（${reason}）` });
        } else {
            const farthest = indoorValidPaths.reduce((best, path) => (
                path.lengthActualM > best.lengthActualM ? path : best
            ));
            l1Candidate = {
                status: 'candidate',
                reason: null,
                leafId: farthest.leafId,
                nodeLabels: [...farthest.nodeLabels],
                edgeChildIds: [...farthest.edgeChildIds],
                lengthActualM: farthest.lengthActualM,
                lengthEquivalentM: farthest.lengthEquivalentM,
                equivalentStatus: farthest.lengthEquivalentM === null ? 'not_determinable' : 'determined',
                lengthState: 'valid_nonnegative'
            };
        }

        // L1候補（相当長基準）：相当長による最遠の室内機経路。相当長が
        // 未入力・不正の辺を含む経路は対象外とし、実長で代用しない。
        // 実長基準のL1候補とは別の経路になることがある。
        const indoorEquivalentPaths = indoorPaths.filter((path) => path.lengthEquivalentM !== null);
        let l1EquivalentCandidate;
        if (indoorEquivalentPaths.length === 0) {
            const reason = indoorPaths.length === 0
                ? '室内機までの経路がありません。'
                : '室内機までの経路の相当長が未入力・非数値、または負数です。';
            l1EquivalentCandidate = notDeterminable(reason);
        } else {
            const farthestEq = indoorEquivalentPaths.reduce((best, path) => (
                path.lengthEquivalentM > best.lengthEquivalentM ? path : best
            ));
            l1EquivalentCandidate = {
                status: 'candidate',
                reason: null,
                leafId: farthestEq.leafId,
                nodeLabels: [...farthestEq.nodeLabels],
                edgeChildIds: [...farthestEq.edgeChildIds],
                lengthActualM: farthestEq.lengthActualM,
                lengthEquivalentM: farthestEq.lengthEquivalentM,
                equivalentStatus: 'determined',
                lengthState: farthestEq.equivalentState
            };
        }
        if (l1Candidate.status === 'candidate') {
            if (l1EquivalentCandidate.status === 'candidate') {
                notes.push({
                    type: 'info',
                    message: `UXE3経路診断：L1候補は実長による最遠経路です（${l1Candidate.leafId}、実長 ${l1Candidate.lengthActualM}m）。相当長基準の最遠経路は${l1EquivalentCandidate.leafId}です（相当長 ${l1EquivalentCandidate.lengthEquivalentM}m）。`
                });
            } else if (!hasValidEquivalentLength) {
                notes.push({
                    type: 'info',
                    message: 'UXE3経路診断：L1候補は実長による最遠経路です。相当長は入力がないため判定不可であり、実長で代用していません。'
                });
            } else {
                notes.push({
                    type: 'info',
                    message: 'UXE3経路診断：L1候補は実長による最遠経路です。相当長が一部の辺で未入力・不正のため、相当長基準のL1候補は判定不可であり、実長で代用していません。'
                });
            }
        }

        // LM候補：L1候補経路上の分岐ノードを決定事項D1の規則で読み替える。
        // LA＝室外第一分岐→第一分岐の辺、LB＝第一分岐→次の分岐の辺。
        let lmCandidate;
        let firstBranchIndex = -1;
        if (l1Candidate.status !== 'candidate') {
            lmCandidate = {
                status: 'not_determinable',
                reason: 'L1候補が特定できないため、LM候補も特定できません。',
                rule: RULE_D1,
                l1LeafId: null,
                outdoorFirstBranchId: null,
                outdoorFirstBranchLabel: null,
                firstBranchId: null,
                firstBranchLabel: null,
                laEdgeChildId: null,
                lbEdgeChildId: null,
                lengthActualM: null,
                lengthEquivalentM: null,
                equivalentStatus: 'not_determinable',
                lengthState: 'missing_or_nonfinite',
                nodeLabels: []
            };
        } else {
            const farthest = indoorValidPaths.reduce((best, path) => (
                path.lengthActualM > best.lengthActualM ? path : best
            ));
            const branchIndexes = [];
            farthest.nodeTypes.forEach((type, index) => {
                if (index > 0 && type === 'branch') branchIndexes.push(index);
            });
            if (branchIndexes.length < 3) {
                lmCandidate = {
                    status: 'not_determinable',
                    reason: 'L1候補経路上に分岐ノードが3つありません（室外第一分岐・第一分岐・次の分岐を特定できません）。',
                    rule: RULE_D1,
                    l1LeafId: farthest.leafId,
                    outdoorFirstBranchId: null,
                    outdoorFirstBranchLabel: null,
                    firstBranchId: null,
                    firstBranchLabel: null,
                    laEdgeChildId: null,
                    lbEdgeChildId: null,
                    lengthActualM: null,
                    lengthEquivalentM: null,
                    equivalentStatus: 'not_determinable',
                    lengthState: 'missing_or_nonfinite',
                    nodeLabels: []
                };
                notes.push({
                    type: 'info',
                    message: 'UXE3経路診断：LM候補を特定できませんでした（L1候補経路上に分岐ノードが3つありません）。'
                });
            } else {
                firstBranchIndex = branchIndexes[1];
                const laEdge = farthest.edges[branchIndexes[1] - 1];
                const lbEdge = farthest.edges[branchIndexes[2] - 1];
                const invalidEdge = [laEdge, lbEdge].find((edge) => edge.lengthState !== 'valid_nonnegative');
                const invalidEqEdge = [laEdge, lbEdge].find((edge) => edge.equivalentState !== 'valid_nonnegative');
                lmCandidate = {
                    status: 'candidate',
                    reason: null,
                    rule: RULE_D1,
                    l1LeafId: farthest.leafId,
                    outdoorFirstBranchId: farthest.nodeIds[branchIndexes[0]],
                    outdoorFirstBranchLabel: farthest.nodeLabels[branchIndexes[0]],
                    firstBranchId: farthest.nodeIds[branchIndexes[1]],
                    firstBranchLabel: farthest.nodeLabels[branchIndexes[1]],
                    laEdgeChildId: laEdge.childId,
                    lbEdgeChildId: lbEdge.childId,
                    lengthActualM: invalidEdge ? null : laEdge.lengthM + lbEdge.lengthM,
                    lengthEquivalentM: invalidEqEdge ? null : laEdge.lengthEquivalentM + lbEdge.lengthEquivalentM,
                    equivalentStatus: invalidEqEdge ? 'not_determinable' : 'determined',
                    lengthState: invalidEdge ? invalidEdge.lengthState : 'valid_nonnegative',
                    nodeLabels: [
                        farthest.nodeLabels[branchIndexes[0]],
                        farthest.nodeLabels[branchIndexes[1]],
                        farthest.nodeLabels[branchIndexes[2]]
                    ]
                };
                notes.push({
                    type: 'info',
                    message: 'UXE3経路診断：LM候補は決定事項D1（2026-10-26）の規則に基づきます。室外第一分岐・第一分岐の対応は図1の確認に基づく決定であり、メーカーの文言による明示的な定義ではありません。'
                });
                if (!invalidEqEdge) {
                    notes.push({
                        type: 'info',
                        message: `UXE3経路診断：LM候補の相当長は LA＋LB の相当長の合計です（${lmCandidate.lengthEquivalentM}m）。`
                    });
                }
            }
        }

        // ΔL候補：第一分岐（決定事項D1）から各室内機までの経路長の最大値と最小値の差。
        let deltaLCandidate;
        if (lmCandidate.status !== 'candidate') {
            deltaLCandidate = {
                status: 'not_determinable',
                reason: '第一分岐を特定できないため、ΔL候補も特定できません。',
                rule: RULE_D1,
                fromNodeId: null,
                fromNodeLabel: null,
                terminalCount: 0,
                maxLengthM: null,
                minLengthM: null,
                deltaM: null,
                maxLengthEquivalentM: null,
                minLengthEquivalentM: null,
                deltaEquivalentM: null,
                equivalentStatus: 'not_determinable',
                equivalentTerminalCount: 0,
                lengthState: 'missing_or_nonfinite'
            };
        } else {
            const farthest = indoorValidPaths.reduce((best, path) => (
                path.lengthActualM > best.lengthActualM ? path : best
            ));
            const prefixLabels = farthest.nodeLabels.slice(0, firstBranchIndex + 1);
            const suffixes = [];
            const eqSuffixes = [];
            indoorPaths.forEach((path) => {
                const sharesPrefix = prefixLabels.every((label, index) => path.nodeLabels[index] === label);
                if (!sharesPrefix) return;
                const suffixEdges = path.edges.slice(firstBranchIndex);
                const invalid = suffixEdges.find((edge) => edge.lengthState !== 'valid_nonnegative');
                if (!invalid) suffixes.push(suffixEdges.reduce((sum, edge) => sum + edge.lengthM, 0));
                const invalidEq = suffixEdges.find((edge) => edge.equivalentState !== 'valid_nonnegative');
                if (!invalidEq) eqSuffixes.push(suffixEdges.reduce((sum, edge) => sum + edge.lengthEquivalentM, 0));
            });
            if (suffixes.length === 0) {
                deltaLCandidate = {
                    status: 'not_determinable',
                    reason: '第一分岐から室内機までの有効な経路長がありません。',
                    rule: RULE_D1,
                    fromNodeId: lmCandidate.firstBranchId,
                    fromNodeLabel: farthest.nodeLabels[firstBranchIndex],
                    terminalCount: 0,
                    maxLengthM: null,
                    minLengthM: null,
                    deltaM: null,
                    maxLengthEquivalentM: null,
                    minLengthEquivalentM: null,
                    deltaEquivalentM: null,
                    equivalentStatus: 'not_determinable',
                    equivalentTerminalCount: 0,
                    lengthState: 'missing_or_nonfinite'
                };
            } else {
                const maxLengthM = Math.max(...suffixes);
                const minLengthM = Math.min(...suffixes);
                const maxLengthEquivalentM = eqSuffixes.length === 0 ? null : Math.max(...eqSuffixes);
                const minLengthEquivalentM = eqSuffixes.length === 0 ? null : Math.min(...eqSuffixes);
                deltaLCandidate = {
                    status: 'candidate',
                    reason: null,
                    rule: RULE_D1,
                    fromNodeId: lmCandidate.firstBranchId,
                    fromNodeLabel: farthest.nodeLabels[firstBranchIndex],
                    terminalCount: suffixes.length,
                    maxLengthM,
                    minLengthM,
                    deltaM: maxLengthM - minLengthM,
                    maxLengthEquivalentM,
                    minLengthEquivalentM,
                    deltaEquivalentM: eqSuffixes.length === 0 ? null : maxLengthEquivalentM - minLengthEquivalentM,
                    equivalentStatus: eqSuffixes.length === 0 ? 'not_determinable' : 'determined',
                    equivalentTerminalCount: eqSuffixes.length,
                    lengthState: 'valid_nonnegative'
                };
                if (eqSuffixes.length > 0) {
                    notes.push({
                        type: 'info',
                        message: `UXE3経路診断：ΔL候補の相当長基準の差も特定できました（最大 ${maxLengthEquivalentM}m・最小 ${minLengthEquivalentM}m・差 ${deltaLCandidate.deltaEquivalentM}m）。`
                    });
                }
            }
        }

        return {
            seriesId: 'fsv_uxe3',
            leafPaths,
            l1Candidate,
            l1EquivalentCandidate,
            lmCandidate,
            deltaLCandidate,
            summary: {
                totalEdges,
                totalLengthM,
                longestEdgeM,
                invalidLengthEdges,
                leafPaths: leafPaths.length,
                indoorLeafPaths: indoorPaths.length,
                truncated
            },
            notes
        };
    }

    /**
     * UXE3 の長配管条件（表1 脚注＊2・＊3、優先度C・実装順序6）を判定する。
     * ＊2：L1相当長が 90m を超える場合、主管 LM の吸込管・吐出管・液管を
     * 表7のラダーで1ランク増径する（LM 全体の一律増径、分割なし）。
     * 判定は相当長基準のみで行う。L1候補経路の相当長が未入力・非数値、
     * または負数の場合は判定不可とし、実長で代用しない（決定事項D4・
     * 実装順序3の相当長入力の扱いと同じ）。＊2 の適用可否は本メソッドが
     * 判定し、＊3 の適用は computeUxE3LmSplit が行う。＊2 と ＊3 の排他は、
     * ＊2 の条件が満たされた場合に ＊3 の分割を抑制することで実現する
     * （calculateSystem 参照）。本メソッドは純粋な判定であり、totals を
     * 変更しない。BOM への反映は applyUxE3Star2ToTotals が行う。
     * ＊2 でレデューサーは計上しない。＊2 は LM 内で径を変えない一律増径
     * であり、LM の両端の径段差は分岐継手の位置に重なるため、本工程では
     * 新たな境界として数えない（§18参照）。
     */
    evaluateUxE3LongPipeConditions(pathAudit, outdoorKw) {
        const RULE_LONG_PIPE = '表1 脚注＊2・＊3（決定事項D4、2026-10-27）：＊2 は L1相当長＞90m の場合に主管 LM の吸込・吐出・液管を1ランク増径する。＊3 は＊2以外の場合で LM 実長＞50m のときに最初の 50m の吸込・吐出管を1ランク増径する。1ランクアップの径ラダーは表7のリスト（6.35、9.52、12.7、15.88、19.05、22.22、25.4、28.58、31.8、38.1、41.28）。';
        const STAR2_THRESHOLD_M = 90;
        const star2Base = (status, conditionMet, reason) => ({
            status,
            conditionMet,
            reason,
            l1EquivalentM: null,
            thresholdM: STAR2_THRESHOLD_M,
            baseDiameters: null,
            upsizedDiameters: null,
            lmLengthActualM: null,
            totalsAdjust: null,
            applied: false
        });
        const finish = (star2, appliedRule, reason) => ({
            rule: RULE_LONG_PIPE,
            thresholdM: { star2: STAR2_THRESHOLD_M, star3: 50 },
            l1EquivalentM: star2.l1EquivalentM,
            lmLengthActualM: star2.lmLengthActualM,
            star2,
            star3: null,
            appliedRule,
            reason
        });
        if (!pathAudit || !pathAudit.l1Candidate) {
            const star2 = star2Base('not_determinable', false, '経路診断がありません。');
            return finish(star2, 'not_determinable', star2.reason);
        }
        if (pathAudit.summary && pathAudit.summary.truncated) {
            const star2 = star2Base('not_determinable', false, '経路列挙が上限で打ち切られたため、L1相当長の特定が不完全な可能性があります。');
            return finish(star2, 'not_determinable', star2.reason);
        }
        const l1 = pathAudit.l1Candidate;
        if (l1.status !== 'candidate') {
            const star2 = star2Base('not_determinable', false, l1.reason || 'L1候補が特定できません。');
            return finish(star2, 'not_determinable', star2.reason);
        }
        const l1Eq = l1.lengthEquivalentM;
        if (l1Eq === null || !Number.isFinite(l1Eq)) {
            const star2 = star2Base('not_determinable', false, 'L1の相当長が未入力・非数値、または負数のため、＊2（L1相当長＞90m）の判定ができません。実長で代用していません。');
            return finish(star2, 'not_determinable', star2.reason);
        }
        // LM の実長（＊2 の増径区間の長さ）。LM候補が特定できない場合は
        // ＊2 を BOM へ反映できないため判定不可とする（条件自体は満たす）。
        const lm = pathAudit.lmCandidate;
        const lmLength = (lm && lm.status === 'candidate' && Number.isFinite(lm.lengthActualM)) ? lm.lengthActualM : null;
        const base = this.selectPipeSizeForSegment('upstream_three_pipe', { outdoorKw }, false);
        const upsized = {
            liquid: this.sizeUpOneRankTable7(base.liquid),
            dischargeGas: this.sizeUpOneRankTable7(base.dischargeGas),
            suctionGas: this.sizeUpOneRankTable7(base.suctionGas)
        };
        const star2 = star2Base('not_applied', false, null);
        star2.l1EquivalentM = l1Eq;
        star2.baseDiameters = { liquid: base.liquid, dischargeGas: base.dischargeGas, suctionGas: base.suctionGas };
        star2.upsizedDiameters = { ...upsized };
        star2.lmLengthActualM = lmLength;
        if (l1Eq <= STAR2_THRESHOLD_M) {
            star2.reason = `L1相当長（${l1Eq}m）が 90m を超えていません。`;
            return finish(star2, 'none', star2.reason);
        }
        // L1相当長が 90m を超えるため ＊2 の条件は満たす。
        star2.conditionMet = true;
        if (lmLength === null) {
            star2.status = 'not_determinable';
            star2.reason = 'L1相当長が 90m を超えていますが、LM候補が特定できないため、＊2 の増径を BOM へ反映できません。';
            return finish(star2, 'not_determinable', star2.reason);
        }
        if (upsized.liquid === base.liquid && upsized.dischargeGas === base.dischargeGas && upsized.suctionGas === base.suctionGas) {
            star2.status = 'not_applied';
            star2.reason = 'L1相当長が 90m を超えていますが、基準径が既に表7ラダーの上限であり、増径する径がありません。';
            return finish(star2, 'none', star2.reason);
        }
        star2.status = 'applied';
        star2.applied = true;
        star2.totalsAdjust = {
            lmLengthM: lmLength,
            liquid: { from: base.liquid, to: upsized.liquid, lengthM: lmLength },
            discharge: { from: base.dischargeGas, to: upsized.dischargeGas, lengthM: lmLength },
            suction: { from: base.suctionGas, to: upsized.suctionGas, lengthM: lmLength }
        };
        return finish(star2, 'star2', '＊2 を適用しました。');
    }

    /**
     * evaluateUxE3LongPipeConditions の ＊2 判定を BOM 集計（totals）へ反映する。
     * LM 全長（LA＋LB）を基準径の集計から増径後の径の集計へ移す（吸込・
     * 吐出・液管の3管）。＊2 は LM 内で径を変えないため、レデューサーは
     * 計上しない。totalLength は変えない。
     * 安全ガード：基準径の集計に LM 全長が十分に含まれていない場合
     * （LM 辺が循環・共有ノードで計算から除外された場合など）は集計を
     * 壊さないよう適用せず、star2 を not_applied に書き換えて false を返す。
     * JSON 由来のツリーでは起きない。
     */
    applyUxE3Star2ToTotals(totals, star2) {
        if (!totals || !star2 || star2.status !== 'applied' || !star2.totalsAdjust) return false;
        const adjust = star2.totalsAdjust;
        const liquidBase = totals.liquidPipes[adjust.liquid.from] || 0;
        const dischargeBase = totals.highGasPipes[adjust.discharge.from] || 0;
        const suctionBase = totals.lowGasPipes[adjust.suction.from] || 0;
        const needLiquid = adjust.liquid.to !== adjust.liquid.from ? adjust.lmLengthM : 0;
        const needDischarge = adjust.discharge.to !== adjust.discharge.from ? adjust.lmLengthM : 0;
        const needSuction = adjust.suction.to !== adjust.suction.from ? adjust.lmLengthM : 0;
        if (liquidBase < needLiquid || dischargeBase < needDischarge || suctionBase < needSuction) {
            star2.status = 'not_applied';
            star2.reason = 'LM 辺の長さが BOM 集計に十分に含まれていないため、＊2 の増径を適用しませんでした（循環・共有ノードの可能性があります）。';
            star2.applied = false;
            return false;
        }
        if (adjust.liquid.to !== adjust.liquid.from) {
            totals.liquidPipes[adjust.liquid.from] = liquidBase - adjust.lmLengthM;
            totals.liquidPipes[adjust.liquid.to] = (totals.liquidPipes[adjust.liquid.to] || 0) + adjust.lmLengthM;
        }
        if (adjust.discharge.to !== adjust.discharge.from) {
            totals.highGasPipes[adjust.discharge.from] = dischargeBase - adjust.lmLengthM;
            totals.highGasPipes[adjust.discharge.to] = (totals.highGasPipes[adjust.discharge.to] || 0) + adjust.lmLengthM;
        }
        if (adjust.suction.to !== adjust.suction.from) {
            totals.lowGasPipes[adjust.suction.from] = suctionBase - adjust.lmLengthM;
            totals.lowGasPipes[adjust.suction.to] = (totals.lowGasPipes[adjust.suction.to] || 0) + adjust.lmLengthM;
        }
        star2.applied = true;
        return true;
    }

    /** ＊2 適用時の警告パネル用の文言（情報）。適用された規則を明記する。 */
    buildUxE3Star2WarningMessage(star2) {
        const pipes = [
            { label: '吸込', key: 'suction' },
            { label: '吐出', key: 'discharge' },
            { label: '液', key: 'liquid' }
        ];
        const changed = star2.totalsAdjust
            ? pipes.filter(({ key }) => star2.totalsAdjust[key].to !== star2.totalsAdjust[key].from)
            : [];
        const detail = changed
            .map(({ label, key }) => `${label} φ${star2.totalsAdjust[key].from}→φ${star2.totalsAdjust[key].to}`)
            .join('、');
        const names = changed.map(({ label }) => `${label}管`).join('・') || '主管';
        return `【長配管条件＊2適用】L1相当長 ${star2.l1EquivalentM}m が 90m を超えるため、主管 LM の${names}を1ランク増径しました${detail ? `（${detail}）` : ''}。＊3 は適用しません。`;
    }

    /** ＊3 適用時の警告パネル用の文言（情報）。適用された規則を明記する。 */
    buildUxE3Star3WarningMessage(longPipe, lmSplit) {
        const lm = lmSplit.lmLengthActualM;
        if (longPipe.star2.status === 'not_determinable') {
            return `【長配管条件＊3適用】L1相当長が判定できないため＊2 の判定は行わず、LM 実長 ${lm}m が 50m を超えるため最初の 50m の吸込管・吐出管を1ランク増径しました。液管は増径しません。`;
        }
        return `【長配管条件＊3適用】L1相当長 ${longPipe.l1EquivalentM}m が 90m 以下のため＊2 は適用せず、LM 実長 ${lm}m が 50m を超えるため最初の 50m の吸込管・吐出管を1ランク増径しました。液管は増径しません。`;
    }

    /**
     * UXE3 の LM 50m 分割（表1 脚注＊3、優先度C・実装順序4）を算出する。
     * 決定事項D4（2026-10-27）：50m は LM の室外機側の端（室外第一分岐）から測る。
     * LM 実長が 50m を超える場合、最初の 50m の吸込管・吐出管を表7のラダーで
     * 1ランク増径し、残りは表4の基準径のままとする。液管は＊3 では増径しない。
     * 50m 境界は LM 経路上の位置であり、辺の途中またはノード上に落ちる。
     * 辺単位に丸めない。＊2 との排他は options.suppressStar3 で行う
     * （実装順序6：＊2 の条件が満たされた場合に ＊3 を適用しない）。
     * 本メソッドは純粋な算出であり、totals を変更しない。BOM への反映は
     * applyUxE3LmSplitToTotals が行う。基準径は LM 辺と同じ上流3管（室外機容量
     * 基準）で求める。手動増径は UXE3 では無効のため isManualSizeUp は false
     * （processNodeSizing と同じ）。
     */
    computeUxE3LmSplit(pathAudit, outdoorKw, options = {}) {
        const RULE_D4 = '決定事項D4（2026-10-27）：＊3 の50m分割は LM の室外機側の端（室外第一分岐）から測る。1ランクアップの径ラダーは表7のリスト（6.35、9.52、12.7、15.88、19.05、22.22、25.4、28.58、31.8、38.1、41.28）。31.75と31.8は同一管径の表記ゆれ、22.2は22.22の誤記。ガス管の上限は41.28（38.1で止めない）。';
        const THRESHOLD_M = 50;
        const baseRecord = (status, reason) => ({
            status,
            reason,
            rule: RULE_D4,
            thresholdM: THRESHOLD_M,
            lmLengthActualM: null,
            baseDiameters: null,
            upsizedDiameters: null,
            edges: [],
            boundaries: [],
            reducerCount: 0,
            applied: false,
            totalsAdjust: null
        });
        if (!pathAudit || !pathAudit.lmCandidate) {
            return baseRecord('not_determinable', '経路診断がありません。');
        }
        const lm = pathAudit.lmCandidate;
        if (lm.status !== 'candidate') {
            return baseRecord('not_determinable', lm.reason || 'LM候補が特定できません。');
        }
        if (pathAudit.summary && pathAudit.summary.truncated) {
            return baseRecord('not_determinable', '経路列挙が上限で打ち切られたため、LM の特定が不完全な可能性があります。');
        }
        if (lm.lengthActualM === null || !Number.isFinite(lm.lengthActualM)) {
            return baseRecord('not_determinable', 'LM の実長が未入力・非数値、または負数です。');
        }
        if (lm.lengthActualM <= THRESHOLD_M) {
            const record = baseRecord('not_applied', `LM 実長（${lm.lengthActualM}m）が 50m を超えていません。`);
            record.lmLengthActualM = lm.lengthActualM;
            return record;
        }
        // ＊2 の条件が満たされた場合は ＊3 を適用しない（表1 脚注＊3
        // 「＊2以外の場合でも」による排他、実装順序6）。
        if (options && options.suppressStar3) {
            const record = baseRecord('not_applied', options.suppressionReason || '＊2 が適用されるため、＊3 は適用しません。');
            record.lmLengthActualM = lm.lengthActualM;
            return record;
        }
        // L1候補経路から LA・LB 辺の長さを取り出す。
        const l1Path = (pathAudit.leafPaths || []).find((path) => path.leafId === lm.l1LeafId);
        if (!l1Path) {
            return baseRecord('not_determinable', 'L1候補経路が見つかりません。');
        }
        const laEdge = l1Path.edges.find((edge) => edge.childId === lm.laEdgeChildId);
        const lbEdge = l1Path.edges.find((edge) => edge.childId === lm.lbEdgeChildId);
        if (!laEdge || !lbEdge || !Number.isFinite(laEdge.lengthM) || !Number.isFinite(lbEdge.lengthM)) {
            return baseRecord('not_determinable', 'LA・LB 辺の長さが特定できません。');
        }
        const laLen = laEdge.lengthM;
        const lbLen = lbEdge.lengthM;
        const base = this.selectPipeSizeForSegment('upstream_three_pipe', { outdoorKw }, false);
        const upsizedSuction = this.sizeUpOneRankTable7(base.suctionGas);
        const upsizedDischarge = this.sizeUpOneRankTable7(base.dischargeGas);
        if (upsizedSuction === base.suctionGas && upsizedDischarge === base.dischargeGas) {
            const record = baseRecord('not_applied', '基準径が既に表7ラダーの上限であり、増径する径がありません。');
            record.lmLengthActualM = lm.lengthActualM;
            return record;
        }
        const baseDiameters = { liquid: base.liquid, dischargeGas: base.dischargeGas, suctionGas: base.suctionGas };
        const upsizedDiameters = { dischargeGas: upsizedDischarge, suctionGas: upsizedSuction };
        // LM 経路上の位置（室外第一分岐＝0m）で分割する。LA は [0, laLen]、
        // LB は [laLen, laLen + lbLen]。境界は 50m の位置。
        const splitEdge = (segment, edgeChildId, lengthM, lmStartM) => {
            const edgeEnd = lmStartM + lengthM;
            const upsized = { liquid: base.liquid, dischargeGas: upsizedDischarge, suctionGas: upsizedSuction };
            const standard = { liquid: base.liquid, dischargeGas: base.dischargeGas, suctionGas: base.suctionGas };
            const segments = [];
            if (edgeEnd <= THRESHOLD_M) {
                segments.push({ fromM: lmStartM, toM: edgeEnd, lengthM, kind: 'upsized', diameters: { ...upsized } });
            } else if (lmStartM >= THRESHOLD_M) {
                segments.push({ fromM: lmStartM, toM: edgeEnd, lengthM, kind: 'standard', diameters: { ...standard } });
            } else {
                segments.push({ fromM: lmStartM, toM: THRESHOLD_M, lengthM: THRESHOLD_M - lmStartM, kind: 'upsized', diameters: { ...upsized } });
                segments.push({ fromM: THRESHOLD_M, toM: edgeEnd, lengthM: edgeEnd - THRESHOLD_M, kind: 'standard', diameters: { ...standard } });
            }
            return { segment, edgeChildId, lengthM, lmStartM, segments };
        };
        const edges = [
            splitEdge('LA', lm.laEdgeChildId, laLen, 0),
            splitEdge('LB', lm.lbEdgeChildId, lbLen, laLen)
        ];
        // 境界は 50m の位置1か所。LA の終端と一致すれば第一分岐ノード上。
        const onNode = laLen === THRESHOLD_M;
        const boundaries = [{
            positionM: THRESHOLD_M,
            nodeId: onNode ? lm.firstBranchId : null,
            edgeChildId: onNode ? null : (laLen > THRESHOLD_M ? lm.laEdgeChildId : lm.lbEdgeChildId),
            onNode
        }];
        return {
            status: 'applied',
            reason: null,
            rule: RULE_D4,
            thresholdM: THRESHOLD_M,
            lmLengthActualM: lm.lengthActualM,
            baseDiameters,
            upsizedDiameters,
            edges,
            boundaries,
            reducerCount: 1,
            applied: true,
            totalsAdjust: {
                upsizedLengthM: THRESHOLD_M,
                standardLengthM: lm.lengthActualM - THRESHOLD_M,
                suction: { from: base.suctionGas, to: upsizedSuction, lengthM: THRESHOLD_M },
                discharge: { from: base.dischargeGas, to: upsizedDischarge, lengthM: THRESHOLD_M }
            }
        };
    }

    /**
     * computeUxE3LmSplit の算出結果を BOM 集計（totals）へ反映する。
     * 増径区間の長さを基準径の集計から増径後の径の集計へ移し、境界の
     * レデューサー（異径継手・現地調達）を継手 BOM へ1個計上する。
     * 液管は＊3 では増径しないため触らない。totalLength は変えない。
     * 安全ガード：基準径の集計に増径区間の長さが十分に含まれていない場合
     * （LM 辺が循環・共有ノードで計算から除外された場合など）は集計を
     * 壊さないよう適用せず、lmSplit を not_applied に書き換えて false を返す。
     * JSON 由来のツリーでは起きない。
     */
    applyUxE3LmSplitToTotals(totals, lmSplit) {
        if (!totals || !lmSplit || lmSplit.status !== 'applied' || !lmSplit.totalsAdjust) return false;
        const adjust = lmSplit.totalsAdjust;
        const suctionBase = totals.lowGasPipes[adjust.suction.from] || 0;
        const dischargeBase = totals.highGasPipes[adjust.discharge.from] || 0;
        if (suctionBase < adjust.suction.lengthM || dischargeBase < adjust.discharge.lengthM) {
            lmSplit.status = 'not_applied';
            lmSplit.reason = 'LM 辺の長さが BOM 集計に十分に含まれていないため、分割を適用しませんでした（循環・共有ノードの可能性があります）。';
            lmSplit.applied = false;
            return false;
        }
        if (adjust.suction.to !== adjust.suction.from) {
            totals.lowGasPipes[adjust.suction.from] = suctionBase - adjust.suction.lengthM;
            totals.lowGasPipes[adjust.suction.to] = (totals.lowGasPipes[adjust.suction.to] || 0) + adjust.suction.lengthM;
        }
        if (adjust.discharge.to !== adjust.discharge.from) {
            totals.highGasPipes[adjust.discharge.from] = dischargeBase - adjust.discharge.lengthM;
            totals.highGasPipes[adjust.discharge.to] = (totals.highGasPipes[adjust.discharge.to] || 0) + adjust.discharge.lengthM;
        }
        totals.joints['レデューサー（異径継手・現地調達）'] = (totals.joints['レデューサー（異径継手・現地調達）'] || 0) + lmSplit.reducerCount;
        lmSplit.applied = true;
        return true;
    }

    /**
     * UXE3電磁弁キットの並列グループを、データ変更なしで監査する（優先度C・実装順序5、C5）。
     * 160形キットの容量範囲は 5.6kW（超え）〜16.0kW（含む）。下流合計が
     * 16.0kW を超えるキットノードは、160形キット2個の並列グループとして
     * 扱う（設計メモの推奨案（a）：1個のキットグループノードに
     * parallelCount 2 と内部分岐を持たせる）。配管長はグループ単位の辺で
     * 1本分のみ集計し、同じ長さを2本分として数えない。並列間の配管長の
     * 割り当ては未決事項D5のため、内部分岐の長さは判定不可とする。
     * 監査自体は読み取り専用であり、BOM への反映は processNodeSizing が
     * getSolenoidKitParallelCount で行う（同じ判定を共有する）。
     */
    auditUxE3KitGroups(rootNode) {
        const KIT_MAX_KW = 16.0; // 160形キットの上限（含む）
        const PARALLEL_MAX_KW = 32.0; // 160形×2の上限
        const groups = [];
        const warnings = [];
        const notes = [];
        const summary = { kitNodes: 0, parallelGroups: 0, totalKits: 0 };
        if (!rootNode || typeof rootNode !== 'object' || rootNode.type !== 'outdoor') {
            return {
                seriesId: 'fsv_uxe3', groups, summary, notes,
                warnings: [{ type: 'danger', message: 'UXE3キットグループ監査には outdoor をルートとする有効なツリーが必要です。' }]
            };
        }
        const visited = new WeakSet();
        const activePath = new WeakSet();
        const walk = (node, path) => {
            if (!node || typeof node !== 'object') return;
            if (activePath.has(node)) {
                warnings.push({
                    type: 'danger',
                    message: `循環参照を検出したため、その接続先の監査を停止しました（${path}）。`
                });
                return;
            }
            // 共有ノードは1回だけ数える。共有自体の警告は区間監査・計算側が出すため、ここでは出さない。
            if (visited.has(node)) return;
            visited.add(node);
            activePath.add(node);
            if (node.type === 'solenoid_kit') {
                const downstreamKw = this.getDownstreamCapacity(node);
                const indoorCount = this.countIndoorUnitsDownstream(node);
                const modelNumber = this.generateSolenoidKitModel(node);
                const parallelCount = downstreamKw > KIT_MAX_KW ? 2 : 1;
                const isParallel = parallelCount > 1;
                summary.kitNodes += 1;
                summary.totalKits += parallelCount;
                if (isParallel) summary.parallelGroups += 1;
                const group = {
                    nodeId: node.id || null,
                    nodeName: node.name || null,
                    modelNumber,
                    downstreamKw,
                    indoorCount,
                    parallelCount,
                    isParallel,
                    internalBranch: isParallel ? {
                        branches: 2,
                        // 前後の分岐配管の長さ・径の割り当ては未決（D5）。グループ単位の
                        // 辺長のみを集計し、同じ長さを2本分として数えない。
                        lengthApportionment: 'not_determinable',
                        note: '並列キットの前後分岐の配管長・径の割り当ては未決事項D5のため未計上。グループ単位の辺長のみを集計する。'
                    } : null,
                    beyondParallelPair: downstreamKw > PARALLEL_MAX_KW,
                    reason: isParallel
                        ? `下流合計 ${downstreamKw}kW が160形キットの上限 16.0kW を超えるため、160形キット2個の並列として計上する。`
                        : `下流合計 ${downstreamKw}kW は160形キットの範囲内のため、キット1個として計上する。`
                };
                groups.push(group);
                if (isParallel) {
                    warnings.push({
                        type: 'info',
                        message: `【並列電磁弁キット】下流合計 ${downstreamKw}kW が160形キットの上限 16.0kW を超えるため、電磁弁キット ${modelNumber} を2個並列として計上します。配管長はグループ単位で1本分のみ集計します。`
                    });
                }
                if (downstreamKw > PARALLEL_MAX_KW) {
                    warnings.push({
                        type: 'danger',
                        message: `電磁弁キットの下流合計 ${downstreamKw}kW は並列2個（160形×2）の容量範囲（32.0kW）を超えています。キットを分けてください。(${node.name || node.type || '名称不明'})`
                    });
                    notes.push(`キット ${group.nodeId || group.nodeName || ''} の下流合計が並列ペアの上限を超えている。3個以上の並列規則は定義していない。`);
                }
            }
            const children = Array.isArray(node.children) ? node.children : [];
            children.forEach((child, index) => {
                walk(child, `${path}/${child && child.id ? child.id : `${child && child.type ? child.type : 'node'}[${index}]`}`);
            });
            activePath.delete(node);
        };
        walk(rootNode, rootNode.id || 'root');
        return { seriesId: 'fsv_uxe3', groups, summary, notes, warnings };
    }

    /**
     * 組合せ室外機の構成を合計容量から探す（優先度C・実装順序5、C6）。
     * 50.4kW→PA-P504UXE3、56.0kW→PA-P560UXE3。見つからない場合は null。
     */
    getOutdoorGroupComposition(capacityKw) {
        if (typeof capacityKw !== 'number' || !Number.isFinite(capacityKw)) return null;
        const found = (this.OUTDOOR_GROUP_COMPOSITION || []).find(
            (entry) => Math.abs(entry.totalKw - capacityKw) < 0.1
        );
        return found || null;
    }

    /**
     * 組合せ室外機の室外機グループを、データ変更なしで監査する（優先度C・実装順序5、C6）。
     * 18HP（PA-P504UXE3）・20HP（PA-P560UXE3）の室外機ノードを構成ユニット
     * に分解し、室外接続主配管 LO とバランス管を記録する。LO の径は表4
     * （selectThreePipeSize）で組合せ合計容量を基準として選定する（C2 の
     * 規則。仕様書の接続管径と一致する）。LO の長さはルートの loLengthM
     * （室外接続主配管の実長）で与える。未入力の場合は判定不可とし、実長
     * で代用しない。バランス管 φ9.52 の長さは LO と同じ長さとする（同じ
     * 2台の間を併走する配管である）。グループから最初の分岐ノードへの辺は
     * 決定事項D1の規則により室外機側接続配管 ℓA であり、LA ではない。
     * 監査自体は読み取り専用であり、BOM への反映は
     * applyUxE3OutdoorGroupToTotals が行う。
     */
    auditUxE3OutdoorGroups(rootNode) {
        const RULE_D1 = '決定事項D1（2026-10-26）：L1候補経路上で最初に現れる分岐ノードを室外第一分岐、その次の分岐ノードを第一分岐とする。室外機グループから最初の分岐ノードへの辺は室外機側接続配管 ℓA であり、LA ではない。';
        const BALANCE_PIPE_DIAMETER = 9.52;
        const baseRecord = (status, reason) => ({
            seriesId: 'fsv_uxe3',
            status,
            reason,
            rule: RULE_D1,
            firstBranchEdge: 'lA',
            groupModel: null,
            groupCapacityKw: rootNode && typeof rootNode.capacity === 'number' ? rootNode.capacity : null,
            members: [],
            loEdges: [],
            balancePipe: null,
            totalsAdjust: null,
            applied: false,
            notes: [],
            warnings: []
        });
        if (!rootNode || typeof rootNode !== 'object' || rootNode.type !== 'outdoor') {
            const record = baseRecord('not_determinable', '室外機グループ監査には outdoor をルートとする有効なツリーが必要です。');
            record.warnings.push({ type: 'danger', message: 'UXE3室外機グループ監査には outdoor をルートとする有効なツリーが必要です。' });
            return record;
        }
        const composition = this.getOutdoorGroupComposition(rootNode.capacity);
        if (!composition) {
            const record = baseRecord('not_applicable', '単体機のため室外機グループは存在しない。');
            record.groupCapacityKw = rootNode.capacity;
            return record;
        }
        // LO の径は表4で組合せ合計容量を基準として選定する。仕様書の接続管径
        // （吸込 φ28.58／吐出 φ22.22／液 φ15.88）と一致する。吐出の表記は
        // エンジンの既存値 22.2（表記ゆれ D2、22.22 と同一管）である。
        const loSizes = this.selectThreePipeSize(composition.totalKw, false);
        const loDiameters = { liquid: loSizes.liquid, dischargeGas: loSizes.dischargeGas, suctionGas: loSizes.suctionGas };
        const tipMember = composition.members[composition.members.length - 1];
        const nearMember = composition.members[0];
        const record = baseRecord('not_determinable', null);
        record.groupModel = composition.model;
        record.groupCapacityKw = composition.totalKw;
        record.members = composition.members.map((m) => ({ model: m.model, capacity: m.capacity, position: m.position }));
        record.notes.push('D6未決：室外第一分岐が構成ユニットの合流点かその先の分岐かは未決。グループから最初の分岐ノードへの辺は D1 の規則により ℓA として扱う。');
        record.notes.push(`LO の径は表4で組合せ合計容量 ${composition.totalKw}kW を基準として選定し、仕様書の接続管径（吸込 φ28.58／吐出 φ22.22／液 φ15.88）と一致する。吐出の表記はエンジンの既存値 22.2（表記ゆれ D2、22.22 と同一管）である。`);
        const rawLo = rootNode.loLengthM;
        const loMissing = rawLo === undefined || rawLo === null;
        const loValid = typeof rawLo === 'number' && Number.isFinite(rawLo) && rawLo >= 0;
        const loEdgeTemplate = {
            fromMember: tipMember.model,
            fromPosition: tipMember.position,
            toMember: nearMember.model,
            toPosition: nearMember.position,
            diameters: { ...loDiameters }
        };
        if (loMissing) {
            record.status = 'not_determinable';
            record.reason = '室外接続主配管 LO の長さが未入力のため、LO・バランス管の長さは BOM へ計上していない。';
            record.loEdges = [{ ...loEdgeTemplate, lengthM: null, lengthState: 'missing_or_nonfinite' }];
            record.balancePipe = { diameter: BALANCE_PIPE_DIAMETER, lengthM: null, lengthState: 'missing_or_nonfinite' };
            record.notes.push('LO の長さが未入力のため、LO・バランス管の長さは BOM へ計上していない。');
            return record;
        }
        if (!loValid) {
            record.status = 'not_determinable';
            record.reason = '室外接続主配管 LO の長さが非数値・非有限、または負数のため、LO・バランス管の長さは BOM へ計上していない。';
            record.loEdges = [{ ...loEdgeTemplate, lengthM: null, lengthState: 'missing_or_nonfinite' }];
            record.balancePipe = { diameter: BALANCE_PIPE_DIAMETER, lengthM: null, lengthState: 'missing_or_nonfinite' };
            record.warnings.push({ type: 'danger', message: '室外接続主配管 LO の長さが未入力・非数値、または負数です。LO・バランス管の長さは BOM へ計上しません。' });
            return record;
        }
        record.status = 'applied';
        record.reason = null;
        record.applied = true;
        record.loEdges = [{ ...loEdgeTemplate, lengthM: rawLo, lengthState: 'valid' }];
        record.balancePipe = { diameter: BALANCE_PIPE_DIAMETER, lengthM: rawLo, lengthState: 'valid' };
        record.totalsAdjust = {
            liquidPipes: { [loDiameters.liquid]: rawLo },
            highGasPipes: { [loDiameters.dischargeGas]: rawLo },
            lowGasPipes: { [loDiameters.suctionGas]: rawLo },
            balancePipes: { [BALANCE_PIPE_DIAMETER]: rawLo }
        };
        record.warnings.push({
            type: 'info',
            message: `【組合せ室外機】${composition.model}（${composition.members.map((m) => m.model).join('＋')}）の室外機グループとして処理しました。室外接続主配管 LO（吸込 φ${loDiameters.suctionGas}／吐出 φ${loDiameters.dischargeGas}／液 φ${loDiameters.liquid}、${rawLo}m）とバランス管 φ${BALANCE_PIPE_DIAMETER}（${rawLo}m）を BOM へ計上しました。`
        });
        return record;
    }

    /**
     * auditUxE3OutdoorGroups の算出結果を BOM 集計（totals）へ反映する。
     * LO の3管分の長さとバランス管の長さを加算する（純粋な加算であり、
     * 基準径からの移動ではない）。totalLength は変えない（LO はグループ
     * 内部の辺であり、ツリーの辺ではないため）。
     */
    applyUxE3OutdoorGroupToTotals(totals, outdoorGroups) {
        if (!totals || !outdoorGroups || outdoorGroups.status !== 'applied' || !outdoorGroups.totalsAdjust) return false;
        const adjust = outdoorGroups.totalsAdjust;
        const addBucket = (bucketName, entries) => {
            if (!entries) return;
            if (!totals[bucketName]) totals[bucketName] = {};
            for (const [diameter, length] of Object.entries(entries)) {
                totals[bucketName][diameter] = (totals[bucketName][diameter] || 0) + length;
            }
        };
        addBucket('liquidPipes', adjust.liquidPipes);
        addBucket('highGasPipes', adjust.highGasPipes);
        addBucket('lowGasPipes', adjust.lowGasPipes);
        addBucket('balancePipes', adjust.balancePipes);
        return true;
    }

    // 旧UXE3 18HPデータのみ、公式50.4kW定格に合わせる。別シリーズや他の容量は変更しない。
    migrateLegacyOutdoorCapacity(rootNode, seriesId) {
        if (seriesId !== 'fsv_uxe3' || !rootNode || rootNode.type !== 'outdoor') return false;
        if (typeof rootNode.capacity !== 'number' || Math.abs(rootNode.capacity - 50.0) > 0.001) return false;
        rootNode.capacity = 50.4;
        return true;
    }

    processNodeSizing(node, seriesId, isManualSizeUp, inSolenoidDownstream, outdoorCap, totals, warnings, seen = null) {
        if (!node || typeof node !== 'object') return;
        if (!seen) seen = { active: new Set(), done: new Set() };
        if (seen.active.has(node)) {
            warnings.push({
                type: 'danger',
                message: `循環参照を検出したため、その接続先の計算を停止しました（${node.name || node.type || '名称不明'}）。`
            });
            return;
        }
        if (seen.done.has(node)) {
            warnings.push({
                type: 'danger',
                message: `共有ノードを検出しました。複数の親から参照されているため、配管ツリーの一意性を確認してください（${node.name || node.type || '名称不明'}）。`
            });
            return;
        }
        seen.active.add(node);
        node.modelNumber = this.generateModelNumber(node, seriesId);

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                if (!child || typeof child !== 'object') {
                    warnings.push({
                        type: 'danger',
                        message: '配管ツリーに無効な子ノードがあります。計算から除外します。'
                    });
                    return;
                }
                if (seen.active.has(child)) {
                    warnings.push({
                        type: 'danger',
                        message: `循環参照を検出したため、その接続先の計算を停止しました（${child.name || child.type || '名称不明'}）。`
                    });
                    return;
                }
                if (seen.done.has(child)) {
                    warnings.push({
                        type: 'danger',
                        message: `共有ノードを検出しました。複数の親から参照されているため、配管ツリーの一意性を確認してください（${child.name || child.type || '名称不明'}）。`
                    });
                    return;
                }
                const childKw = this.getDownstreamCapacity(child);
                child.capacitySum = childKw;

                // 不正な長さ（非数値・非有限・負数）は 0m として集計する。
                // 従来は文字列の長さが集計に混ざり totalLength が文字列になった。
                // 未入力（undefined／null）は従来どおり 0m とし、警告は区間監査に任せる。
                const rawLen = child.length;
                const len = (typeof rawLen === 'number' && Number.isFinite(rawLen) && rawLen >= 0) ? rawLen : 0;
                if (rawLen !== undefined && rawLen !== null && len !== rawLen) {
                    warnings.push({
                        type: 'danger',
                        message: `配管長が未入力・非数値、または負数です。計算では0mとして集計します（${child.name || child.type || '名称不明'}）。`
                    });
                }
                totals.totalLength += len;

                if (seriesId === 'fsv_uxe3') {
                    // UXE3（冷暖フリー）3管・2管ハイブリッド判定
                    if (node.type === 'outdoor' || (node.type === 'branch' && !inSolenoidDownstream)) {
                        if (child.type === 'solenoid_kit' || child.type === 'branch') {
                            // 電磁弁キット上流の分岐区間も3管式として集計する
                            const sizes = this.selectPipeSizeForSegment('upstream_three_pipe', { outdoorKw: outdoorCap }, isManualSizeUp);
                            child.pipeSizeText = `液管: φ${sizes.liquid} / 吐出ガス: φ${sizes.dischargeGas} / 吸入ガス: φ${sizes.suctionGas}`;
                            child.pipes = { type: '3pipe', liquid: sizes.liquid, highGas: sizes.dischargeGas, lowGas: sizes.suctionGas };

                            totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                            totals.highGasPipes[sizes.dischargeGas] = (totals.highGasPipes[sizes.dischargeGas] || 0) + len;
                            totals.lowGasPipes[sizes.suctionGas] = (totals.lowGasPipes[sizes.suctionGas] || 0) + len;

                            this.processNodeSizing(child, seriesId, isManualSizeUp, child.type === 'solenoid_kit', outdoorCap, totals, warnings, seen);
                        } else {
                            // 直接接続
                            const sizes = this.selectPipeSizeForSegment('upstream_three_pipe', { outdoorKw: outdoorCap }, isManualSizeUp);
                            child.pipeSizeText = `液管: φ${sizes.liquid} / 吐出ガス: φ${sizes.dischargeGas} / 吸入ガス: φ${sizes.suctionGas}`;
                            child.pipes = { type: '3pipe', liquid: sizes.liquid, highGas: sizes.dischargeGas, lowGas: sizes.suctionGas };
                            
                            warnings.push({
                                type: 'danger',
                                message: `UXE3（冷暖フリー）系統では、室外機と室内機の間に電磁弁キットが必要です。(${child.name})`
                            });

                            this.processNodeSizing(child, seriesId, isManualSizeUp, false, outdoorCap, totals, warnings, seen);
                        }
                    } else if (inSolenoidDownstream) {
                        // 電磁弁キットから下流は2管式
                        const sizes = this.selectPipeSizeForSegment('downstream_two_pipe', { downstreamKw: childKw }, isManualSizeUp);
                        child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                        child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                        totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                        totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;

                        this.processNodeSizing(child, seriesId, isManualSizeUp, true, outdoorCap, totals, warnings, seen);
                    }
                } else {
                    // 通常の2管式 (UX3, オフィスパック)
                    const sizes = this.selectPipeSizeForSegment('downstream_two_pipe', { downstreamKw: childKw }, isManualSizeUp);
                    child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                    child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                    totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                    totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;

                    // 分岐継手は子ノードごとに重複集計せず、分岐ノード単位で集計する。

                    if (child.type === 'solenoid_kit') {
                        warnings.push({
                            type: 'danger',
                            message: `冷暖切換(UX3)またはオフィスパックに電磁弁キットは追加できません。接続を削除してください。`
                        });
                    }

                    this.processNodeSizing(child, seriesId, isManualSizeUp, false, outdoorCap, totals, warnings, seen);
                }
            });
        }

        // UX3等の2管式では、分岐ノードの下流合計容量で型番を決め、分岐1箇所につき1個集計する。
        if (node.type === 'branch' && seriesId !== 'fsv_uxe3') {
            node.jointModel = this.selectJointModel(this.getDownstreamCapacity(node));
            totals.joints[node.jointModel] = (totals.joints[node.jointModel] || 0) + 1;
        }

        if ((node.type === 'solenoid_kit') && node.modelNumber) {
            // UXE3では下流合計が160形キットの上限（16.0kW）を超える場合、
            // 160形キット2個の並列グループとして計上する（優先度C・実装順序5、C5）。
            // 品番は変えず台数だけが変わる。配管長はグループ単位の辺で1本分のみ
            // 集計し、2倍にしない（長さの計上は上の辺処理のまま）。
            const parallelCount = seriesId === 'fsv_uxe3' ? this.getSolenoidKitParallelCount(node) : 1;
            if (seriesId === 'fsv_uxe3') {
                node.parallelCount = parallelCount;
                if (parallelCount > 1) {
                    node.kitGroup = {
                        parallelCount,
                        modelNumber: node.modelNumber,
                        downstreamKw: this.getDownstreamCapacity(node),
                        indoorCount: this.countIndoorUnitsDownstream(node),
                        internalBranch: { branches: 2, lengthApportionment: 'not_determinable' }
                    };
                }
            }
            totals.joints[node.modelNumber] = (totals.joints[node.modelNumber] || 0) + parallelCount;
        }

        seen.active.delete(node);
        seen.done.add(node);
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
